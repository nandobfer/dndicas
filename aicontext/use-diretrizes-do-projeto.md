# Diretrizes Consolidadas do Projeto

Este arquivo consolida todas as diretrizes, decisões arquiteturais e lições aprendidas durante o desenvolvimento do Sipal NextJS Starter.

## 🎯 Visão Geral do Projeto

### Objetivo

Template starter Next.js para projetos da Sipal com:
- Core imutável e atualizável via git
- Autenticação (Clerk)
- Banco de dados (MongoDB)
- IA (Google Gemini)
- Storage (S3/Minio)
- Email (Nodemailer)
- UI (ShadCN + Tailwind)

### Conceito Fundamental: Core Imutável

O `src/core/` é a base compartilhada entre todos os projetos derivados:
- **NÃO deve ser modificado** nos projetos
- **Atualizado via git pull** do template
- **Estendido via composição** e wrappers

## 🏗️ Arquitetura

### Estrutura de Diretórios

```
src/
├── core/                    # Base imutável (NÃO MODIFICAR)
│   ├── ai/                 # Google Gemini
│   ├── auth/               # Helpers Clerk
│   ├── context/            # React Contexts
│   ├── database/           # MongoDB + Auditoria
│   ├── email/              # Nodemailer
│   ├── hooks/              # React Hooks reutilizáveis
│   ├── storage/            # S3/Minio
│   ├── types/              # TypeScript types globais
│   ├── ui/                 # Componentes ShadCN
│   └── utils/              # Utilitários (api, storage, etc.)
├── features/               # Módulos específicos do projeto
│   └── organizations/      # Exemplo: CRUD empresas
└── app/                    # Rotas e páginas Next.js
    ├── (auth)/            # Páginas públicas de autenticação
    ├── (dashboard)/       # Páginas autenticadas
    └── api/               # API Routes
```

### Princípios Arquiteturais

