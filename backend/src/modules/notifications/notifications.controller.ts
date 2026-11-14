import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../../database/entities';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { notificationDto } from '../core/presenters';

class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) naoLidas?: string;
}

@ApiTags('Notificações') @ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@InjectRepository(Notification) private readonly repo: Repository<Notification>) {}

  @Get() @RequirePermissions('notifications:read')
  async list(@CurrentUser() u: AuthUser, @Query() q: NotificationQueryDto) {
    const where = { userId: u.userId, ...(q.naoLidas === 'true' ? { readAt: IsNull() } : {}) };
    const [items, total] = await this.repo.findAndCount({ where, order: { createdAt: 'DESC' }, skip: (q.page - 1) * q.limit, take: q.limit });
    const unread = await this.repo.count({ where: { userId: u.userId, readAt: IsNull() } });
    const res = paginated(items.map(notificationDto), total, q);
    return { ...res, meta: { ...res.meta, naoLidas: unread } };
  }

  @Patch('read-all') @RequirePermissions('notifications:read')
  async readAll(@CurrentUser() u: AuthUser) {
    const r = await this.repo.update({ userId: u.userId, readAt: IsNull() }, { readAt: new Date() });
    return { atualizadas: r.affected || 0 };
  }

  @Patch(':id/read') @RequirePermissions('notifications:read')
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const n = await this.repo.findOne({ where: { id, userId: u.userId } });
    if (!n) throw new NotFoundException('Notificação não encontrada.');
    if (!n.readAt) await this.repo.update(id, { readAt: new Date() });
    return notificationDto({ ...n, readAt: n.readAt || new Date() });
  }
}
