# Dungeons & Dicas

Template starter para o projeto Dungeons & Dicas, com autenticação, banco de dados, IA, storage e mais.

## Características

- **Next.js 16+** com App Router e Server Components
- **TypeScript** em modo strict
- **Clerk** para autenticação
- **MongoDB + Mongoose** para banco de dados
- **Google Gemini** (GenAI) para IA
- **Nodemailer** para envio de emails
- **S3/Minio** para storage de arquivos
- **ShadCN UI** para componentes visuais
- **Tailwind CSS v4** para estilização
- **Jest** para testes
- **PM2** configurado para produção

## Conceito do Core

Este template segue o conceito de **Core Imutável**:

- **`src/core/`**: Código base que NÃO deve ser modificado nos projetos derivados
- **`src/features/`**: Módulos específicos do projeto
- **`src/app/`**: Rotas e páginas Next.js

O core é atualizado via `git pull` do template, permitindo que melhorias sejam distribuídas para todos os projetos.

## Instalação

### 1. Clone o template

```bash
git clone <repository-url> my-project
cd my-project
npm install
```

### 2. Configure variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha:

```bash
cp .env.local.example .env.local
```

```env
# Database
MONGODB_URI=mongodb://localhost:27017/my_database

# Auth (Clerk) - OBRIGATÓRIO
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# AI (Google Gemini)
GOOGLE_API_KEY=AIza...

# Email (Nodemailer)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password
SMTP_FROM=noreply@example.com

# Storage (S3/Minio)
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=my-bucket
S3_REGION=us-east-1
```

### 3. Configurar Clerk (Autenticação)

1. Crie uma conta em https://clerk.com
2. Crie uma nova aplicação
3. Copie as chaves API e adicione no `.env.local`
4. Configure as URLs conforme acima

**Documentação completa**: `aicontext/configuracao-clerk.md`

### 4. Execute o projeto

```bash
npm run dev
```

Acesse http://localhost:3000

**Primeira execução**: Você será redirecionado para `/sign-in`. Crie uma conta para acessar o dashboard.

## Estrutura do Projeto

```
sipal-nextjs-starter/
├── aicontext/                      # Documentação para IA
│   ├── use-sempre-que-desenvolver.md
│   ├── use-quando-desenvolver-api.md
│   ├── use-para-atualizar-tema-e-componentes-ui.md
│   └── modules/                    # Docs de módulos
├── src/
│   ├── core/                       # NÃO MODIFICAR
│   │   ├── ai/                     # Serviços de IA
│   │   ├── auth/                   # Helpers de autenticação
│   │   ├── context/                # React Contexts
│   │   ├── database/               # MongoDB e auditoria
│   │   ├── email/                  # Envio de emails
│   │   ├── hooks/                  # React Hooks
│   │   ├── storage/                # S3/Minio
│   │   ├── types/                  # TypeScript types
│   │   ├── ui/                     # Componentes UI (ShadCN)
│   │   └── utils/                  # Utilitários
│   ├── features/                   # Seus módulos
│   │   └── organizations/          # Exemplo: CRUD de empresas
│   └── app/                        # Rotas Next.js
│       ├── (auth)/                 # Páginas de autenticação
│       ├── (dashboard)/            # Páginas autenticadas
│       └── api/                    # API Routes
├── public/                         # Assets estáticos
├── ecosystem.config.js             # Configuração PM2
├── jest.config.ts                  # Configuração de testes
└── package.json
```

## Serviços do Core

### Banco de Dados

```typescript
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';

await dbConnect();
await logAction('CREATE', 'User', userId, currentUserId);
```

### Autenticação

```typescript
import { requireAuth, getCurrentUser } from '@/core/auth';

const userId = await requireAuth(); // Lança erro se não autenticado
const user = await getCurrentUser(); // Retorna dados do usuário
```

### IA (Gemini)

```typescript
import { generateText } from '@/core/ai/genai';

const response = await generateText('Explique Next.js', undefined, userId);
// Uso é automaticamente registrado
```

### Email

```typescript
import { sendEmail } from '@/core/email/mailer';

await sendEmail('user@example.com', 'Assunto', '<p>Conteúdo HTML</p>');
```

### Storage (S3/Minio)

```typescript
import { uploadFile, getFileUrl } from '@/core/storage/s3';

await uploadFile('path/file.pdf', buffer, 'application/pdf');
const url = await getFileUrl('path/file.pdf');
```

### Hooks

```typescript
import { useAuth, useStorage, useApi } from '@/core/hooks';

const { user, isSignedIn } = useAuth();
const [theme, setTheme] = useStorage('theme', 'light');
const { data, loading, execute } = useApi(() => api.get('/api/data'));
```

