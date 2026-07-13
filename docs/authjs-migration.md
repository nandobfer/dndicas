# Migracao Clerk Para Auth.js

## Objetivo

Remover o Clerk completamente do projeto e substituir a autenticacao por Auth.js, mantendo os usuarios atuais, os dados vinculados a eles e os fluxos existentes da aplicacao.

Esta migracao deve entregar:

- Auth.js como camada de autenticacao.
- MongoDB como fonte autoritativa de usuarios.
- UI propria para login, cadastro, perfil, menu de conta e logout.
- Login persistente, sem expiracao funcional para o usuario, exceto logout manual.
- Suporte a login simultaneo em varios dispositivos.
- Remocao total de Clerk do codigo, scripts, variaveis de ambiente, documentacao e `package.json`.

## Decisoes Da Migracao

- O identificador canonico do usuario passa a ser `User._id.toString()`.
- `clerkId` deve virar apenas dado legado temporario durante a migracao, preferencialmente como `legacyClerkId`, e depois pode ser removido.
- Sessoes Auth.js devem ser independentes por dispositivo e nao devem revogar sessoes antigas quando o usuario logar novamente.
- Logout manual deve encerrar somente a sessao atual, salvo se no futuro houver uma acao explicita de encerrar todas as sessoes.
- Roles e status continuam vindo do MongoDB local, nao de metadados externos.
- Usuarios inativos ou deletados logicamente continuam impedidos de acessar areas autenticadas.
- IDs sinteticos do Owlbear, como `owlbear-gm:*` e `owlbear-player:*`, nao entram no remapeamento de Clerk.

## Estado Atual Com Clerk

### Dependencias

O `package.json` possui dependencias diretas do Clerk:

- `@clerk/backend`
- `@clerk/localizations`
- `@clerk/nextjs`
- `@clerk/themes`

Tambem ha scripts especificos:

- `clerk:migrate:dry-run`
- `clerk:migrate:apply`
- `clerk:avatars:dry-run`
- `clerk:avatars:apply`

### Providers E Layout

`src/app/layout.tsx` usa:

- `ClerkProvider`
- `@clerk/themes`
- `@clerk/localizations`
- tema visual do Clerk configurado no provider

### Middleware E Autenticacao Server-Side

`src/proxy.ts` usa `clerkMiddleware` e `createRouteMatcher`.

Observacao importante: apesar dos comentarios antigos indicarem protecao global, o `auth.protect()` esta comentado. Na pratica, a autenticacao global esta opcional e muitas rotas fazem checagem propria.

`src/core/auth/helpers.ts` usa `auth()` e `currentUser()` do Clerk.

### Hook De Autenticacao Client-Side

`src/core/hooks/useAuth.ts` usa:

- `useUser()` do Clerk
- `useAuth()` do Clerk
- `user.publicMetadata.role` para `isAdmin`

O contrato exposto hoje e:

- `user`
- `userId`
- `isLoaded`
- `isSignedIn`
- `signOut`
- `email`
- `fullName`
- `firstName`
- `lastName`
- `imageUrl`
- `isAdmin`

Para reduzir risco, a primeira etapa da migracao deve manter um contrato equivalente no hook do projeto.

### UI Acoplada Ao Clerk

Componentes e paginas que usam UI Clerk:

- `src/app/(dashboard)/sign-in/[[...sign-in]]/page.tsx`: `SignIn`
- `src/app/(dashboard)/profile/[[...rest]]/page.tsx`: `UserProfile`
- `src/app/(dashboard)/my-sheets/_components/unauthenticated-view.tsx`: `SignIn`
- `src/components/ui/glass-header.tsx`: `SignedIn`, `SignedOut`, `UserButton`
- `src/components/ui/expandable-sidebar.tsx`: `SignedIn`, `SignedOut`, `UserButton`
- `src/core/ui/layout/topbar.tsx`: `UserButton`

### APIs E Features Com Clerk Server-Side

Ha chamadas diretas a `@clerk/nextjs/server` em varias rotas:

