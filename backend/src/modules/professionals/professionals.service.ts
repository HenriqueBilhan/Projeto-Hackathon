import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull, Repository } from 'typeorm';
import { HealthUnit, Professional, ProfessionalSpecialty, Role, User, UserSession } from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { isValidCpf, onlyDigits } from '../../common/utils/documents';
import { config } from '../../config/configuration';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { AuthContextService } from '../core/auth-context.service';
import { professionalDto } from '../core/presenters';
import { CreateProfessionalDto, ProfessionalQueryDto, UpdateProfessionalDto } from './professionals.dto';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Professional) private readonly repo: Repository<Professional>,
    @InjectRepository(ProfessionalSpecialty) private readonly specialties: Repository<ProfessionalSpecialty>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly ctx: AuthContextService,
  ) {}

  private async specialtyId(name: string) {
    const s = await this.specialties.findOne({ where: { name } });
    if (!s) throw new BadRequestException({ message: `Especialidade "${name}" não está no catálogo.`, code: 'SPECIALTY_UNKNOWN' });
    return s.id;
  }

  listSpecialties() { return this.specialties.find({ order: { name: 'ASC' } }).then((r) => r.map((s) => ({ id: s.id, nome: s.name, cbo: s.cbo }))); }

  async list(user: AuthUser, q: ProfessionalQueryDto) {
    const [col, dir] = resolveSort(q, { nome: 'p.name', cadastro: 'p.createdAt', especialidade: 's.name' }, 'nome');
    const qb = this.repo.createQueryBuilder('p').leftJoinAndSelect('p.specialty', 's');
    if (q.q) qb.andWhere('(p.name LIKE :q OR p.registration LIKE :q)', { q: `%${q.q}%` });
    if (q.unidadeId) qb.andWhere('p.unit_id = :u', { u: q.unidadeId });
    if (q.especialidade) qb.andWhere('s.name = :e', { e: q.especialidade });
    if (q.cargo) qb.andWhere('p.cargo = :c', { c: q.cargo });
    if (q.ativo !== undefined) qb.andWhere('p.active = :a', { a: q.ativo ? 1 : 0 });
    if (user.role !== 'admin') qb.andWhere('p.active = 1');
    qb.orderBy(col, q.sort ? dir : 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map((p) => professionalDto(p, user.role === 'admin')), total, q);
  }

  async get(user: AuthUser, id: string) {
    const p = await this.repo.findOne({ where: { id }, relations: { specialty: true } });
    if (!p || (user.role !== 'admin' && !p.active)) throw new NotFoundException('Profissional não encontrado.');
    return professionalDto(p, user.role === 'admin' || user.professionalId === id);
  }

  async create(user: AuthUser, dto: CreateProfessionalDto) {
    const cpf = onlyDigits(dto.cpf);
    if (!isValidCpf(cpf)) throw new BadRequestException({ message: 'CPF inválido.', code: 'INVALID_CPF' });
    if (await this.users.exist({ where: { cpf } })) throw new ConflictException({ message: 'Já existe um usuário com este CPF.', code: 'CPF_IN_USE' });
    if (!(await this.ds.getRepository(HealthUnit).exist({ where: { id: dto.unidadeId } }))) throw new BadRequestException({ message: 'Unidade inexistente.', code: 'UNIT_UNKNOWN' });
    const specialtyId = await this.specialtyId(dto.especialidade);
    const passwordHash = await bcrypt.hash(dto.senha, config.security.bcryptRounds);
    const id = await this.ds.transaction(async (m) => {
      const p = await m.save(m.create(Professional, {
        name: dto.nome.trim(), cpf, cargo: dto.cargo as any, registration: dto.registro.trim(), specialtyId, unitId: dto.unidadeId,
        email: dto.email, phone: dto.telefone || null, active: dto.ativo ?? true,
      }));
      const role = await m.findOneByOrFail(Role, { code: 'profissional' });
      await m.save(m.create(User, { cpf, name: p.name, email: p.email, roleId: role.id, professionalId: p.id, passwordHash, active: true, title: dto.cargo }));
      return p.id;
    });
    await this.audit.log(user, 'Cadastro de profissional', { detail: dto.nome });
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProfessionalDto) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Profissional não encontrado.');
    const patch: Partial<Professional> = {
      ...(dto.nome !== undefined && { name: dto.nome.trim() }), ...(dto.cargo !== undefined && { cargo: dto.cargo as any }),
      ...(dto.registro !== undefined && { registration: dto.registro.trim() }), ...(dto.unidadeId !== undefined && { unitId: dto.unidadeId }),
      ...(dto.email !== undefined && { email: dto.email }), ...(dto.telefone !== undefined && { phone: dto.telefone || null }),
      ...(dto.ativo !== undefined && { active: dto.ativo }),
    };
    if (dto.especialidade) patch.specialtyId = await this.specialtyId(dto.especialidade);
    await this.ds.transaction(async (m) => {
      if (Object.keys(patch).length) await m.update(Professional, id, patch);
      const u = await m.findOne(User, { where: { professionalId: id } });
      if (u) {
        await m.update(User, u.id, { ...(dto.nome && { name: dto.nome.trim() }), ...(dto.email && { email: dto.email }), ...(dto.cargo && { title: dto.cargo }),
          ...(dto.novaSenha && { passwordHash: await bcrypt.hash(dto.novaSenha, config.security.bcryptRounds), failedLoginAttempts: 0, lockedUntil: null }) });
        // Desativação ou troca de senha encerra as sessões ativas.
        if (dto.ativo === false || dto.novaSenha) await m.update(UserSession, { userId: u.id, revokedAt: IsNull() }, { revokedAt: new Date() });
        this.ctx.invalidate(u.id);
      }
    });
    const op = dto.ativo === false ? 'Desativação de acesso' : dto.ativo === true && !p.active ? 'Ativação de acesso' : 'Edição de profissional';
    await this.audit.log(user, op, { detail: dto.nome || p.name });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Profissional não encontrado.');
    // Registros clínicos referenciam o profissional (RESTRICT): nesse caso a exclusão é bloqueada (409) e deve-se desativar.
    await this.ds.transaction(async (m) => {
      await m.delete(User, { professionalId: id });
      await m.delete(Professional, id);
    });
    this.ctx.invalidate();
    await this.audit.log(user, 'Exclusão de profissional', { detail: p.name });
    return { id };
  }
}
