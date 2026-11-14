import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Attendance, ExternalEstablishment, HealthUnit, HealthUnitIntegration, Professional } from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { todayWall } from '../../common/utils/dates';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { unitDto } from '../core/presenters';
import { MinisterioSaudeService } from '../../integrations/ministerio-saude/ministerio-saude.service';
import { categoryFromTipoUnidade, establishmentAddress } from '../../integrations/ministerio-saude/ministerio-saude.mapper';
import { CreateHealthUnitDto, HealthUnitQueryDto, UpdateHealthUnitDto } from './health-units.dto';

@Injectable()
export class HealthUnitsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(HealthUnit) private readonly units: Repository<HealthUnit>,
    @InjectRepository(HealthUnitIntegration) private readonly integrations: Repository<HealthUnitIntegration>,
    @InjectRepository(Attendance) private readonly attendances: Repository<Attendance>,
    @InjectRepository(Professional) private readonly professionals: Repository<Professional>,
    private readonly audit: AuditService,
    private readonly ms: MinisterioSaudeService,
  ) {}

  /** Volume real: atendimentos finalizados nos últimos 30 dias por unidade. */
  private async volumes(): Promise<Record<string, number>> {
    const rows = await this.attendances.createQueryBuilder('a').select('a.unit_id', 'unitId').addSelect('COUNT(*)', 'n')
      .where("a.status = 'Finalizado'").andWhere('a.occurred_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)').groupBy('a.unit_id').getRawMany();
    return Object.fromEntries(rows.map((r) => [r.unitId, Number(r.n)]));
  }

  async list(q: HealthUnitQueryDto) {
    const [col, dir] = resolveSort(q, { nome: 'u.name', tipo: 'u.category', criado: 'u.createdAt' }, 'nome');
    const qb = this.units.createQueryBuilder('u').leftJoinAndSelect('u.integration', 'i');
    if (q.q) qb.andWhere('(u.name LIKE :q OR u.address LIKE :q OR u.cnes LIKE :q)', { q: `%${q.q}%` });
    if (q.tipo) qb.andWhere('u.category = :t', { t: q.tipo });
    if (q.integrada !== undefined) qb.andWhere('COALESCE(i.sharing_enabled, 0) = :ig', { ig: q.integrada ? 1 : 0 });
    qb.orderBy(col, q.sort ? dir : 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const vol = await this.volumes();
    return paginated(items.map((u) => unitDto(u, { volume: vol[u.id] || 0 })), total, q);
  }

  async findEntity(id: string) {
    const u = await this.units.findOne({ where: { id }, relations: { integration: true } });
    if (!u) throw new NotFoundException('Unidade não encontrada.');
    return u;
  }
  async get(id: string) {
    const u = await this.findEntity(id);
    const vol = await this.volumes();
    const profissionais = await this.professionals.count({ where: { unitId: id, active: true } });
    return { ...unitDto(u, { volume: vol[id] || 0 }), profissionais };
  }

  async create(user: AuthUser, dto: CreateHealthUnitDto) {
    if (dto.cnes && (await this.units.exist({ where: { cnes: dto.cnes } }))) throw new ConflictException({ message: 'Já existe uma unidade com este CNES.', code: 'CNES_IN_USE' });
    const saved = await this.ds.transaction(async (m) => {
      const u = await m.save(m.create(HealthUnit, {
        name: dto.nome.trim(), category: dto.tipo as any, cnes: dto.cnes || null, address: dto.endereco.trim(), phone: dto.telefone || null,
        technicalManager: dto.responsavel || null, openingHours: dto.horario || null, codigoMunicipio: dto.codigoMunicipio || null,
      }));
      await m.save(m.create(HealthUnitIntegration, { unitId: u.id, sharingEnabled: !!dto.integrada, integratedSince: dto.integrada ? todayWall() : null }));
      return u;
    });
    await this.audit.log(user, 'Cadastro de unidade', { detail: dto.nome });
    return this.get(saved.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateHealthUnitDto) {
    const u = await this.findEntity(id);
    if (dto.cnes && dto.cnes !== u.cnes && (await this.units.exist({ where: { cnes: dto.cnes } }))) throw new ConflictException({ message: 'Já existe uma unidade com este CNES.', code: 'CNES_IN_USE' });
    await this.units.update(id, {
      ...(dto.nome !== undefined && { name: dto.nome.trim() }), ...(dto.tipo !== undefined && { category: dto.tipo as any }),
      ...(dto.cnes !== undefined && { cnes: dto.cnes || null }), ...(dto.endereco !== undefined && { address: dto.endereco.trim() }),
      ...(dto.telefone !== undefined && { phone: dto.telefone || null }), ...(dto.responsavel !== undefined && { technicalManager: dto.responsavel || null }),
      ...(dto.horario !== undefined && { openingHours: dto.horario || null }), ...(dto.codigoMunicipio !== undefined && { codigoMunicipio: dto.codigoMunicipio || null }),
      ...(dto.ativa !== undefined && { active: dto.ativa }),
    });
    if (dto.integrada !== undefined) {
      const integ = u.integration || this.integrations.create({ unitId: id });
      if (dto.integrada && !integ.integratedSince) integ.integratedSince = todayWall();
      integ.sharingEnabled = dto.integrada;
      await this.integrations.save(integ);
      await this.audit.log(user, dto.integrada ? 'Compartilhamento liberado' : 'Compartilhamento bloqueado', { detail: u.name });
    }
    await this.audit.log(user, 'Edição de unidade', { detail: dto.nome || u.name });
    return this.get(id);
  }

  async remove(user: AuthUser, id: string) {
    const u = await this.findEntity(id);
    const linked = await this.professionals.count({ where: { unitId: id } });
    if (linked) throw new ConflictException({ message: `Não é possível excluir: ${linked} profissional(is) vinculado(s) a esta unidade.`, code: 'UNIT_IN_USE' });
    await this.units.delete(id); // registros clínicos usam RESTRICT: o filtro global devolve 409 se houver vínculos
    await this.audit.log(user, 'Exclusão de unidade', { detail: u.name });
    return { id };
  }

  /** Cria uma unidade a partir de um estabelecimento real do CNES (sincronizado ou consultado na API). */
  async importFromCnes(user: AuthUser, codigo: string, integrada = false) {
    const cnes = codigo.padStart(7, '0');
    if (await this.units.exist({ where: { cnes } })) throw new ConflictException({ message: 'Este estabelecimento já está cadastrado como unidade.', code: 'CNES_IN_USE' });
    let est: ExternalEstablishment | null = await this.ds.getRepository(ExternalEstablishment).findOne({ where: { codigoCnes: cnes } });
    if (!est) est = await this.ms.refreshEstablishment(cnes);
    if (!est) throw new NotFoundException({ message: 'Estabelecimento não encontrado no CNES.', code: 'CNES_NOT_FOUND' });
    const category = categoryFromTipoUnidade(est.codigoTipoUnidade);
    if (!category) throw new BadRequestException({ message: 'O tipo deste estabelecimento não corresponde a uma categoria de unidade do Conecta (UBS, UPA, hospital, laboratório ou clínica).', code: 'CNES_TYPE_UNSUPPORTED' });
    const r = await this.create(user, {
      nome: est.nomeFantasia || est.nomeRazaoSocial, tipo: category, cnes, endereco: establishmentAddress(est),
      telefone: est.numeroTelefoneEstabelecimento?.slice(0, 40) || undefined, horario: est.descricaoTurnoAtendimento?.slice(0, 80) || undefined,
      codigoMunicipio: est.codigoMunicipio || undefined, integrada,
    });
    await this.audit.log(user, 'Importação de unidade do CNES', { detail: `CNES ${cnes}` });
    return r;
  }

  /** Diretório público (portal): somente dados institucionais, sem qualquer dado de paciente. */
  async publicDirectory(q: HealthUnitQueryDto) {
    const qb = this.units.createQueryBuilder('u').leftJoinAndSelect('u.integration', 'i').where('u.active = 1');
    if (q.q) qb.andWhere('(u.name LIKE :q OR u.address LIKE :q)', { q: `%${q.q}%` });
    if (q.tipo) qb.andWhere('u.category = :t', { t: q.tipo });
    qb.orderBy('u.name', 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const esp = await this.professionals.createQueryBuilder('p').innerJoin('p.specialty', 's').select('p.unit_id', 'unitId').addSelect('GROUP_CONCAT(DISTINCT s.name ORDER BY s.name)', 'esp')
      .where('p.active = 1').groupBy('p.unit_id').getRawMany();
    const espMap = Object.fromEntries(esp.map((r) => [r.unitId, String(r.esp || '').split(',').filter(Boolean)]));
    return paginated(items.map((u) => {
      const d = unitDto(u);
      return { id: d.id, nome: d.nome, tipo: d.tipo, cnes: d.cnes, endereco: d.endereco, telefone: d.telefone, horario: d.horario, integrada: d.integrada, status: d.status, especialidades: espMap[u.id] || [] };
    }), total, q);
  }
}
