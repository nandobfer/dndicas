# Módulo: Perfix

## Autoridade e referência

Porte do módulo de acesso do Ciliar, com `@nandobfer/perfix` fixado no commit
`2ceef0948fcbc99f6943589048b365665912def8`. Catálogo, schemas, comandos, sessão e UI ficam em
`src/features/perfix/`; não autorize ações pelo antigo `User.role` ou por claims do JWT.

- `User.roles`: IDs de perfis; `accessVersion`: versão otimista de alterações administrativas.
- `roles`: slug único, nome, descrição, token de cor da paleta, permissões, ativo e versão.
- `role_hierarchy/global`: ordem, versão e fence transacional de autoridade.
- `perfix_settings/global`: `defaultRoleId`, versão e responsável pela alteração.
- `perfix_audits`: trilha transacional detalhada. Mutações também entram na auditoria central
  `auditlogs`, com ator real, usuário efetivo, simulação, antes e depois.

O perfil reservado `admin` tem `*`, fica no topo e não permite editar suas permissões/status ou
excluir sua definição. Permite nome, descrição, cor e gestão de membros com as mesmas proteções
de autoalteração/último admin. `user` nasce sem permissões administrativas; isso não bloqueia os
fluxos normais de um usuário autenticado (suas fichas, perfil, NPCs e feedbacks).

## Permissões e servidor

`catalog.ts` usa o catálogo em árvore do Perfix, normaliza dependências e rejeita chaves
desconhecidas. Edição depende da visualização correspondente. Ramos: `admin.access`, `users.*`,
`roles.*`, `integrations.access`, `integrations.<id>.{view,edit,test,logs,explore}`, `catalog.edit`,
`catalog.generate`, `sheets.view_all`, `feedback.moderate`, `feedback.agent`, `audit.view` e
`mentions.review`.

- `requestAccess()` revalida identidade ativa, perfis ativos e permissões no banco em cada
  requisição. Cabeçalho `x-perfix-view-as` tem precedência sobre o mapa de cookies por aba.
- `requireAccess(...keys)` e `requirePermissions(context, ...keys)` negam por padrão.
- `auth()`/`currentUser()` (via `optionalAccess()`) tratam sessão de usuário inativo/excluído e
  simulação inválida como visitante: rotas públicas seguem respondendo; quem exige acesso usa
  `requireAccess`/`protectedRoute`, que lançam.
- Agente Opex: cada ferramenta administrativa declara `permission` ou `permissionFor(input)` (a
  mesma chave da rota REST equivalente, ex.: `integrations.<id>.edit`, `catalog.edit`,
  `integrations.ai.edit`), conferida na montagem do turno, antes de cada chamada e na confirmação;
  `admin.access` sozinho não libera essas ferramentas.
- Canal Pusher `private-integration-<id>` (stream de depuração) exige `integrations.<id>.logs`.
- `authorityTransaction()` exige replica set, escreve o fence global e revalida acesso dentro
  da transação para evitar TOCTOU e alterações concorrentes da última autoridade.
- Criação/edição de definições e reordenação exigem coringa efetivo. Mutações de usuários
  respeitam hierarquia, delta de atribuição, versão, perfis ativos e proteção do último admin.
- Ninguém altera seus próprios perfis/desativa sua conta (também verifica o ator real durante
  impersonação). Perfis em uso não podem ser excluídos (membros com soft delete, `deleted: true`, não contam). O padrão não pode ser desativado/excluído.

## Cadastro e integração

A integração **Perfix** tem caminho próprio `/integracoes/perfix`, abas Geral e Perfis, e teste
de integridade do padrão/contagem de perfis ativos. Não possui secrets nem configuração no `.env`.

O padrão deve existir, estar ativo e não ser admin nem ter `*`. Cadastro local, primeiro login
Google e criação administrativa sem `roleIds` usam esse padrão. Sem padrão válido, cadastros
falham fechados (`503 SIGNUP_UNAVAILABLE`); login de usuários existentes continua disponível.
Configurações usam versão otimista; escolher nenhum padrão desabilita novos cadastros. Só é possível escolher
como padrão um perfil que o chamador poderia atribuir (hierarquia e todas as permissões concedíveis);
caso contrário, 403.

## Visualizar como e impersonação

Somente o ator real com `*` pode iniciar simulação. A diferença em relação ao Ciliar é intencional:
**Visualizar como usuário troca realmente a identidade efetiva** (`auth().userId`, `currentUser()`,
`useAuth()`, ownership e canais privados próprios passam a usar o alvo). Não é somente leitura.
Visualizar como perfil preserva a identidade do ator e restringe suas permissões ao perfil.

O ator real nunca é substituído no vínculo de auditoria. Os alvos são revalidados no servidor;
inativação, exclusão ou revogação do coringa invalidam a simulação. O endpoint de opções/saída usa
a autoridade real para permitir encerrar mesmo quando o alvo deixou de existir.

