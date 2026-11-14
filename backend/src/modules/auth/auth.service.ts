import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Patient, Role, User, UserSession } from '../../database/entities';
import { config } from '../../config/configuration';
import { isValidCns, isValidCpf, maskCpf, onlyDigits } from '../../common/utils/documents';
import { randomToken, sha256 } from '../../common/utils/hash';
import { JWT_AUDIENCE, JWT_ISSUER } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { SettingsService } from '../core/settings.service';
import { AuthContextService } from '../core/auth-context.service';
import { LoginDto, RegisterDto } from './auth.dto';

interface ClientMeta { ip: string; userAgent: string }
// Hash descartável usado para equalizar o tempo de resposta quando o CPF não existe (evita enumeração de contas).
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ||= bcrypt.hashSync(randomToken(12), config.security.bcryptRounds));

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly ctx: AuthContextService,
  ) {}

  async login(dto: LoginDto, meta: ClientMeta) {
    const cpf = onlyDigits(dto.cpf);
    const fail = () => new UnauthorizedException({ message: 'CPF ou senha incorretos. Verifique os dados e tente novamente.', code: 'INVALID_CREDENTIALS' });
    if (!isValidCpf(cpf)) throw new BadRequestException({ message: 'Informe um CPF válido.', code: 'INVALID_CPF' });
    const user = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').leftJoinAndSelect('u.role', 'r').leftJoinAndSelect('u.professional', 'pr')
      .where('u.cpf = :cpf', { cpf }).getOne();
    if (!user) {
      await bcrypt.compare(dto.senha, getDummyHash());
      await this.audit.log(null, 'Falha de login', { userName: `CPF ${maskCpf(cpf)}`, success: false, ip: meta.ip });
      throw fail();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException({ message: `Acesso bloqueado temporariamente por excesso de tentativas. Tente novamente em ${min} minuto(s).`, code: 'ACCOUNT_LOCKED' });
    }
    const ok = await bcrypt.compare(dto.senha, user.passwordHash);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= config.security.maxLoginAttempts;
      await this.users.update(user.id, { failedLoginAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + config.security.lockMinutes * 60000) : null });
      await this.audit.log({ userId: user.id, name: user.name, role: user.role.code as any, unitId: user.professional?.unitId ?? null, ip: meta.ip, cargo: null }, lock ? 'Conta bloqueada por tentativas' : 'Falha de login', { success: false });
      throw fail();
    }
    const role = user.role.code;
    if (dto.perfil === 'paciente' && role !== 'paciente') throw new UnauthorizedException({ message: 'Este CPF pertence a um profissional ou gestor. Selecione "Profissional de saúde".', code: 'WRONG_PROFILE' });
    if (dto.perfil === 'profissional' && role === 'paciente') throw new UnauthorizedException({ message: 'Este CPF pertence a um paciente. Selecione "Paciente".', code: 'WRONG_PROFILE' });
    if (!user.active || (user.professional && !user.professional.active)) throw new ForbiddenException({ message: 'Conta desativada. Procure o gestor da unidade.', code: 'ACCOUNT_DISABLED' });

    await this.users.update(user.id, { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
    const tokens = await this.createSession(user.id, meta);
    const me = await this.me(user.id);
    await this.audit.log({ userId: user.id, name: user.name, role: role as any, unitId: me.unidadeId, ip: meta.ip, cargo: me.cargo }, 'Login na plataforma');
    return { ...tokens, user: me };
  }

  private async createSession(userId: string, meta: ClientMeta) {
    const refreshToken = randomToken();
    const session = await this.sessions.save(this.sessions.create({
      userId, refreshTokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 86400000),
      userAgent: meta.userAgent?.slice(0, 255) || null, ip: meta.ip || null,
    }));
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: session.id }, { expiresIn: config.jwt.accessTtl, issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    return { accessToken, expiresIn: config.jwt.accessTtl, refreshToken, sessionId: session.id };
  }

  /** Rotação do refresh token. Reuso de token já rotacionado revoga todas as sessões do usuário. */
  async refresh(refreshToken: string | undefined, meta: ClientMeta) {
    if (!refreshToken) throw new UnauthorizedException({ message: 'Sessão não encontrada.', code: 'REFRESH_MISSING' });
    const session = await this.sessions.findOne({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!session) throw new UnauthorizedException({ message: 'Sessão inválida.', code: 'REFRESH_INVALID' });
    if (session.revokedAt) {
      if (session.replacedBy) {
        await this.sessions.update({ userId: session.userId, revokedAt: IsNull() }, { revokedAt: new Date() });
        const u = await this.users.findOne({ where: { id: session.userId }, relations: { role: true } });
        if (u) await this.audit.log({ userId: u.id, name: u.name, role: u.role.code as any, unitId: null, ip: meta.ip, cargo: null }, 'Reuso de token detectado', { success: false, detail: 'Todas as sessões foram revogadas' });
      }
      throw new UnauthorizedException({ message: 'Sessão encerrada.', code: 'REFRESH_REVOKED' });
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException({ message: 'Sessão expirada.', code: 'REFRESH_EXPIRED' });
    const idleMinutes = Number(await this.settings.get('expirarSessao')) || 30;
    const lastActivity = session.createdAt.getTime();
    if (Date.now() - lastActivity > Math.max(idleMinutes * 60000, config.jwt.accessTtl * 1000 + 60000)) {
      await this.sessions.update(session.id, { revokedAt: new Date() });
      throw new UnauthorizedException({ message: 'Sessão encerrada por inatividade.', code: 'SESSION_IDLE' });
    }
    const user = await this.users.findOne({ where: { id: session.userId }, relations: { professional: true } });
    if (!user || !user.active || (user.professional && !user.professional.active)) throw new UnauthorizedException({ message: 'Conta desativada.', code: 'ACCOUNT_DISABLED' });
    const tokens = await this.createSession(user.id, meta);
    await this.sessions.update(session.id, { revokedAt: new Date(), replacedBy: tokens.sessionId });
    return { ...tokens, user: await this.me(user.id) };
  }

  async logout(user: AuthUser | null, refreshToken?: string) {
    if (user) await this.sessions.update({ id: user.sessionId }, { revokedAt: new Date() });
    if (refreshToken) await this.sessions.update({ refreshTokenHash: sha256(refreshToken), revokedAt: IsNull() }, { revokedAt: new Date() });
    if (user) await this.audit.log(user, 'Logout');
  }

  /** Cadastro de paciente. Vincula a conta a um cadastro já feito pela unidade quando CPF+CNS+nascimento conferem. */
  async register(dto: RegisterDto, meta: ClientMeta) {
    const cpf = onlyDigits(dto.cpf); const cns = onlyDigits(dto.cns);
    if (!isValidCpf(cpf)) throw new BadRequestException({ message: 'CPF inválido.', code: 'INVALID_CPF', details: [{ field: 'cpf' }] });
    if (!isValidCns(cns)) throw new BadRequestException({ message: 'CNS inválido.', code: 'INVALID_CNS', details: [{ field: 'cns' }] });
    if (new Date(dto.nascimento) >= new Date()) throw new BadRequestException({ message: 'Data de nascimento inválida.', code: 'INVALID_BIRTH' });
    if (await this.users.exist({ where: { cpf } })) throw new ConflictException({ message: 'Já existe uma conta para este CPF.', code: 'CPF_IN_USE' });
    const role = await this.roles.findOneByOrFail({ code: 'paciente' });
    const passwordHash = await bcrypt.hash(dto.senha, config.security.bcryptRounds);
    const userId = await this.ds.transaction(async (m) => {
      let patient = await m.findOne(Patient, { where: { cpf } });
      if (patient) {
        if (patient.cns !== cns || patient.birthDate !== dto.nascimento) throw new ConflictException({ message: 'Os dados não conferem com o cadastro existente na unidade. Procure a recepção.', code: 'PATIENT_MISMATCH' });
      } else {
        if (await m.exists(Patient, { where: { cns } })) throw new ConflictException({ message: 'CNS já cadastrado para outro paciente.', code: 'CNS_IN_USE' });
        patient = await m.save(m.create(Patient, { name: dto.nome.trim(), cpf, cns, birthDate: dto.nascimento, email: dto.email, phone: dto.telefone || null, shareConsent: true }));
      }
      const u = await m.save(m.create(User, { cpf, name: patient.name, email: dto.email, roleId: role.id, patientId: patient.id, passwordHash, active: true }));
      return u.id;
    });
    await this.audit.log({ userId, name: dto.nome.trim(), role: 'paciente', unitId: null, ip: meta.ip, cargo: null }, 'Cadastro de conta de paciente');
    return { id: userId, message: 'Conta criada. Faça login com seu CPF e senha.' };
  }

  async forgotPassword(cpfRaw: string, email: string) {
    const cpf = onlyDigits(cpfRaw);
    const user = await this.users.findOne({ where: { cpf } });
    const generic = { message: 'Se os dados estiverem corretos, as instruções de redefinição serão enviadas.' };
    if (!user || !user.email || user.email.toLowerCase() !== email.toLowerCase()) return generic;
    const token = randomToken(32);
    await this.users.update(user.id, { passwordResetHash: sha256(token), passwordResetExpires: new Date(Date.now() + 30 * 60000) });
    await this.audit.log({ userId: user.id, name: user.name, role: 'paciente', unitId: null, ip: '', cargo: null }, 'Solicitação de redefinição de senha');
    // Sem provedor de e-mail configurado: em desenvolvimento o token é devolvido para permitir o fluxo completo.
    return config.security.exposeResetToken ? { ...generic, resetToken: token, expiresInMinutes: 30 } : generic;
  }

  async resetPassword(token: string, novaSenha: string) {
    const user = await this.users.createQueryBuilder('u').addSelect(['u.passwordResetExpires']).where('u.password_reset_hash = :h', { h: sha256(token) }).getOne();
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) throw new BadRequestException({ message: 'Link de redefinição inválido ou expirado.', code: 'RESET_INVALID' });
    await this.users.update(user.id, { passwordHash: await bcrypt.hash(novaSenha, config.security.bcryptRounds), passwordResetHash: null, passwordResetExpires: null, failedLoginAttempts: 0, lockedUntil: null });
    await this.sessions.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    this.ctx.invalidate(user.id);
    return { message: 'Senha redefinida. Faça login novamente.' };
  }

  /** Dados da sessão no formato usado pelo frontend. */
  async me(userId: string) {
    const u = await this.users.findOneOrFail({ where: { id: userId }, relations: { role: { permissions: true }, professional: { specialty: true, unit: true } } });
    return {
      id: u.id, role: u.role.code, nome: u.name, cpf: maskCpf(u.cpf), email: u.email, cargoTitulo: u.title,
      refId: u.patientId || u.professionalId || u.id, pacienteId: u.patientId, profissionalId: u.professionalId,
      unidadeId: u.professional?.unitId ?? null, unidadeNome: u.professional?.unit?.name ?? null,
      cargo: u.professional?.cargo ?? null, especialidade: u.professional?.specialty?.name ?? null, registro: u.professional?.registration ?? null,
      permissoes: u.role.permissions.map((p) => p.code), ultimoAcesso: u.lastLoginAt?.toISOString() ?? null,
    };
  }
}
