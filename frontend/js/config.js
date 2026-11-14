/* ==========================================================================
   CONECTA — Configuração do frontend
   apiUrl: endereço da API REST. Deixe null para detecção automática:
     - página servida pelo próprio backend (porta 3000 ou produção atrás de proxy) → mesma origem;
     - página aberta por outro servidor de desenvolvimento (ex.: Live Server :5500) → http://localhost:3000.
   ========================================================================== */
window.CONECTA_CONFIG = {
  apiUrl: null
};