- `src/app/api/feedback/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/webhooks/clerk/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/spells/route.ts`
- `src/app/api/owlbear/session/route.ts`
- `src/app/api/races/route.ts`
- `src/app/api/races/[id]/route.ts`
- `src/app/api/npcs/route.ts`
- `src/app/api/npcs/[id]/route.ts`
- `src/app/api/npcs/copy/route.ts`
- `src/app/api/items/route.ts`
- `src/app/api/items/[id]/route.ts`
- `src/app/api/monsters/route.ts`
- `src/app/api/monsters/[id]/route.ts`
- `src/app/api/feats/route.ts`
- `src/app/api/feats/[id]/route.ts`
- `src/app/api/dice/rolls/route.ts`
- `src/app/api/dice/overrides/route.ts`
- `src/app/api/character-sheets/route.ts`
- `src/app/api/character-sheets/assisted/route.ts`
- `src/app/api/character-sheets/[id]/route.ts`
- `src/app/api/classes/route.ts`
- `src/app/api/classes/[id]/route.ts`
- `src/app/api/backgrounds/route.ts`
- `src/app/api/backgrounds/[id]/route.ts`
- `src/app/api/admin/mention-audit/route.ts`
- `src/app/api/admin/entity-generation/*`
- `src/features/owlbear/server/auth.ts`
- `src/features/owlbear/server/character-sheet-routes.ts`
- `src/features/users/api/get-current-user.ts`

### Modelo De Usuario Atual

`src/features/users/models/user.ts` define `clerkId` como obrigatorio, unico e indexado.

Campos atuais relevantes:

- `clerkId`
- `username`
- `email`
- `name`
- `avatarUrl`
- `role`
- `status`
- `deleted`
- timestamps

O modelo possui `findByClerkId`, e diversas features assumem que `userId` e um ID do Clerk.

### Sincronizacao Clerk Para MongoDB

`src/features/users/api/sync.ts` sincroniza dados do Clerk para o MongoDB.

Funcoes atuais:

- `syncUserFromClerk`
- `deleteUserFromClerk`
- `ensureUserExists`

Essas funcoes devem ser removidas ou substituidas por servicos locais de usuario.

### Scripts Clerk Existentes

- `scripts/migrate-clerk-dev-to-prod.ts`
- `scripts/clerk-migration-utils.ts`
- `scripts/copy-clerk-dev-avatars-to-prod.ts`
- `scripts/sync-clerk-users.ts`
- `scripts/bootstrap-admin.ts`

`scripts/bootstrap-admin.ts` tambem consulta Clerk para promover ou criar admin.

### Documentacao Clerk Existente

- `docs/clerk/clerk-users-dev.csv`
- `docs/clerk/migracao-dev-para-production.md`
- `docs/clerk/migration-output/*`
- `aicontext/use-para-configurar-clerk.md`
- secoes em `aicontext/README.md`
- secoes em `aicontext/use-diretrizes-do-projeto.md`
- secoes em `docs/features-inventory.md`
- secoes em `docs/stack_tecnica.md`
- secoes no `README.md`
- quickstarts em `specs/*`

## Arquitetura Alvo Com Auth.js

### Camadas

1. Auth.js cuida de criar e ler a sessao HTTP.
2. MongoDB guarda usuarios, senha, role, status e dados de perfil.
3. Credenciais locais e Google OAuth autenticam sempre contra o usuario local.
4. Helpers do projeto escondem Auth.js das rotas e features.
5. UI propria substitui os componentes prontos do Clerk.

### Identidade Canonica

Todo ownership novo deve usar `User._id.toString()`.

Exemplos:

- `characterSheets.userId = String(user._id)`
- `userNpcs.userId = String(user._id)`
- `feedback.createdBy = String(user._id)`
- `auditLogs.performedBy = String(user._id)`

### Sessao Persistente

Auth.js deve ser configurado para uma sessao de duracao muito longa. O objetivo funcional e que o usuario permaneca logado ate clicar em sair.

Notas tecnicas:

- Cookies possuem limites tecnicos do navegador e do ambiente, entao a documentacao deve evitar prometer eternidade literal.
- A regra de produto e: nao expirar proativamente no servidor por tempo de inatividade.
- O logout manual deve ser a unica invalidacao esperada no fluxo normal.
- Login em um novo dispositivo nao deve invalidar sessoes anteriores.

### Estrategia De Sessao

Preferencia inicial:

