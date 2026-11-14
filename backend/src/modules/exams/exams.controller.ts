import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { CreateExamDto, CreateExamRequestDto, CreateExamResultDto, ExamQueryDto, ExamRequestQueryDto, UpdateExamRequestDto } from './exams.dto';
import { ExamsService } from './exams.service';

@ApiTags('Exames') @ApiBearerAuth()
@Controller()
export class ExamsController {
  constructor(private readonly svc: ExamsService) {}

  @Get('exams') @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Lista exames (paciente: os seus; profissional: por paciente ou solicitados por ele)' })
  list(@CurrentUser() u: AuthUser, @Query() q: ExamQueryDto) { return this.svc.list(u, q); }

  @Get('exams/:id') @Roles('paciente', 'profissional')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post('exams') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Registra exame realizado (com ou sem resultado)' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateExamDto) { return this.svc.createExam(u, dto); }

  @Get('exam-requests') @RequirePermissions('clinical:read') @ApiOperation({ summary: 'Lista solicitações (escopo: minhas | unidade | paciente) com contagem por etapa' })
  listRequests(@CurrentUser() u: AuthUser, @Query() q: ExamRequestQueryDto) { return this.svc.listRequests(u, q); }

  @Post('exam-requests') @RequirePermissions('clinical:write')
  createRequest(@CurrentUser() u: AuthUser, @Body() dto: CreateExamRequestDto) { return this.svc.createRequest(u, dto); }

  @Patch('exam-requests/:id') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Avança a etapa ou cancela a solicitação' })
  updateRequest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamRequestDto) { return this.svc.updateRequest(u, id, dto); }

  @Post('exam-results') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Libera o laudo (resultados) de um exame' })
  release(@CurrentUser() u: AuthUser, @Body() dto: CreateExamResultDto) { return this.svc.releaseResult(u, dto); }
}
