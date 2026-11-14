import { isValidCns, isValidCpf, maskCns, maskCpf } from '../../src/common/utils/documents';
import { cns, cpf } from '../helpers/app';

describe('Documentos (CPF/CNS) e mascaramento LGPD', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
    for (let i = 0; i < 50; i++) expect(isValidCpf(cpf())).toBe(true);
  });
  it('valida CNS pelo módulo 11', () => {
    for (let i = 0; i < 50; i++) expect(isValidCns(cns())).toBe(true);
    expect(isValidCns('123456789012345')).toBe(false);
    expect(isValidCns('12345')).toBe(false);
  });
  it('mascara CPF e CNS', () => {
    expect(maskCpf('52998224725')).toBe('***.982.***-25');
    expect(maskCns('898001234567890')).toBe('898 **** **** 7890');
    expect(maskCpf('x')).toBe('***.***.***-**');
  });
});