- Auth.js com estrategia `jwt` e token contendo apenas identificadores essenciais.
- `session.user.id` contendo o ID local do MongoDB.
- `session.user.role` vindo do MongoDB.
- `session.user.status` validado no login e, se necessario, nos helpers server-side.
- Login Google via provider oficial `next-auth/providers/google`, sem biblioteca externa.

Alternativa se houver necessidade futura de revogar sessoes individualmente:

- Adapter MongoDB/tabela de sessoes propria.
- Colecao de sessoes com `sessionToken`, `userId`, `createdAt`, `lastUsedAt`, `revokedAt`.

Como o requisito atual e login simples, persistente e multi-dispositivo, a estrategia `jwt` e suficiente para a primeira migracao, desde que roles/status sejam recarregados quando necessario em operacoes criticas.

## Dependencias Alvo

Adicionar:

- `next-auth`
- biblioteca de hash de senha compativel com bcrypt, por exemplo `bcryptjs` ou `bcrypt`

Remover:

- `@clerk/backend`
- `@clerk/localizations`
- `@clerk/nextjs`
- `@clerk/themes`

Avaliar remocao de `svix` se nao houver outro webhook assinado usando a biblioteca.

## Variaveis De Ambiente

### Remover

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=
NEXT_PUBLIC_CLERK_SIGN_UP_URL=
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=
CLERK_DEV_SECRET_KEY=
CLERK_PROD_SECRET_KEY=
```

### Adicionar

```env
AUTH_SECRET=
AUTH_URL=https://dndicas.com.br
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Se a versao usada do Auth.js/NextAuth exigir o nome legado, documentar tambem:

```env
NEXTAUTH_URL=https://dndicas.com.br
NEXTAUTH_SECRET=
```

`MONGODB_URI` permanece obrigatorio.

Para Google OAuth, configure no Google Cloud Console os redirect URIs:

- Local: `http://localhost:3000/api/auth/callback/google`
- Producao: `https://dndicas.com.br/api/auth/callback/google`

### Arquivos A Atualizar

- `.env`
- `.env.local`, quando existir localmente
- `.env.local.example`, se existir ou for criado
- `docker-compose.yaml`
- documentacao de deploy
- README

Nunca copiar valores reais de secrets para documentacao ou exemplos.

## Modelo De Dados Alvo

### `users`

Campos propostos:

```ts
{
  _id: ObjectId,
  legacyClerkId?: string,
  username: string,
  email: string,
  passwordHash?: string,
  name?: string,
  avatarUrl?: string,
  role: "admin" | "user",
  status: "active" | "inactive",
  deleted: boolean,
  passwordSetupRequired?: boolean,
  lastLoginAt?: Date,
  createdAt: Date,
  updatedAt: Date,
}
```

Indices:

- `email` unico, lowercase.
- `username` unico.
- `legacyClerkId` unico parcial enquanto durar a migracao.
- `status`, `role` para filtros administrativos.

### Senhas

- Usuarios com `password_digest` bcrypt no CSV podem ter o hash preservado como `passwordHash`.
- Usuarios sem hash importavel devem ficar com `passwordSetupRequired: true`.
- O fluxo de login deve informar em pt-BR que a senha precisa ser definida quando aplicavel.

### Campos Legados

Durante a migracao:

- `clerkId` pode ser copiado para `legacyClerkId`.
- Codigo novo nao deve depender de `legacyClerkId` para autenticar.
- Remocao fisica do campo deve ocorrer apenas depois de validar todos os dados remapeados.

## Migracao Dos Usuarios Atuais

Fonte principal: `docs/clerk/clerk-users-dev.csv`.

O CSV atual contem usuarios com estes campos:

- `id`
- `first_name`
- `last_name`
- `username`
- `primary_email_address`
- `primary_phone_number`
- `verified_email_addresses`
- `unverified_email_addresses`
- `verified_phone_numbers`
- `unverified_phone_numbers`
- `totp_secret`
- `password_digest`
- `password_hasher`
- `created_at`

### Regras De Reconciliacao

