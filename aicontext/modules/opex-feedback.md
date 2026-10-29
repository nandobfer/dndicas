# Módulo: Tarefas Opex / Feedback

## Objetivo e acesso

`/feedback` substitui integralmente a central interna. O menu continua público; visitantes veem
o convite para entrar. O provisionamento e o dashboard exigem usuário local ativo (Auth.js).
O Agente Opex do chat é independente desta integração.

## Configuração

Em `/integracoes/opex` (admin): `baseUrl` pública incluindo subcaminho, `internalUrl` opcional
acessível pelo servidor, `clientToken` administrativo `cli_…`, criptografado pelo mecanismo
central. Não há variáveis legadas nem token hardcoded. O testador faz handshake e confirma
sessão administrativa e acesso à listagem de usuários, sem criar um usuário de teste.

## Fluxo e contratos

- `POST /api/opex-feedback/access`, corpo `{}`: cria/reutiliza usuário e retorna `ApiResponse`
  com cliente, usuário, `isAdmin`, `created` e `portalUrl` individual. Não retorna cookie/token
  administrativo. Cabeçalhos `no-store` e `no-referrer`.
- `GET /api/opex-feedback/dashboard?from&to&timeZone`: datas ISO e fuso IANA validados com Zod.
  Reautentica exclusivamente como usuário individual, seleciona cliente e confere identidade.
  Não usa fallback administrativo em caso de falha; não amplia permissões para mostrar gráficos.
- Handshake interno: `/api/auth/client-login?t=…` com redirect manual, cookie `opex_session`,
  `/api/cliente/session`, `/api/cliente/usuarios`, `/api/auth/client-select` e
  `/api/cliente/dashboard`. Chamadas com timeout de 15 segundos, sem cache e sem redirects.
- Vínculo na coleção `opex_feedback_users`, escopado por URL pública + cliente + usuário local.
  Dois índices únicos impedem vínculo duplicado e compartilhamento de usuário Opex entre contas.
  Tokens de portal não são persistidos. Chamadas concorrentes do mesmo ator são coalescidas.
- Reutiliza exclusivamente vínculo persistido no servidor; email e username locais são
  autodeclarados e nunca autorizam associação a uma conta Opex existente. Rejeita acesso
  desativado, default ou já vinculado a outra conta. Novos usuários sempre `admin: false`,
  sem email e com username `dndicas-` + 96 bits aleatórios. Colisões tentam novo identificador
  (até 3 vezes), sem recuperar tokens de terceiros. Auditoria sem credenciais.
- Erros: 401 `UNAUTHENTICATED`, 409 `OPEX_NOT_CONFIGURED`, `OPEX_CLIENT_TOKEN_NOT_ADMIN`,
  `OPEX_USER_CONFLICT`, 502 `OPEX_CLIENT_TOKEN_INVALID`/`OPEX_UNAVAILABLE`, 400 `INVALID_RANGE`.

## UI

`src/features/opex-feedback/components` reproduz os gráficos do portal cliente de `~/code/opex`:
KPIs, coluna, tag, projeto e criadas × concluídas, financeiro apenas quando o usuário Opex
for admin. Recharts 3.10.1 e `src/components/ui/chart.tsx`; imports locais, sem redesenho.
Período persistido em `opex:cliente:dashboard:period:v1` (7/30/90 dias, mês atual).
Hooks TanStack Query segregam cache por usuário; dados do acesso têm `gcTime: 0`.

## Exportação e remoção antiga

`pnpm export:feedbacks --out backups/feedback-pendentes.json` usa diretamente as coleções
`feedbacks`, `feedbacktimelineevents`, `feedbackagentruns`, sem importar o módulo removido.
Padrão `status: pendente`, `--all` inclui todos, `--dry-run` só conta, `--force` sobrescreve,
`--direct` evita descoberta de hostname interno em replica set local.
`DNDICAS_ENV_FILE` permite selecionar o `.env`. Não imprime credenciais nem altera o banco.
Saída JSON `0600` com dados brutos, timeline, runs e sugestão de tarefa (tipo/prioridade).
O descritor aberto recebe `chmod(0600)` antes da escrita, inclusive ao sobrescrever com `--force`.
Definir projeto, coluna e cliente posteriormente na importação; este módulo não importa tarefas.
O diretório `backups` é excluído do contexto Docker; exports são ignorados pelo Git.

As coleções históricas não são removidas. Telas antigas de detalhe, `/api/feedback/**`,
ferramentas MCP e ferramentas de feedback do Agente Opex não existem mais (breaking v4).
`src/components/feedback` é UI compartilhada e permanece.

## Testes

Backend em `tests/backend/opex-feedback`, frontend em `tests/frontend/opex-feedback`,
export em `tests/scripts/export-pending-feedbacks.test.ts`. Sem build automático.
