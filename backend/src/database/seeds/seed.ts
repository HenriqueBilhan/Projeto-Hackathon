import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccessPermission, Permission, ProfessionalSpecialty, Role, SystemSetting, User } from '../entities';
import { isValidCpf, onlyDigits } from '../../common/utils/documents';
import { ACCESS_MATRIX, DEFAULT_SETTINGS, PERMISSIONS, ROLES, SPECIALTIES } from './seed-data';

export interface SeedOptions { adminCpf?: string; adminPassword?: string; adminName?: string; adminEmail?: string; bcryptRounds?: number; log?: (m: string) => void }

/** Seed idempotente: pode ser executado várias vezes sem duplicar registros. */
export async function runSeed(ds: DataSource, opts: SeedOptions = {}) {
  const log = opts.log || (() => undefined);
  await ds.transaction(async (m) => {
    const permRepo = m.getRepository(Permission);
    for (const [code, description] of Object.entries(PERMISSIONS)) {
      await permRepo.upsert({ code, description }, ['code']);
    }
    const perms = await permRepo.find();
    const roleRepo = m.getRepository(Role);
    for (const [code, def] of Object.entries(ROLES)) {
      let role = await roleRepo.findOne({ where: { code }, relations: { permissions: true } });
      if (!role) role = roleRepo.create({ code });
      role.name = def.name;
      role.permissions = perms.filter((p) => def.permissions.includes(p.code));
      await roleRepo.save(role);
    }
    log(`Papéis: ${Object.keys(ROLES).join(', ')} · permissões: ${perms.length}`);

    const apRepo = m.getRepository(AccessPermission);
    const existing = await apRepo.count();
    if (!existing) {
      const rows = Object.entries(ACCESS_MATRIX).flatMap(([profile, res]) => Object.entries(res).map(([resource, allowed]) => ({ profile, resource, allowed })));
      await apRepo.insert(rows);
      log(`Matriz de acesso clínico: ${rows.length} regras`);
    }
    const setRepo = m.getRepository(SystemSetting);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(await setRepo.findOne({ where: { key } }))) await setRepo.insert({ key, value: value as any });
    }
    const spRepo = m.getRepository(ProfessionalSpecialty);
    for (const name of SPECIALTIES) {
      if (!(await spRepo.findOne({ where: { name } }))) await spRepo.insert({ name, cbo: null });
    }

    if (opts.adminCpf && opts.adminPassword) {
      const cpf = onlyDigits(opts.adminCpf);
      if (!isValidCpf(cpf)) throw new Error('ADMIN_CPF inválido.');
      if (opts.adminPassword.length < 8) throw new Error('ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');
      const userRepo = m.getRepository(User);
      if (!(await userRepo.findOne({ where: { cpf } }))) {
        const adminRole = await roleRepo.findOneByOrFail({ code: 'admin' });
        await userRepo.insert({
          cpf, name: opts.adminName || 'Administrador da rede', email: opts.adminEmail || null, title: 'Gestor(a) da rede',
          roleId: adminRole.id, passwordHash: await bcrypt.hash(opts.adminPassword, opts.bcryptRounds || 12), active: true,
        });
        log('Administrador inicial criado.');
      }
    } else log('ADMIN_CPF/ADMIN_PASSWORD não informados: administrador inicial não criado.');
  });
}
