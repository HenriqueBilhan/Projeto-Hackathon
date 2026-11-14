/** Configuração do Jest: testes unitários, de integração (MySQL) e externos (API real). */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 120000,
  // Servidores HTTP de teste e o pool do MySQL são encerrados nos afterAll; forceExit evita espera por sockets em keep-alive.
  forceExit: true,
};