1. **Separation of Concerns**: Core / Features / App
2. **DRY (Don't Repeat Yourself)**: Código reutilizável no core
3. **Composition over Inheritance**: Compor sobre o core, não modificar
4. **Type Safety First**: TypeScript strict mode
5. **API-First**: APIs padronizadas e documentadas

## 📋 Decisões Arquiteturais Importantes

### 1. Autenticação: Clerk

**Decisão**: Usar Clerk em vez de NextAuth ou implementação própria

**Razão**:
- Gerenciamento completo de sessões
- UI pronta (SignIn, SignUp, UserProfile)
- Roles e permissions integrados
- Webhooks para sincronização

**Implementação**:
- Middleware protege todas as rotas automaticamente
- Rotas públicas definidas via `createRouteMatcher`
- Helper `requireAuth()` para APIs

**Problema Resolvido**:
- Middleware original não protegia rotas (apenas logava)
- Solução: Adicionar `await auth.protect()`

### 2. Banco de Dados: MongoDB + Mongoose

**Decisão**: MongoDB com Mongoose

**Razão**:
- Schema flexível
- Mongoose fornece validação e types
- Cached connection para evitar conexões múltiplas
- Auditoria integrada

**Implementação**:
- `dbConnect()` com cache global
- `logAction()` para auditoria automática
- Schemas com timestamps automáticos

### 3. IA: Google Gemini via @google/genai

**Decisão**: Google Gemini em vez de OpenAI

**Razão**:
- Modelo flash gratuito e rápido
- API simples
- Suporte a streaming
- Multimodal (texto, imagem)

**Implementação**:
- Serviço centralizado em `src/core/ai/genai.ts`
- Logging automático de tokens
- Funções: `generateText`, `generateTextStream`, `chat`, `countTokens`
- Desenvolvedores **NÃO** devem usar `@google/genai` diretamente

### 4. Storage: S3/Minio

**Decisão**: AWS SDK S3 (compatível com Minio)

**Razão**:
- Padrão de mercado
- Minio para desenvolvimento local
- URLs assinadas para segurança

**Implementação**:
- `uploadFile()` e `getFileUrl()` abstraem complexidade
- Suporta S3, Minio, e qualquer serviço compatível

### 5. Email: Nodemailer

**Decisão**: Nodemailer

**Razão**:
- Agnóstico de provedor SMTP
- Simples de configurar
- Suporta templates HTML

**Implementação**:
- Mock automático se SMTP não configurado
- Função única: `sendEmail(to, subject, html)`

### 6. UI: ShadCN + Tailwind

**Decisão**: ShadCN em vez de libs de componentes fechadas

**Razão**:
- Código copiado para o projeto (não pacote npm)
- Customizável 100%
- Baseado em Radix UI (acessibilidade)
- Tailwind CSS v4 para performance

**Implementação**:
- Componentes em `src/core/ui/`
- Tema via variáveis CSS HSL
- `cn()` utility para class merging

## 🔐 Segurança

### Proteção de Rotas

**Regra**: Todas as rotas requerem autenticação, exceto explicitamente públicas

**Implementação**:
```typescript
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

if (!isPublicRoute(req)) {
  await auth.protect(); // Redireciona para login se não autenticado
}
```

### APIs Protegidas

**Regra**: Todas as APIs devem verificar autenticação

**Implementação**:
```typescript
import { requireAuth } from '@/core/auth';

export async function GET() {
  const userId = await requireAuth(); // Lança erro se não autenticado
  // Lógica da API
}
```

### Validação de Dados

**Regra**: Sempre validar inputs com Zod

**Implementação**:
```typescript
const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const validatedData = schema.parse(body);
```

### Secrets

**Regra**: NUNCA commitar secrets no git

**Implementação**:
- `.env.local` no `.gitignore`
- `.env.local.example` como template
- Secrets em variáveis de ambiente do servidor

## 📊 Padrões de API

### Formato de Resposta Padrão

**Sucesso**:
```typescript
{
  success: true,
  data: { /* dados */ }
}
```

**Erro**:
```typescript
{
  success: false,
  error: "Mensagem amigável",
  code: "ERROR_CODE",
  details?: any // Opcional (ex: erros de validação Zod)
}
```

### Paginação

```typescript
{
  success: true,
  data: [ /* itens */ ],
  pagination: {
    page: 1,
    limit: 10,
    total: 100,
    totalPages: 10
  }
}
```

### Códigos HTTP

- `200`: Sucesso (GET, PUT, PATCH)
- `201`: Criado (POST)
- `204`: Sem conteúdo (DELETE)
- `400`: Bad Request (validação)
- `401`: Não autenticado
- `403`: Sem permissão
- `404`: Não encontrado
- `500`: Erro interno

## 🎨 Padrões de UI

### Componentes

**Base**: ShadCN em `src/core/ui/`

**Uso**:
```typescript
import { Button } from '@/core/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
```

**Extensão** (NÃO modificar core):
```typescript
// ✅ Criar wrapper
export function CustomButton(props) {
  return <Button {...props} className="my-custom-class" />;
}

// ❌ NUNCA editar src/core/ui/button.tsx
```

### Tema

**Cores**: Variáveis CSS HSL em `src/app/globals.css`

```css
:root {
  --primary: 142.1 76.2% 36.3%; /* Verde Sipal */
  --radius: 0.5rem;
}
```

**Customização**: Apenas editar variáveis, não componentes do core

### Ícones

**Biblioteca**: Lucide React

```typescript
import { Home, User, Settings } from 'lucide-react';

<Home className="h-4 w-4" />
```

## 🧪 Testes

### Estrutura

```
__tests__/
├── core/           # Testes do core
└── features/       # Testes de features
```

### Padrão

- Jest + React Testing Library
- Mock de serviços externos
- Foco em comportamento, não implementação

### Exemplo

```typescript
describe('Button', () => {
  it('should render with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });
});
```

## 📝 Documentação

### Para Novo Módulo

1. Crie arquivo em `aicontext/modules/[nome-modulo].md`
2. Use template:
   ```markdown
   # Módulo: [Nome]
   ```

### Para Nova Diretriz Geral

1. Avalie se se encaixa em arquivo existente
2. Se não, crie `use-[categoria]-[contexto].md`
3. Atualize `README.md` com referência

### Para Decisão Arquitetural

1. Adicione em `use-diretrizes-do-projeto.md`
2. Seção apropriada: Arquitetura, Segurança, etc.

## ✅ Benefícios da Organização

### 1. Clareza

✅ Nomenclatura consistente e previsível
✅ Um propósito por arquivo
✅ Fácil de encontrar informação

### 2. Manutenibilidade

✅ Sem redundância
✅ Informações consolidadas
✅ Fácil de atualizar

### 3. Usabilidade para IA

✅ Contexto claro pelo nome do arquivo
✅ Estrutura previsível
✅ Referências cruzadas

### 4. Documentação Como Código

✅ Versionada com o projeto
✅ Evolui com o código
✅ Mantida pela equipe

## 🎓 Princípios

### Context-Driven Development

> Fornecer o contexto certo, na hora certa, para o desenvolvedor (humano ou IA) certo.

### Single Responsibility

> Cada arquivo tem um propósito específico e bem definido.

### DRY (Don't Repeat Yourself)

> Informações não são duplicadas entre arquivos.

### Progressive Disclosure

> Informações básicas primeiro, detalhes conforme necessário.

## 📊 Antes vs Depois

### Antes

```
aicontext/
├── api-guidelines.md         (redundante)
├── configuracao-clerk.md     (nomenclatura inconsistente)
├── core-context.md           (redundante)
├── project-rules.md          (redundante)
├── prompt/                   (misturado com contexto)
└── use-*.md                  (apenas alguns arquivos)
```

### Depois

```
aicontext/
├── README.md                 (índice completo)
├── use-*.md                  (nomenclatura padronizada)
├── use-diretrizes-*.md       (consolidação)
└── modules/                  (docs de módulos)
```

## 🔍 Mapa de Migração

| Informação Antiga | Novo Local |
|-------------------|------------|
| api-guidelines.md | use-quando-desenvolver-api.md |
| core-context.md | use-quando-desenvolver-no-modulo-core.md |
| project-rules.md | use-sempre-que-desenvolver.md |
| configuracao-clerk.md | use-para-configurar-clerk.md |
| Decisões arquiteturais (espalhadas) | use-diretrizes-do-projeto.md |
| prompt/0-desenvolvimento.md | docs/prompt-original/ |

---

**Mantido por**: Equipe Dungeons & Dicas
  max_memory_restart: "512M",
}
```

### Variáveis de Ambiente

**Desenvolvimento**: `.env.local` (local)

**Produção**: Variáveis no servidor (Vercel, Railway, etc.)

**Críticas**:
- `MONGODB_URI`
- `CLERK_SECRET_KEY`
- `GOOGLE_API_KEY`

## 🐛 Problemas Comuns e Soluções

### 1. Autenticação Não Funciona

**Sintoma**: UserProfile não renderiza, acesso sem login

**Causa**: Middleware não protege rotas

**Solução**: Verificar `src/middleware.ts` tem `await auth.protect()`

### 2. MongoDB Não Conecta

**Sintoma**: Erro ao acessar APIs

**Causa**: `MONGODB_URI` não configurada

**Solução**: Verificar `.env.local` e reiniciar servidor

### 3. IA Não Funciona

**Sintoma**: Erro ao gerar texto

**Causa**: `GOOGLE_API_KEY` inválida

**Solução**: Obter nova chave em https://aistudio.google.com

### 4. Storage Não Funciona

**Sintoma**: Upload/download falha

**Causa**: Credenciais S3 não configuradas

**Solução**: Todas variáveis `S3_*` devem estar no `.env.local`

### 5. Email Não Envia

**Sintoma**: Erro ao enviar email

**Solução**: Se `SMTP_HOST` não configurado, emails são mockados (apenas log)

## ✅ Checklist de Qualidade

### Para Novo Desenvolvimento

- [ ] Código em TypeScript strict
- [ ] Types importados de `@/core/types`
- [ ] APIs seguem formato padronizado
- [ ] Validação com Zod
- [ ] Autenticação verificada
- [ ] Auditoria de ações críticas
- [ ] Core não foi modificado
- [ ] Documentação atualizada

### Para Pull Request

- [ ] Testes passando
- [ ] Lint sem erros
- [ ] Build sem erros
- [ ] Documentação em `aicontext/modules/` (se novo módulo)
- [ ] `.env.local.example` atualizado (se novas variáveis)
- [ ] README atualizado (se mudanças arquiteturais)

## 🎓 Lições Aprendidas

### 1. Middleware Deve Proteger Ativamente

**Aprendizado**: Logar tentativas não é suficiente, deve chamar `auth.protect()`

### 2. Variáveis de Ambiente Requerem Restart

**Aprendizado**: Sempre reiniciar servidor após alterar `.env.local`

### 3. Core Deve Ser Transparente

**Aprendizado**: Desenvolvedores não devem interagir com libs diretamente (ex: não usar `@google/genai`, usar `generateText()`)

### 4. Documentação É Crítica

**Aprendizado**: Documentação contextual facilita desenvolvimento assistido por IA

### 5. Extensibilidade Precisa Ser Projetada

**Aprendizado**: Fornecer pontos de extensão claros evita modificações no core

## 📚 Referências

- **Next.js**: https://nextjs.org/docs
- **Clerk**: https://clerk.com/docs
- **ShadCN**: https://ui.shadcn.com
- **Zod**: https://zod.dev
- **Mongoose**: https://mongoosejs.com/docs
- **Google AI**: https://ai.google.dev/docs

---

**Importante**: Este arquivo documenta decisões e padrões. Para instruções práticas, consulte os arquivos `use-*` específicos.

**Mantido por**: Equipe Sipal
**Última atualização**: 2026-01-27
