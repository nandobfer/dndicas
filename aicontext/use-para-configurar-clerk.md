# Configuração do Clerk (Autenticação)

Guia completo para configurar o Clerk no Dungeons & Dicas.

## O que é o Clerk?

Clerk é o serviço de autenticação utilizado neste template. Ele gerencia:
- Login/Logout de usuários
- Registro de novos usuários
- Gerenciamento de sessões
- Perfil de usuário
- Autenticação social (Google, GitHub, etc.)

## Configuração Inicial

### 1. Criar conta no Clerk

1. Acesse https://clerk.com
2. Crie uma conta gratuita
3. Crie uma nova aplicação

### 2. Obter as chaves

No dashboard do Clerk:
1. Vá em **API Keys**
2. Copie as chaves:
   - `Publishable key` (começa com `pk_test_` ou `pk_live_`)
   - `Secret key` (começa com `sk_test_` ou `sk_live_`)

### 3. Configurar variáveis de ambiente

Adicione no arquivo `.env.local`:

```env
# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_sua_chave_aqui
CLERK_SECRET_KEY=sk_test_sua_chave_secreta_aqui
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

**IMPORTANTE**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` é pública (pode ser exposta)
- `CLERK_SECRET_KEY` é **SECRETA** (NUNCA commitar no git)

## Configuração de Rotas

### Rotas Públicas (Não requerem autenticação)

Por padrão, apenas estas rotas são públicas:
- `/sign-in` - Página de login
- `/sign-up` - Página de registro
- `/api/webhooks/*` - Webhooks do Clerk

### Rotas Protegidas (Requerem autenticação)

Todas as outras rotas requerem autenticação automática:
- `/` - Dashboard
- `/profile` - Perfil do usuário
- `/examples/*` - Páginas de exemplo
- `/api/*` - APIs (exceto webhooks)

### Customizar rotas públicas

Edite `src/middleware.ts`:

```typescript
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/minha-rota-publica(.*)', // Adicione aqui
]);
```

## Configuração no Dashboard do Clerk

### 1. URLs de Redirecionamento

No dashboard do Clerk, configure:

**Paths** → **Sign-in** → `/sign-in`
**Paths** → **Sign-up** → `/sign-up`
**Paths** → **Home URL** → `http://localhost:3000` (desenvolvimento)

### 2. Provedores de Autenticação

**User & Authentication** → **Social Login**

Habilite os provedores desejados:
- Google
- GitHub
- Microsoft
- Etc.

### 3. Campos Personalizados (Opcional)

**User & Authentication** → **User Profile**

Adicione campos customizados se necessário.

### 4. Aparência (Opcional)

**Customization** → **Appearance**

Customize a aparência dos componentes de login.

## Uso no Código

### Server-Side (API Routes, Server Components)

```typescript
import { auth, currentUser } from '@clerk/nextjs/server';

// Obter userId
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Lógica autenticada
}

// Obter dados completos do usuário
export async function POST() {
  const user = await currentUser();

  console.log(user.firstName, user.email);
}

// Usar helper do core
import { requireAuth } from '@/core/auth';

export async function DELETE() {
  const userId = await requireAuth(); // Lança erro se não autenticado
  // Lógica
}
```

### Client-Side (Componentes React)

```typescript
'use client';

import { useAuth, useUser } from '@clerk/nextjs';
// Ou use o hook do core
import { useAuth as useCoreAuth } from '@/core/hooks';

export function MyComponent() {
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser();

  // Ou
  const auth = useCoreAuth();

  if (!isSignedIn) {
    return <div>Por favor, faça login</div>;
  }

  return <div>Olá, {user.firstName}</div>;
}
```

## Componentes do Clerk

### UserButton

Botão com menu de usuário (já implementado no Topbar):

```typescript
import { UserButton } from '@clerk/nextjs';

<UserButton afterSignOutUrl="/sign-in" />
```

### UserProfile

Perfil completo do usuário (página `/profile`):

```typescript
import { UserProfile } from '@clerk/nextjs';

<UserProfile />
```

