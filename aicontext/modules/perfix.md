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
- `authorityTransaction()` exige replica set, escreve o fence global e revalida acesso dentro
  da transação para evitar TOCTOU e alterações concorrentes da última autoridade.
- Criação/edição de definições e reordenação exigem coringa efetivo. Mutações de usuários
  respeitam hierarquia, delta de atribuição, versão, perfis ativos e proteção do último admin.
- Ninguém altera seus próprios perfis/desativa sua conta (também verifica o ator real durante
  impersonação). Perfis em uso não podem ser excluídos. O padrão não pode ser desativado/excluído.

## Cadastro e integração

A integração **Perfix** tem caminho próprio `/integracoes/perfix`, abas Geral e Perfis, e teste
de integridade do padrão/contagem de perfis ativos. Não possui secrets nem configuração no `.env`.

O padrão deve existir, estar ativo e não ser admin nem ter `*`. Cadastro local, primeiro login
Google e criação administrativa sem `roleIds` usam esse padrão. Sem padrão válido, cadastros
falham fechados (`503 SIGNUP_UNAVAILABLE`); login de usuários existentes continua disponível.
Configurações usam versão otimista; escolher nenhum padrão desabilita novos cadastros.

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

## Migração e operação

Migração `migrate-perfix` registrada no bootstrap, idempotente: cria admin/user/hierarquia/padrão,
copia o legado para IDs, audita e só depois remove `role` e o índice legado. Não sobrescreve
atribuições já migradas nem um padrão já configurado. Auth.js executa o bootstrap antes de salvar
usuários para não introduzir arrays vazios no legado antes da migração.

**Faça backup do MongoDB antes do primeiro deploy.** Não reverta somente o código após remover
`role`; versões antigas não entendem o novo contrato. Nenhum teste usa o banco da aplicação:
`tests/backend/perfix/access.integration.test.ts` usa `MongoMemoryReplSet` efêmero. O binário de
teste é baixado na primeira execução; o build script da dependência está aprovado no workspace.

Validação focada: `pnpm exec vitest run tests/backend/perfix tests/frontend/perfix
tests/backend/users tests/frontend/auth`. Não executar build completo automaticamente.