1. Normalizar `primary_email_address` para lowercase.
2. Buscar usuario local no MongoDB por email, `legacyClerkId` ou `clerkId` antigo.
3. Se encontrar usuario local, preservar todos os IDs de origem disponiveis: `id` do CSV, `legacyClerkId` e `clerkId` antigo do MongoDB.
4. Preservar `role`, `status`, `deleted`, `username`, `name` e `avatarUrl` do MongoDB quando houver divergencia com o CSV.
5. Se o usuario local estiver `deleted=true`, nao reativar automaticamente.
6. Se o CSV tiver bcrypt importavel, gravar em `passwordHash`.
7. Se nao houver hash importavel, marcar `passwordSetupRequired=true`.
8. Gravar `legacyClerkId` com o ID antigo do Clerk.
9. Gerar mapa auditavel `remapSourceIds -> localUserId`.

### Usuarios Sem Hash De Senha

Varios usuarios do CSV nao possuem `password_digest`.

Para eles, o novo fluxo deve permitir definir senha sem depender do Clerk.

Opcoes aceitaveis:

- Tela de primeiro acesso: usuario informa email, recebe ou define senha se validado por mecanismo escolhido.
- Fluxo administrativo: admin define senha inicial temporaria.
- Fluxo de redefinicao por email, se SMTP estiver configurado.

Como o requisito e login simples e facil, a primeira implementacao pode usar senha definida pelo usuario em fluxo proprio, com mensagens claras em pt-BR.

### Relatorios Da Migracao

Novo diretorio sugerido:

```txt
docs/authjs/migration-output/
```

Arquivos esperados:

- `migration-map.csv`
- `migration-report.json`
- `mongodb-remap-report.json`
- `password-setup-required.csv`

Formato do mapa:

```csv
email,oldClerkId,remapSourceIds,localUserId,role,status,action,passwordImported,passwordSetupRequired,passwordHashPresent,message
usuario@example.com,user_dev,user_dev|user_prod,65f...,admin,active,updated,true,false,true,Usuario migrado com hash bcrypt
```

`remapSourceIds` deve incluir todos os IDs legados conhecidos separados por `|`, inclusive o `clerkId` production ainda salvo em `users.clerkId` quando existir. Isso evita perder ownership de fichas/NPCs criados com outro tenant Clerk.

## Colecoes E Campos A Remapear

A lista abaixo vem do script atual `scripts/clerk-migration-utils.ts` e deve ser mantida como base do novo script.

| Colecao | Campo | Origem atual | Destino |
| --- | --- | --- | --- |
| `users` | `clerkId` | ID Clerk production antigo | fonte de remapeamento, depois remocao |
| `characterSheets` | `userId` | ID Clerk | `User._id.toString()` |
| `owlbearSessions` | `userId` | ID Clerk ou ID sintetico Owlbear | `User._id.toString()` para usuarios reais; preservar sinteticos |
| `owlbearRoomNpcs` | `userId` | ID Clerk ou ID sintetico Owlbear | `User._id.toString()` para usuarios reais; preservar sinteticos |
| `userNpcs` | `userId` | ID Clerk | `User._id.toString()` |
| `feedbacks` | `createdBy` | ID Clerk | `User._id.toString()` |
| `auditlogs` | `userId` | ID Clerk | `User._id.toString()` |
| `auditlogs` | `performedBy` | ID Clerk | `User._id.toString()` |
| `usagelogs` | `userId` | ID Clerk | `User._id.toString()` |

### Regras De Remapeamento

- O remapeamento deve ser feito por mapa auditavel, nunca por substituicao cega.
- Para cada usuario, o remap deve considerar `row.id`, `legacyClerkId` e `clerkId` antigo como IDs de origem.
- IDs que comecam com `owlbear-gm:` ou `owlbear-player:` devem ser preservados.
- Documentos sem correspondencia no mapa devem aparecer em relatorio de orfaos.
- `dry-run` deve contar matches sem modificar dados.
- `apply` exige backup confirmado.

## UI Propria Para Substituir Clerk

### Componentes Novos

Criar em `src/features/auth` ou local equivalente:

- `login-form.tsx`
- `signup-form.tsx`
- `profile-form.tsx`
- `auth-user-menu.tsx`
- `auth-gate.tsx` ou componentes `SignedIn`/`SignedOut` internos
- `password-setup-form.tsx`, se o fluxo de primeiro acesso for separado

### Paginas

- `/sign-in`: login por email ou username e senha, com botao unico para Google.
- `/sign-up`: cadastro simples, se cadastro publico continuar habilitado.
- `/profile`: edicao basica de nome, username, avatar e senha.
- Opcional `/reset-password` ou `/set-password`: necessario para usuarios sem hash importado.