### SignIn / SignUp

Componentes de login/registro (páginas de auth):

```typescript
import { SignIn, SignUp } from '@clerk/nextjs';

<SignIn />
<SignUp />
```

## Desabilitar Registro Público

Para permitir apenas login (sem registro público):

1. No dashboard do Clerk: **User & Authentication** → **Restrictions**
2. Desabilite "Allow public sign-ups"
3. Usuários só poderão ser criados via:
   - Dashboard do Clerk (manual)
   - API do Clerk
   - Convites por email

## Roles e Permissions

### Adicionar roles no Clerk

1. Dashboard → **User & Authentication** → **Roles & Permissions**
2. Crie roles: `admin`, `user`, `manager`, etc.

### Usar no código

```typescript
import { hasRole, hasAnyRole } from '@/core/auth';

// Verificar role específica
const isAdmin = await hasRole('admin');

// Verificar múltiplas roles
const canAccess = await hasAnyRole(['admin', 'manager']);

// Client-side
import { useAuth } from '@clerk/nextjs';

const { sessionClaims } = useAuth();
const roles = sessionClaims?.metadata?.roles || [];
const isAdmin = roles.includes('admin');
```

## Webhooks (Opcional)

Para sincronizar usuários com seu banco:

1. Dashboard → **Webhooks** → **Add Endpoint**
2. URL: `https://seu-dominio.com/api/webhooks/clerk`
3. Eventos: `user.created`, `user.updated`, `user.deleted`

Crie a rota:

```typescript
// src/app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix';

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  // Verificar webhook
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  const evt = wh.verify(payload, headers);

  // Processar evento
  if (evt.type === 'user.created') {
    // Criar usuário no seu banco
  }

  return Response.json({ received: true });
}
```

## Desenvolvimento vs Produção

### Desenvolvimento

Use chaves de teste (`pk_test_`, `sk_test_`):
- Não cobra
- Dados separados
- Sem limites

### Produção

Use chaves de produção (`pk_live_`, `sk_live_`):
- Dados reais
- Billing aplicado
- Configure domínio no dashboard

## Troubleshooting

### Erro: "User is not signed in"

**Causa**: Middleware não está protegendo a rota ou usuário não está autenticado.

**Solução**:
1. Verifique se o middleware está configurado
2. Verifique se as variáveis de ambiente estão corretas
3. Limpe cookies e faça login novamente

### Erro: "Invalid publishable key"

**Causa**: Chave do Clerk incorreta ou não configurada.

**Solução**:
1. Verifique `.env.local`
2. Certifique-se de que a chave começa com `pk_test_` ou `pk_live_`
3. Reinicie o servidor (`npm run dev`)

### Redirecionamento não funciona

**Causa**: URLs não configuradas no `.env.local`.

**Solução**:
Adicione as variáveis:
```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

### Usuário não persiste após refresh

**Causa**: Problema com cookies ou session.

**Solução**:
1. Verifique se os cookies estão habilitados
2. Limpe cookies do navegador
3. Verifique se está em HTTPS em produção

## Segurança

### Boas Práticas

1. ✅ NUNCA commite `CLERK_SECRET_KEY` no git
2. ✅ Use `.env.local` (já no `.gitignore`)
3. ✅ Em produção, use variáveis de ambiente do servidor
4. ✅ Rotacione chaves secretas periodicamente
5. ✅ Use webhooks com verificação de assinatura
6. ✅ Limite roles e permissions ao mínimo necessário

### Rate Limiting

O Clerk já tem rate limiting integrado. Para APIs customizadas, implemente seu próprio rate limiting.

## Recursos Adicionais

- [Documentação Oficial do Clerk](https://clerk.com/docs)
- [Clerk + Next.js Guide](https://clerk.com/docs/quickstarts/nextjs)
- [API Reference](https://clerk.com/docs/reference/backend-api)

---

**Dica**: Sempre teste a autenticação em modo anônimo/incógnito para garantir que funciona corretamente.
