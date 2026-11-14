# Conecta — Plataforma Integrada de Saúde Pública (frontend)

> **Conecta: sua saúde integrada, seu histórico sempre com você.**

Protótipo funcional, responsivo e navegável de uma plataforma que integra digitalmente
o histórico clínico de pacientes atendidos em UBSs, UPAs, hospitais, laboratórios e
clínicas da rede pública. O histórico acompanha o paciente, independentemente da unidade
em que ele seja atendido.

⚠️ **Todos os dados são fictícios.** A integração com o SUS é **simulada** no navegador;
não existe conexão com sistemas oficiais. Não insira dados reais de saúde.

## Tecnologias

- HTML5, CSS3 e JavaScript puro (Vanilla JS), em arquivos separados, sem CSS ou JS inline.
- Via CDN: Google Fonts (Inter e Poppins), Lucide Icons (`lucide@0.460.0`) e Chart.js (`chart.js@4.4.1`).
- LocalStorage para simular autenticação e guardar os dados de demonstração.

## Como executar

Abra o `index.html` no navegador **ou**, de preferência, rode um servidor local:

```bash
cd conecta
python3 -m http.server 8080
```

Depois acesse <http://localhost:8080>. Os ícones e gráficos precisam de internet (CDN).

- `index.html` é o **portal institucional público**: menu, banner rotativo, acesso rápido,
  públicos, "Como funciona", busca de unidades, orientações, ajuda e rodapé. Também tem
  controles de acessibilidade (tamanho do texto e alto contraste).
- `login.html` é a **área de acesso** (paciente, profissional ou gestor). Os atalhos do portal
  levam direto à tela desejada depois do login (ex.: `login.html?destino=exames.html`).

## Acesso de demonstração

Use os botões de acesso rápido na tela de login ou digite as credenciais:

| Perfil | Usuário | CPF | Senha |
|---|---|---|---|
| Paciente | Maria Aparecida Souza | 123.456.789-09 | `paciente123` |
| Médico | Dr. Ricardo Almeida (UBS Jardim das Flores) | 111.444.777-35 | `medico123` |
| Administrador | Ana Paula Ferreira | 529.982.247-25 | `admin123` |

Para restaurar os dados originais, use **Restaurar dados de demonstração** (na tela de
login ou em *Segurança › Configurações*).

## Estrutura

```
conecta/
├── index.html                 Portal institucional público
├── login.html                 Acesso (paciente / profissional / gestor)
├── pages/
│   ├── paciente.html          Painel do paciente
│   ├── historico.html         Linha do tempo do histórico médico
│   ├── exames.html            Exames, filtros, resultado e PDF
│   ├── consultas.html         Próximas e anteriores, agendar e cancelar
│   ├── receitas.html          Receitas e "Meus medicamentos" (?aba=medicamentos)
│   ├── perfil-paciente.html   Paciente: "Meu perfil" · Médico: perfil clínico completo (?id=)
│   ├── ajuda.html             Ajuda e suporte (FAQ e chamado)            [adicional]
│   ├── medico.html            Painel do profissional
│   ├── buscar-paciente.html   Busca por CPF, nome ou CNS
│   ├── atendimento.html       Registro de atendimento e rascunhos
│   ├── solicitar-exame.html   Solicitação e fluxo de status dos exames
│   ├── prescricoes.html       Prescrições, com alerta de alergia          [adicional]
│   ├── encaminhamentos.html   Encaminhamentos entre unidades              [adicional]
│   ├── administrador.html     Painel administrativo com gráficos
│   ├── pacientes.html         Cadastros (sem dados clínicos)              [adicional]
│   ├── profissionais.html     Cadastro, edição, ativação e exclusão de profissionais
│   ├── unidades.html          Cadastro de UBS, UPA, hospital, laboratório e clínica
│   ├── relatorios.html        Relatórios visuais e exportação CSV         [adicional]
│   ├── seguranca.html         Auditoria, permissões, compartilhamento, LGPD e configurações
│   └── rede.html              Rede de Atendimento: diagrama e demonstração do fluxo [adicional]
├── css/   style · portal · login · dashboard · paciente · medico · administrador · responsividade
├── js/
│   ├── main.js          Núcleo: dados (seed + repositório), sessão, utilitários, modal, toast, menu
│   ├── portal.js        Portal: banner, menu mobile, acessibilidade, unidades e contato
│   ├── auth.js          Login, validação de CPF, cadastro e recuperação de senha
│   ├── paciente.js      Painel, histórico, consultas, receitas, perfil e ajuda
│   ├── exames.js        Linha do tempo, detalhes, resultados, PDF, receitas (componentes compartilhados)
│   ├── medico.js        Painel, busca, prontuário, prescrições e encaminhamentos
│   ├── atendimento.js   Registro de atendimento e solicitação de exames
│   ├── administrador.js Indicadores, CRUDs, relatórios (Chart.js) e segurança
│   └── rede.js          Diagrama da rede e demonstração passo a passo      [adicional]
└── assets/ img/logo-conecta.png (logo oficial, sem alterações) · icons/ (favicon e ilustração)
```

As páginas marcadas como *[adicional]* não estavam na lista original. Elas foram criadas
para que todos os itens dos menus levem a telas reais e nenhum link fique quebrado.

## Identidade visual

As cores foram amostradas diretamente da logo oficial: ciano `#59D9E3`, turquesa `#37A2CF`,
azul `#1E7BC0` e `#1267B8`, e azul-escuro `#024EAE`. O visual é plano e institucional: cores
sólidas, sem degradês decorativos, com uma faixa nas quatro cores dos círculos da logo,
botões arredondados e tipografia Inter.

## Como funciona

- **Menu e cabeçalho**: cada página traz apenas o próprio `<main>`. O `main.js` monta o menu
  lateral do perfil, o cabeçalho (notificações, avatar e sair) e o menu mobile.
- **Proteção por perfil**: `data-roles` no `<body>`. Quem tenta abrir a página sem ter o perfil
  certo é redirecionado.
- **Integração entre unidades**: um atendimento salvo pelo médico aparece na linha do tempo do
  paciente, que também recebe uma notificação. Exames pedidos no atendimento entram no fluxo
  *Solicitado → Agendado → Em andamento → Resultado disponível* e chegam em "Meus exames".
- **LGPD**: CPF e CNS aparecem mascarados. Cada abertura de prontuário, exibição de documento,
  prescrição e alteração administrativa fica registrada na auditoria. O paciente vê quem acessou
  seu histórico, e o administrador não vê o conteúdo clínico.

## Preparado para backend

Todo acesso a dados passa por `Conecta.Data` (`getAll`, `getById`, `add`, `update`, `remove`)
em `js/main.js`. Para integrar uma API REST, basta trocar essas funções por chamadas
`fetch()`, por exemplo `GET /api/pacientes` e `POST /api/atendimentos`. Os demais pontos de
integração estão marcados nos comentários dos arquivos JS.

## Acessibilidade e responsividade

O protótipo foi pensado para desktop, notebook, tablet e smartphone: o menu lateral vira gaveta
e as tabelas viram cartões em telas pequenas. Também conta com navegação por teclado (abas com
setas, modais com foco preso e ESC), link "pular para o conteúdo", rótulos em todos os campos,
avisos com `aria-live`, áreas de toque de pelo menos 44 px e suporte a `prefers-reduced-motion`.