`ViewAsProvider` persiste estado no `sessionStorage`, espelha cookies por aba e mostra banner e
seletor portados do Ciliar. `transport.ts` instala o cabeçalho por aba em axios e no fetch
same-origin (incluindo RSC), sem enviar o cabeçalho para terceiros. Cabeçalho `none` explicitamente
ignora os cookies. Trocas cancelam/limpam queries, reconectam Pusher e atualizam componentes de
servidor. A sessão não reutiliza dados da identidade anterior durante carregamento/logout.

## APIs e telas

| Rota | Contrato |
| --- | --- |
| `GET /api/me` | Identidade efetiva, perfis, permissões, coringa real e marcador |
| `GET/PATCH /api/perfix/settings` | Padrão com versão otimista |
| `GET/POST /api/perfix/roles` | Lista/contagem/hierarquia e criação |
| `GET/PATCH/DELETE /api/perfix/roles/[id]` | Detalhe, membros, auditoria, edição/exclusão versionada |
| `POST /api/perfix/roles/reorder` | Ordem e versão da hierarquia |
| `GET /api/perfix/assignable-roles` | Perfis atribuíveis e motivo dos bloqueios |
| `GET/POST /api/perfix/view-as` | Opções pesquisáveis e auditoria de início/troca/fim |
| `/integracoes/perfix/perfis/novo` e `/[id]` | Editor com Geral, Permissões, Membros e Auditoria |

APIs usam Zod e envelopes `{ success, data }`; erros e conflitos são pt-BR. O CRUD em `/users`
usa `roleIds`, filtro `roleId` e `version` em PUT/DELETE. `role` não faz parte do contrato.

Enquanto `/api/me` valida a sessão, o `SessionBoundary` do `PerfixProvider` **continua renderizando
os filhos** (SSR e hidratação trazem o conteúdo da página). Se a validação passar de
`ACCESS_LOADING_DELAY_MS` (400 ms), o `AccessLoadingScreen`
(`src/features/perfix/components/AccessLoadingScreen.tsx`, adaptado do ciliar: feixes de luz do
`LiquidGlassBackground`, logo `dndicas-logo.webp`, anel azul/roxo e "Carregando acesso" com
reticências) aparece como overlay fixo por cima da página, só no cliente; nunca entra no HTML do
servidor. É um `role="status"` acessível e, com `prefers-reduced-motion`, fica estático. Os filhos só
remontam quando a identidade muda depois de já carregada (login/logout, troca de simulação,
permissões alteradas), não na primeira carga. Na montagem, `router.refresh()` só roda quando a aba
está simulando (o SSR não conhece a simulação da aba). Quem depende do acesso usa `isLoaded` de
`useAuth()`.

## Migração e operação

Migração `migrate-perfix` registrada no bootstrap, idempotente: cria admin/user/hierarquia/padrão,
copia o legado para IDs, audita e só depois remove `role` e o índice legado. Também repara
legados que um `save()` anterior à migração gravou com `roles: []` (ainda com `role`), e só remove
`role` de quem já tem ao menos um perfil. Não sobrescreve atribuições já migradas nem um padrão já
configurado. Auth.js, o perfil (`/api/auth/profile`) e a autenticação MCP conectam via
`dbConnect` de `@/lib/db`, que executa as migrações antes de salvar usuários.

### Pré-requisitos de deploy

1. **Backup do MongoDB** (ver abaixo).
2. **MongoDB em replica set.** Atribuição de perfis, CRUD de usuários/perfis e configurações do
   Perfix usam transações; em servidor standalone respondem 503 `REPLICA_SET_REQUIRED`. Para
   habilitar num nó único: iniciar o `mongod` com `--replSet rs0` (ou `replication.replSetName`)
   e executar uma vez `rs.initiate()` no `mongosh`; a `MONGODB_URI` pode incluir `?replicaSet=rs0`.
   O teste da integração Perfix (`/integracoes/perfix`) verifica o suporte a transações e o perfil
   padrão, com erro em pt-BR quando algum falhar.

**Faça backup do MongoDB antes do primeiro deploy.** Não reverta somente o código após remover
`role`; versões antigas não entendem o novo contrato. Nenhum teste usa o banco da aplicação:
`tests/backend/perfix/access.integration.test.ts` usa `MongoMemoryReplSet` efêmero. O binário de
teste é baixado na primeira execução; o build script da dependência está aprovado no workspace.

Validação focada: `pnpm exec vitest run tests/backend/perfix tests/frontend/perfix
tests/backend/users tests/frontend/auth`. Não executar build completo automaticamente.

## Interface

As abas da integração (Geral/Perfis) e do editor de perfil (Geral/Permissões/Membros/Log de
Auditoria) usam `IntegrationTabs`, com a aba ativa na cor primária. O perfil padrão e o filtro por
perfil de `/users` usam o `Select` Glass (`@/core/ui/select`; sentinelas `"none"`/`"all"` convertidos
para `null`/`""`), o filtro de status dos perfis usa `StatusChips` e a atribuição de perfis usa o
`Checkbox` do core.
