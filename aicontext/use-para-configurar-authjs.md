# Configuração do Auth.js

Use este guia sempre que trabalhar em autenticação no Dungeons & Dicas.

## Decisão Vigente

O projeto usa Auth.js com credenciais locais, login Google e MongoDB como fonte autoritativa de usuários.

- O ID canônico de usuário é `User._id.toString()`.
- Roles e status ficam no MongoDB local.
- Login usa email ou username + senha.
- Login Google usa o provider oficial `next-auth/providers/google` e vincula/cria usuário local por email.
- Sessões devem ser persistentes e não devem expirar por inatividade no fluxo normal.
- Login em múltiplos dispositivos deve ser permitido sem revogar sessões anteriores.
- Logout manual encerra a sessão atual.

## Arquivos Principais

- `src/features/auth/auth-options.ts`: configuração Auth.js e provider credentials.
- `src/features/auth/auth-options.ts`: configuração Auth.js, provider credentials e provider Google.
- `src/app/api/auth/[...nextauth]/route.ts`: rota Auth.js.
- `src/app/api/auth/register/route.ts`: cadastro local simples.
- `src/features/auth/auth-components.tsx`: UI própria de login, cadastro, perfil e menu.
- `src/features/auth/auth-session-provider.tsx`: provider client.
- `src/core/auth/server.ts`: compatibilidade server-side para `auth()` e `currentUser()` internos.
- `src/core/auth/helpers.ts`: helpers de autorização usados por APIs.
- `src/core/hooks/useAuth.ts`: hook client-side do projeto.
- `src/features/users/models/user.ts`: usuário local, senha, role, status e `legacyClerkId` temporário.

## Variáveis De Ambiente

Obrigatórias:

```env
AUTH_SECRET=
AUTH_URL=http://localhost:3000
MONGODB_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Se alguma versão do NextAuth/Auth.js exigir nomes legados, também configurar:

```env
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

Não reintroduza variáveis `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY` ou `CLERK_WEBHOOK_SECRET`.

No Google Cloud Console, configure o redirect URI do ambiente local como `http://localhost:3000/api/auth/callback/google` e o de produção como `https://SEU_DOMINIO/api/auth/callback/google`.

## Regras De Desenvolvimento

- Não importe `@clerk/*`.
- Para Google OAuth, use apenas `next-auth/providers/google`; não adicione biblioteca externa.
- Não use `clerkId` como ownership novo.
- Use `auth()` de `@/core/auth/server` em rotas que precisam apenas do `userId`.
- Use `currentUser()` de `@/core/auth/server` quando precisar de role/perfil no servidor.
- Use `requireAuth()` e helpers de `@/core/auth/helpers` para rotas críticas.
- Use `useAuth()` de `@/core/hooks/useAuth` no client.
- Não dependa de cookie Auth.js dentro de iframe cross-origin do Owlbear. Para actions Owlbear, use o bridge token limitado emitido por `/api/owlbear/auth/bridge-token` e trocado por `OwlbearSession` em `/api/owlbear/session`.
- Todas as mensagens de login/cadastro/perfil devem estar em pt-BR.
- Operações administrativas de usuário devem gravar auditoria.

## Migração

O plano completo está em `docs/authjs-migration.md`.

Scripts:

```bash
pnpm auth:migrate:dry-run
pnpm auth:migrate:apply
```

Nunca execute `apply` sem backup confirmado do MongoDB.