### Requisitos De UX

- Todas as mensagens visiveis devem estar em pt-BR.
- Estado de carregamento em submit.
- Erros acionaveis: senha invalida, usuario inexistente, usuario inativo, senha pendente de definicao.
- Redirecionamento pos-login respeitando `callbackUrl` quando presente.
- Logout manual claro no menu de usuario.
- Visual deve seguir o padrao Glass local, nao UI pronta de terceiro.
- Botoes primarios devem usar o padrao azul do sistema (`bg-blue-500 text-white hover:bg-blue-600`).

### Substituicoes Diretas

| Clerk | Substituto |
| --- | --- |
| `SignIn` | `LoginForm` |
| `SignUp` | `SignupForm` |
| `UserProfile` | `ProfileForm` |
| `UserButton` | `AuthUserMenu` |
| `SignedIn` | `AuthSignedIn` ou condicional via `useAuth` |
| `SignedOut` | `AuthSignedOut` ou condicional via `useAuth` |

## Auth Helpers E Contratos

### Server-Side

Manter estes helpers, trocando a implementacao interna:

- `getCurrentUserId()`
- `getCurrentUser()`
- `requireAuth()`
- `hasRole()`
- `hasAnyRole()`
- `hasAllRoles()`
- `logAuthAction()`
- `getUserInfo()`
- `isEmailVerified()` se continuar relevante

### Client-Side

Manter `useAuth()` com contrato parecido:

```ts
{
  user,
  userId,
  isLoaded,
  isSignedIn,
  signOut,
  email,
  fullName,
  firstName,
  lastName,
  imageUrl,
  isAdmin,
}
```

Isso evita refatorar todas as telas de uma vez.

## APIs De Usuario

### `GET /api/users`

Continuar listando usuarios do MongoDB.

Remover `clerkId` da resposta publica final ou trocar por `legacyClerkId` apenas em contexto administrativo temporario.

### `POST /api/users`

Hoje cria usuario no Clerk e depois sincroniza.

Novo comportamento:

1. Exigir admin.
2. Validar payload com Zod.
3. Criar usuario direto no MongoDB.
4. Definir senha inicial, marcar `passwordSetupRequired` ou enviar fluxo de definicao de senha.
5. Auditar criacao.

### `PUT /api/users/[id]`

Hoje atualiza Clerk e MongoDB.

Novo comportamento:

1. Exigir admin.
2. Atualizar MongoDB.
3. Impedir usuario de mudar propria role, regra ja existente.
4. Auditar alteracao.

### `DELETE /api/users/[id]`

Hoje deleta no Clerk e faz soft delete local.

Novo comportamento:

1. Exigir admin.
2. Impedir self-delete.
3. Fazer soft delete local.
4. Nao revogar sessoes de outros dispositivos inicialmente, a menos que seja implementada colecao de sessoes.
5. Helpers server-side devem bloquear usuario inativo em chamadas autenticadas criticas.

## Owlbear

Arquivos principais:

- `src/features/owlbear/use-owlbear-session.ts`
- `src/app/api/owlbear/session/route.ts`
- `src/features/owlbear/server/auth.ts`
- `src/features/owlbear/server/session-service.ts`

Mudancas:

- Trocar `auth()` do Clerk por helper local/Auth.js.
- `userId` autenticado deve ser o ID local do MongoDB.
- Preservar sessoes anonimas de GM e player.
- Revisar textos de debug que citam Clerk.
- Revisar TTL proprio do Owlbear separadamente do login principal.

Observacao: `session-service.ts` usa TTL proprio para sessoes Owlbear. Isso nao e a sessao de login principal. Se o requisito de login permanente tambem precisar afetar Owlbear, documentar e ajustar `AUTHENTICATED_SESSION_TTL_MS` separadamente.

## Scripts Novos

### Scripts No `package.json`

Adicionar:

```json
{
  "auth:migrate:dry-run": "tsx scripts/migrate-clerk-to-authjs.ts --dry-run",
  "auth:migrate:apply": "tsx scripts/migrate-clerk-to-authjs.ts --apply --confirm-backup"
}
```

Remover ao final:

```json
{
  "clerk:migrate:dry-run": "...",
  "clerk:migrate:apply": "...",
  "clerk:avatars:dry-run": "...",
  "clerk:avatars:apply": "..."
}
```

