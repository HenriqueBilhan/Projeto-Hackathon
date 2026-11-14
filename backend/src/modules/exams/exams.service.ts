import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Exam, ExamRequest, ExamResult } from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { nowWallClock, parseWallClock, todayWall } from '../../common/utils/dates';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { examDto, examRequestDto } from '../core/presenters';
import { CreateExamDto, CreateExamRequestDto, CreateExamResultDto, ExamQueryDto, ExamRequestQueryDto, UpdateExamRequestDto } from './exams.dto';

const FLOW = ['Solicitado', 'Agendado', 'Em andamento', 'Resultado disponível'];
const EXAM_STATUS: Record<string, string> = { Solicitado: 'Solicitado', Agendado: 'Agendado', 'Em andamento': 'Em análise', 'Resultado disponível': 'Resultado disponível', Cancelado: 'Cancelado' };

@Injectable()
export class ExamsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Exam) private readonly exams: Repository<Exam>,
    @InjectRepository(ExamRequest) private readonly requests: Repository<ExamRequest>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForPatient(user: AuthUser, patientId: string, q: Partial<ExamQueryDto> = {}) {
    const hidden = await this.access.hiddenUnitIdsFor(user);
    const qb = this.exams.createQueryBuilder('e').leftJoinAndSelect('e.results', 'r').where('e.patient_id = :patientId', { patientId });
    if (hidden.length) qb.andWhere('e.unit_id NOT IN (:...hidden)', { hidden });
    if (q.status) qb.andWhere('e.status = :s', { s: q.status });
    if (q.nome) qb.andWhere('e.name LIKE :n', { n: `%${q.nome}%` });
    const page = q.page || 1; const limit = q.limit || 200;
    qb.orderBy('e.performedAt', 'DESC').addOrderBy('e.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(examDto), total, { page, limit });
  }

  async list(user: AuthUser, q: ExamQueryDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso ao conteúdo clínico.', code: 'ADMIN_NO_CLINICAL' });
    if (user.role === 'paciente') return this.listForPatient(user, user.patientId!, q);
    if (q.pacienteId) { await this.access.assertClinicalAccess(user, q.pacienteId); return this.listForPatient(user, q.pacienteId, q); }
    const [col, dir] = resolveSort(q, { data: 'e.performedAt', nome: 'e.name' }, 'data');
    const qb = this.exams.createQueryBuilder('e').leftJoinAndSelect('e.results', 'r').where('e.requester_id = :pid', { pid: user.professionalId });
    if (q.status) qb.andWhere('e.status = :s', { s: q.status });
    qb.orderBy(col, dir).skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(examDto), total, q);
  }

  async get(user: AuthUser, id: string) {
    const e = await this.exams.findOne({ where: { id }, relations: { results: true } });
    if (!e) throw new NotFoundException('Exame não encontrado.');
    await this.access.assertClinicalAccess(user, e.patientId);
    if (user.role === 'profissional') await this.audit.log(user, 'Visualização de resultado de exame', { patientId: e.patientId });
    return examDto(e);
  }

  async createExam(user: AuthUser, dto: CreateExamDto) {
    await this.access.assertResource(user, dto.resultados?.length ? 'laudos' : 'exames');
    await this.access.getPatientOr404(dto.pacienteId);
    if (dto.data > todayWall()) throw new BadRequestException({ message: 'A data de realização não pode ser futura.', code: 'FUTURE_DATE' });
    const id = await this.ds.transaction(async (m) => {
      const hasResults = !!dto.resultados?.length;
      const e = await m.save(m.create(Exam, {
        patientId: dto.pacienteId, name: dto.nome.trim(), category: dto.categoria || 'Laboratorial', performedAt: dto.data, unitId: user.unitId!, requesterId: user.professionalId!,
        status: hasResults ? 'Resultado disponível' : 'Em análise', releasedAt: hasResults ? new Date() : null, releasedById: hasResults ? user.professionalId : null,
      }));
      if (hasResults) await m.insert(ExamResult, dto.resultados!.map((r, i) => ({ examId: e.id, position: i, parameter: r.parametro, value: r.valor, referenceRange: r.referencia || '—', isAbnormal: !!r.alterado })));
      return e.id;
    });
    await this.audit.log(user, 'Registro de exame', { patientId: dto.pacienteId });
    if (dto.resultados?.length) await this.notifications.notifyPatient(dto.pacienteId, 'Resultado disponível', `O resultado do exame ${dto.nome} já pode ser consultado.`, 'exames.html', 'flask-conical');
    return examDto(await this.exams.findOneOrFail({ where: { id }, relations: { results: true } }));
  }

  async listRequests(user: AuthUser, q: ExamRequestQueryDto) {
    const [col, dir] = resolveSort(q, { data: 'r.requestedAt', exame: 'r.examName', prioridade: 'r.priority' }, 'data');
    const qb = this.requests.createQueryBuilder('r');
    if (q.pacienteId) { await this.access.assertClinicalAccess(user, q.pacienteId); qb.where('r.patient_id = :pac', { pac: q.pacienteId }); }
    else if ((q.escopo || 'minhas') === 'unidade') qb.where('r.unit_id = :uid', { uid: user.unitId });
    else qb.where('r.professional_id = :pid', { pid: user.professionalId });
    if (q.status) qb.andWhere('r.status = :s', { s: q.status });
    qb.orderBy(col, dir).skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const res = paginated(items.map(examRequestDto), total, q);
    // Contagem por etapa (painel de fluxo) no mesmo escopo, sem o filtro de status.
    const countsBase = this.requests.createQueryBuilder('r').select('r.status', 'status').addSelect('COUNT(*)', 'n');
    if (q.pacienteId) countsBase.where('r.patient_id = :pac', { pac: q.pacienteId });
    else if ((q.escopo || 'minhas') === 'unidade') countsBase.where('r.unit_id = :uid', { uid: user.unitId });
    else countsBase.where('r.professional_id = :pid', { pid: user.professionalId });
    const counts = Object.fromEntries((await countsBase.groupBy('r.status').getRawMany()).map((c) => [c.status, Number(c.n)]));
    return { ...res, meta: { ...res.meta, porStatus: counts } };
  }

  async createRequest(user: AuthUser, dto: CreateExamRequestDto) {
    await this.access.assertResource(user, 'exames');
    if (dto.unidadeId !== user.unitId) throw new ForbiddenException({ message: 'A unidade solicitante deve ser a sua unidade de atuação.', code: 'UNIT_MISMATCH' });
    await this.access.getPatientOr404(dto.pacienteId);
    const id = await this.ds.transaction(async (m) => {
      const exam = await m.save(m.create(Exam, { patientId: dto.pacienteId, name: dto.exame.trim(), performedAt: todayWall(), unitId: dto.unidadeId, requesterId: user.professionalId!, status: 'Solicitado' }));
      const r = await m.save(m.create(ExamRequest, {
        patientId: dto.pacienteId, professionalId: user.professionalId!, unitId: dto.unidadeId, examId: exam.id, examName: dto.exame.trim(),
        justification: dto.justificativa.trim(), priority: dto.prioridade || 'Rotina', status: 'Solicitado', requestedAt: parseWallClock(nowWallClock()),
      }));
      return r.id;
    });
    await this.audit.log(user, 'Solicitação de exame', { patientId: dto.pacienteId, detail: dto.exame });
    await this.notifications.notifyPatient(dto.pacienteId, 'Exame solicitado', `${user.name} solicitou o exame ${dto.exame}.`, 'exames.html', 'flask-conical');
    return examRequestDto(await this.requests.findOneByOrFail({ id }));
  }

  /** Avança o fluxo (Solicitado → Agendado → Em andamento) ou cancela. O resultado é liberado via POST /exam-results. */
  async updateRequest(user: AuthUser, id: string, dto: UpdateExamRequestDto) {
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Solicitação não encontrada.');
    if (r.unitId !== user.unitId && r.professionalId !== user.professionalId) throw new ForbiddenException({ message: 'A solicitação pertence a outra unidade.', code: 'UNIT_MISMATCH' });
    if (r.status === 'Resultado disponível' || r.status === 'Cancelado') throw new BadRequestException({ message: `Solicitação já ${r.status === 'Cancelado' ? 'cancelada' : 'concluída'}.`, code: 'REQUEST_CLOSED' });
    if (dto.status !== 'Cancelado' && FLOW.indexOf(dto.status) !== FLOW.indexOf(r.status) + 1) {
      throw new BadRequestException({ message: `Transição inválida: ${r.status} → ${dto.status}.`, code: 'INVALID_TRANSITION' });
    }
    await this.ds.transaction(async (m) => {
      await m.update(ExamRequest, id, { status: dto.status });
      await m.update(Exam, r.examId, { status: EXAM_STATUS[dto.status] });
    });
    await this.audit.log(user, dto.status === 'Cancelado' ? 'Cancelamento de solicitação de exame' : 'Atualização de solicitação de exame', { patientId: r.patientId, detail: `${r.examName}: ${dto.status}` });
    if (dto.status === 'Agendado') await this.notifications.notifyPatient(r.patientId, 'Exame agendado', `O exame ${r.examName} foi agendado.`, 'exames.html', 'calendar-check');
    return examRequestDto(await this.requests.findOneByOrFail({ id }));
  }

  /** Liberação de laudo: grava os resultados e conclui o fluxo da solicitação. */
  async releaseResult(user: AuthUser, dto: CreateExamResultDto) {
    await this.access.assertResource(user, 'laudos');
    const e = await this.exams.findOne({ where: { id: dto.exameId } });
    if (!e) throw new NotFoundException('Exame não encontrado.');
    if (e.status === 'Cancelado') throw new BadRequestException({ message: 'Exame cancelado.', code: 'REQUEST_CLOSED' });
    await this.access.assertClinicalAccess(user, e.patientId);
    if (dto.data && dto.data > todayWall()) throw new BadRequestException({ message: 'A data de realização não pode ser futura.', code: 'FUTURE_DATE' });
    await this.ds.transaction(async (m) => {
      await m.delete(ExamResult, { examId: e.id });
      await m.insert(ExamResult, dto.resultados.map((r, i) => ({ examId: e.id, position: i, parameter: r.parametro.trim(), value: r.valor.trim(), referenceRange: r.referencia?.trim() || '—', isAbnormal: !!r.alterado })));
      await m.update(Exam, e.id, { status: 'Resultado disponível', performedAt: dto.data || todayWall(), releasedAt: new Date(), releasedById: user.professionalId });
      await m.update(ExamRequest, { examId: e.id }, { status: 'Resultado disponível' });
    });
    await this.audit.log(user, 'Liberação de laudo', { patientId: e.patientId, detail: e.name });
    await this.notifications.notifyPatient(e.patientId, 'Resultado disponível', `O resultado do exame ${e.name} já pode ser consultado.`, 'exames.html', 'flask-conical');
    if (e.requesterId !== user.professionalId) await this.notifications.notifyProfessional(e.requesterId, 'Resultado de exame', `Resultado de ${e.name} liberado.`, 'solicitar-exame.html', 'flask-conical');
    return examDto(await this.exams.findOneOrFail({ where: { id: e.id }, relations: { results: true } }));
  }
}
