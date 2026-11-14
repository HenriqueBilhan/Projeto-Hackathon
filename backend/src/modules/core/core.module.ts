import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../../database/entities';
import { AuditService } from './audit.service';
import { AuthContextService } from './auth-context.service';
import { NotificationsService } from './notifications.service';
import { PatientAccessService } from './patient-access.service';
import { SettingsService } from './settings.service';

/** Serviços transversais disponíveis em todos os módulos. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: [AuditService, AuthContextService, NotificationsService, PatientAccessService, SettingsService],
  exports: [TypeOrmModule, AuditService, AuthContextService, NotificationsService, PatientAccessService, SettingsService],
})
export class CoreModule {}