### `scripts/migrate-clerk-to-authjs.ts`

Responsabilidades:

1. Carregar `.env` e `.env.local`.
2. Ler `docs/clerk/clerk-users-dev.csv`.
3. Validar cabecalhos.
4. Conectar no MongoDB.
5. Reconciliar usuarios por email.
6. Validar `clerkId` antigo quando existir.
7. Gravar `legacyClerkId`.
8. Importar hash bcrypt quando possivel.
9. Marcar `passwordSetupRequired` quando necessario.
10. Gerar mapa `oldClerkId -> localUserId`.
11. Remapear colecoes de ownership.
12. Gerar relatorios.

### Flags

```bash
tsx scripts/migrate-clerk-to-authjs.ts --dry-run
tsx scripts/migrate-clerk-to-authjs.ts --apply --confirm-backup
tsx scripts/migrate-clerk-to-authjs.ts --csv docs/clerk/clerk-users-dev.csv --out docs/authjs/migration-output --dry-run
tsx scripts/migrate-clerk-to-authjs.ts --dry-run --skip-remap
```

### Regras De Seguranca

- `dry-run` deve ser o padrao.
- `apply` exige `--confirm-backup`.
- `apply` aborta se houver divergencia entre CSV e MongoDB.
- `apply` aborta se houver email duplicado.
- `apply` aborta se houver usuario ativo local sem caminho de login definido.
- Nenhum segredo deve ser escrito nos relatorios.

## Remocao Total Do Clerk

Checklist final:

- [ ] Remover imports de `@clerk/*` em `src/`.
- [ ] Remover imports de `@clerk/*` em `scripts/`.
- [ ] Remover mocks de `@clerk/*` em `tests/`.
- [ ] Remover `src/app/api/webhooks/clerk/route.ts`.
- [ ] Remover scripts `clerk:*` do `package.json`.
- [ ] Remover dependencias Clerk do `package.json`.
- [ ] Atualizar `pnpm-lock.yaml` com `pnpm install`.
- [ ] Remover variaveis Clerk de `.env`, deploy e `docker-compose.yaml`.
- [ ] Remover referencias Clerk do README.
- [ ] Atualizar `aicontext/use-para-configurar-clerk.md` para guia Auth.js ou arquivar o arquivo.
- [ ] Atualizar `aicontext/README.md`.
- [ ] Atualizar `aicontext/use-diretrizes-do-projeto.md`.
- [ ] Atualizar `docs/features-inventory.md`.
- [ ] Atualizar `docs/stack_tecnica.md`.
- [ ] Atualizar specs/quickstarts que ainda mencionam Clerk.
- [ ] Validar com busca textual que nao restam referencias ativas a Clerk.

## Testes Necessarios

### Backend

- Login com email e senha correta.
- Login com username e senha correta.
- Falha com senha errada.
- Falha com usuario inexistente.
- Falha com usuario inativo.
- Sessao retorna `user.id` local e `role` correta.
- `requireAuth()` bloqueia visitante.
- `requireAdmin()` bloqueia usuario comum.
- CRUD de usuarios nao chama Clerk.
- Script de migracao em `dry-run` nao altera MongoDB.
- Script de migracao remapeia colecoes esperadas em teste unitario de utilitarios.

### Frontend

- `/sign-in` renderiza formulario proprio.
- Login mostra loading e erro em pt-BR.
- Sidebar mostra entrar para visitante.
- Sidebar mostra menu de usuario para autenticado.
- Header mobile usa menu proprio.
- `/profile` permite editar dados basicos.
- `UnauthenticatedView` de minhas fichas usa formulario proprio.

### Owlbear

- GM anonimo continua abrindo sessao.
- Player nao autenticado conserva comportamento esperado atual.
- Player autenticado usa ID local.
- Sessao Owlbear nao quebra com troca de identidade.

### Migracao

- CSV valido e parseado.
- CSV com email duplicado falha.
- CSV com usuario sem MongoDB local vira `skipped` ou erro conforme modo escolhido.
- Usuario com bcrypt importa `passwordHash`.
- Usuario sem bcrypt vira `passwordSetupRequired=true`.
- Campos de ownership sao remapeados para `localUserId`.

## Plano De Implementacao

### Fase 1: Base Auth.js

