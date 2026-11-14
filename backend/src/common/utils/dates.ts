/**
 * Convenções de data/hora:
 *  - Horários clínicos (atendimentos, consultas, solicitações) são "hora de parede" da unidade,
 *    trafegam como "AAAA-MM-DDTHH:mm" (sem fuso) e são gravados exatamente assim (processo em UTC).
 *  - Instantes do sistema (auditoria, notificações, sincronizações) trafegam em ISO-8601 com "Z".
 */
import { config } from '../../config/configuration';

/** Date (lida do MySQL) → "AAAA-MM-DDTHH:mm" (hora de parede). */
export const wallClock = (d?: Date | string | null) => {
  if (!d) return null;
  const x = typeof d === 'string' ? new Date(d.length === 16 ? `${d}:00Z` : d) : d;
  return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 16);
};
/** Data (DATE) → "AAAA-MM-DD". */
export const wallDate = (d?: Date | string | null) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
};
/** Instante → ISO com Z. */
export const instant = (d?: Date | null) => (d ? d.toISOString() : null);

/** "Agora" na hora de parede do fuso configurado (APP_TIMEZONE). */
export function nowWallClock(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  return parts.replace(' ', 'T').slice(0, 16);
}
export const todayWall = () => nowWallClock().slice(0, 10);
/** Converte "AAAA-MM-DDTHH:mm" em Date para gravação em DATETIME. */
export const parseWallClock = (s: string) => new Date(`${s.length === 16 ? `${s}:00` : s}Z`.replace('ZZ', 'Z'));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
