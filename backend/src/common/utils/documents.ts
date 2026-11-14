/** Utilitários de documentos brasileiros (CPF/CNS) e mascaramento (LGPD). */
export const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function cpfCheckDigits(base9: string) {
  const d = base9.split('').map(Number);
  const calc = (arr: number[], weight: number) => {
    const r = (arr.reduce((s, n, i) => s + n * (weight - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(d, 10);
  return `${d1}${calc([...d, d1], 11)}`;
}

/** Valida CPF pelos dígitos verificadores. */
export function isValidCpf(value: string) {
  const s = onlyDigits(value);
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  return cpfCheckDigits(s.slice(0, 9)) === s.slice(9);
}

/** Valida CNS (Cartão Nacional de Saúde) pelo algoritmo oficial (módulo 11). */
export function isValidCns(value: string) {
  const s = onlyDigits(value);
  if (s.length !== 15) return false;
  const sum = s.split('').reduce((acc, n, i) => acc + Number(n) * (15 - i), 0);
  return sum % 11 === 0;
}

export const maskCpf = (v?: string | null) => {
  const s = onlyDigits(v);
  return s.length === 11 ? `***.${s.slice(3, 6)}.***-${s.slice(9)}` : '***.***.***-**';
};
export const maskCns = (v?: string | null) => {
  const s = onlyDigits(v);
  return s.length === 15 ? `${s.slice(0, 3)} **** **** ${s.slice(11)}` : '*** **** **** ****';
};
