import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessPermission, SystemSetting, CLINICAL_PROFILES, CLINICAL_RESOURCES } from '../../database/entities';
import { DEFAULT_SETTINGS } from '../../database/seeds/seed-data';

export type Settings = typeof DEFAULT_SETTINGS & Record<string, unknown>;

/** Configurações da plataforma e matriz de acesso clínico, com cache curto em memória. */
@Injectable()
export class SettingsService {
  private cache: { at: number; settings: Settings; matrix: Record<string, Record<string, boolean>> } | null = null;
  constructor(
    @InjectRepository(SystemSetting) private readonly settings: Repository<SystemSetting>,
    @InjectRepository(AccessPermission) private readonly access: Repository<AccessPermission>,
  ) {}

  private async load() {
    if (this.cache && Date.now() - this.cache.at < 15000) return this.cache;
    const rows = await this.settings.find();
    const settings = { ...DEFAULT_SETTINGS } as Settings;
    rows.forEach((r) => { (settings as any)[r.key] = r.value; });
    const matrix: Record<string, Record<string, boolean>> = {};
    (await this.access.find()).forEach((a) => { (matrix[a.profile] ||= {})[a.resource] = a.allowed; });
    this.cache = { at: Date.now(), settings, matrix };
    return this.cache;
  }
  invalidate() { this.cache = null; }

  async getAll() { return (await this.load()).settings; }
  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> { return (await this.load()).settings[key]; }

  async update(patch: Record<string, unknown>) {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await this.settings.upsert({ key, value: value as any }, ['key']);
    }
    this.invalidate();
    return this.getAll();
  }

  /** Perfil da matriz correspondente ao cargo do profissional. */
  static profileForCargo(cargo: string | null) {
    if (!cargo) return null;
    return (CLINICAL_PROFILES as readonly string[]).includes(cargo) ? cargo : null;
  }

  async can(cargo: string | null, resource: string) {
    const profile = SettingsService.profileForCargo(cargo);
    if (!profile) return false;
    return !!(await this.load()).matrix[profile]?.[resource];
  }

  async getMatrix() {
    const { matrix } = await this.load();
    return { perfis: [...CLINICAL_PROFILES], recursos: CLINICAL_RESOURCES.map((r) => ({ id: r.id, nome: r.name })), matriz: matrix };
  }

  async updateMatrix(matriz: Record<string, Record<string, boolean>>) {
    const valid = new Set(CLINICAL_RESOURCES.map((r) => r.id as string));
    const rows: Partial<AccessPermission>[] = [];
    for (const [profile, res] of Object.entries(matriz)) {
      if (!(CLINICAL_PROFILES as readonly string[]).includes(profile)) continue;
      for (const [resource, allowed] of Object.entries(res)) if (valid.has(resource)) rows.push({ profile, resource, allowed: !!allowed });
    }
    if (rows.length) await this.access.upsert(rows, ['profile', 'resource']);
    this.invalidate();
    return this.getMatrix();
  }
}