## Criando um Novo Módulo

1. Crie a estrutura em `src/features/my-module/`:

```
src/features/my-module/
├── models/          # Schemas Mongoose
├── components/      # Componentes React
├── services/        # Lógica de negócio
└── types/           # Tipos TypeScript
```

2. Crie as APIs em `src/app/api/my-module/`

3. Documente em `aicontext/modules/my-module.md`

## Páginas Exemplo

O template inclui páginas de demonstração:

- **/examples/ai** - Geração de texto com IA
- **/examples/storage** - Upload/download de arquivos
- **/examples/email** - Envio de emails
- **/companies** - CRUD completo de empresas (exemplo de módulo)

## Desenvolvendo com IA

Este template foi projetado para desenvolvimento assistido por IA. Consulte a documentação em `aicontext/`:

### Arquivos de Contexto

- **[README.md](./aicontext/README.md)** - Índice completo da documentação
- **[use-sempre-que-desenvolver.md](./aicontext/use-sempre-que-desenvolver.md)** - Regras gerais do projeto
- **[use-quando-desenvolver-api.md](./aicontext/use-quando-desenvolver-api.md)** - Padrões de API REST
- **[use-para-atualizar-tema-e-componentes-ui.md](./aicontext/use-para-atualizar-tema-e-componentes-ui.md)** - Customização de UI e tema
- **[use-para-estender-o-core.md](./aicontext/use-para-estender-o-core.md)** - Como estender funcionalidades do core
- **[use-para-configurar-clerk.md](./aicontext/use-para-configurar-clerk.md)** - Configuração completa do Clerk
- **[use-diretrizes-do-projeto.md](./aicontext/use-diretrizes-do-projeto.md)** - Decisões arquiteturais e lições aprendidas

**Para IA**: Sempre carregue o arquivo `use-*` relevante antes de gerar código

## Testes

```bash
npm test              # Executa todos os testes
npm test -- --watch   # Modo watch
```

## Build e Deploy

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

### Com PM2

```bash
pm2 start ecosystem.config.js
pm2 logs
pm2 stop all
```

## Atualização do Core

Para receber atualizações do template:

```bash
# Adicione o remote do template (apenas uma vez)
git remote add template <template-repository-url>

# Atualize o core
git fetch template
git merge template/main

# Resolva conflitos se houver
# Arquivos em src/core devem vir do template
# Seus arquivos em src/features e src/app devem ser preservados
```

## Customização

### Tema

Edite `src/app/globals.css` para alterar cores:

```css
:root {
  --primary: 142.1 76.2% 36.3%; /* Verde D&D */
  --radius: 0.5rem;
}
```

Veja `aicontext/use-para-atualizar-tema-e-componentes-ui.md` para mais detalhes.

### Componentes UI

Para adicionar novos componentes do ShadCN:

```bash
npx shadcn@latest add [component-name]
```

### Extensão do Core

**NÃO modifique arquivos em `src/core`**. Para customizar:

```typescript
// ❌ ERRADO: editar src/core/ui/button.tsx

// ✅ CORRETO: criar wrapper
import { Button } from '@/core/ui/button';

export function MyButton(props) {
  return <Button {...props} className="my-custom-class" />;
}
```

## Troubleshooting

### MongoDB não conecta

- Verifique se o MongoDB está rodando
- Verifique `MONGODB_URI` no `.env.local`

### Clerk não autentica / Redirecionamento não funciona

**Sintomas**:
- Erro: "User is not signed in"
- Acesso direto a rotas protegidas sem login
- Componentes do Clerk não renderizam

**Solução**:
1. Verifique se **TODAS** as variáveis do Clerk estão no `.env.local`:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
   ```
2. **Reinicie o servidor** após alterar `.env.local`
3. Limpe cookies do navegador ou use modo anônimo
4. Verifique se as chaves são válidas no dashboard do Clerk

**Documentação completa**: `aicontext/configuracao-clerk.md`

### Storage não funciona

- Verifique credenciais do S3/Minio
- Teste o endpoint manualmente
- Storage funciona apenas se todas as variáveis estiverem configuradas

### Email não envia

- Se SMTP não configurado, emails são "mockados" (apenas log)
- Verifique credenciais do provedor de email

## Suporte

Para dúvidas ou problemas:

1. Consulte a documentação em `aicontext/`
2. Verifique exemplos em `src/app/(dashboard)/examples/`
3. Consulte o módulo exemplo em `src/features/organizations/`

## Licença

[Sua licença aqui]

---

**Desenvolvido pela equipe Dungeons & Dicas**