1. Adicionar dependencias Auth.js e hash de senha.
2. Criar configuracao Auth.js.
3. Criar provider credentials.
4. Criar callbacks para gravar `session.user.id` como ID local.
5. Configurar sessao persistente de longa duracao.

### Fase 2: Modelo Local

1. Alterar `User` para suportar `passwordHash`, `legacyClerkId` e `passwordSetupRequired`.
2. Ajustar indices.
3. Criar helpers de senha.
4. Atualizar tipos de usuario.

### Fase 3: Helpers E Hook

1. Refatorar `src/core/auth/helpers.ts`.
2. Refatorar `src/core/hooks/useAuth.ts`.
3. Garantir contrato compativel com telas atuais.

### Fase 4: UI Propria

1. Criar formularios Glass de login/cadastro/perfil.
2. Criar menu de usuario.
3. Trocar UI Clerk nas paginas e componentes.

### Fase 5: APIs

1. Substituir `auth()` e `currentUser()` por helpers locais.
2. Refatorar CRUD de usuarios.
3. Remover webhook Clerk.
4. Ajustar rotas de Owlbear.

### Fase 6: Migracao De Dados

1. Criar script `migrate-clerk-to-authjs.ts`.
2. Criar utilitarios testaveis.
3. Rodar `dry-run`.
4. Revisar relatorios.
5. Aplicar apos backup.

### Fase 7: Limpeza

1. Remover dependencias e scripts Clerk.
2. Atualizar docs e aicontext.
3. Atualizar testes.
4. Buscar referencias restantes a Clerk.

## Validacao Manual Obrigatoria

- Login de usuario com senha importada.
- Definicao de senha para usuario sem hash importado.
- Login em dois navegadores ao mesmo tempo.
- Logout em um navegador sem derrubar o outro.
- Acesso a fichas antigas apos remapeamento.
- Criacao e edicao de ficha.
- Fluxo Owlbear GM.
- Fluxo Owlbear player.
- Admin acessa listagem de usuarios.
- Admin cria usuario novo.
- Admin edita role de outro usuario.
- Usuario nao admin nao acessa areas administrativas.
- Feedback continua vinculado ao autor correto.
- Audit logs continuam resolvendo ator correto.

## Rollback

Antes de `apply`:

1. Fazer backup completo do MongoDB.
2. Salvar relatorio do `dry-run`.
3. Garantir que a versao com Clerk ainda pode subir se necessario.

Se falhar antes de liberar a nova versao:

1. Restaurar backup do MongoDB.
2. Voltar variaveis Clerk.
3. Voltar deploy da versao anterior.
4. Descartar relatorios parciais e gerar novo `dry-run` antes de nova tentativa.

Se falhar depois de usuarios reais usarem Auth.js:

1. Nao restaurar backup cegamente sem avaliar perda de dados novos.
2. Exportar usuarios/sessoes/alteracoes criadas apos a migracao.
3. Fazer plano de recuperacao orientado por dados.

## Riscos

- Misturar IDs Clerk e IDs locais em ownership pode causar perda aparente de fichas, NPCs ou feedbacks.
- Remover `clerkId` antes da validacao dificulta auditoria e rollback.
- Usuarios sem hash precisam de caminho claro para definir senha.
- Sessao muito longa aumenta impacto de cookie roubado; mitigar com HTTPS, cookies seguros e logout manual confiavel.
- `status=inactive` precisa ser checado em operacoes criticas, pois sessoes longas podem sobreviver a uma desativacao administrativa.
- Tests com mocks de Clerk podem continuar passando falsamente se nao forem atualizados.

## Criterio De Conclusao

A migracao so deve ser considerada concluida quando:

- Nenhum import `@clerk/*` existir em codigo ativo.
- Nenhum script `clerk:*` existir no `package.json`.
- Nenhuma variavel Clerk for necessaria para iniciar a aplicacao.
- `package.json` e `pnpm-lock.yaml` nao tiverem pacotes Clerk.
- Usuarios antigos conseguirem acessar seus dados.
- Usuarios sem senha importada tiverem caminho funcional de acesso.
- Login simultaneo em multiplos dispositivos estiver validado.
- Logout manual funcionar sem expiracao automatica perceptivel.
- Documentacao e `aicontext/` estiverem atualizados para Auth.js.
