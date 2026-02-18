# Use Quando Desenvolver no Módulo Core

**IMPORTANTE**: Este arquivo é para manutenção do template base. Desenvolvedores que usam o template NÃO devem modificar o core.

## Quando Modificar o Core

Modifique o core APENAS quando:

1. ✅ Adicionar funcionalidade base que TODOS os projetos vão usar
2. ✅ Corrigir bugs em serviços core
3. ✅ Melhorar performance de utilitários base
4. ✅ Atualizar dependências do core
5. ✅ Adicionar novos componentes UI base do ShadCN

Não modifique o core para:

1. ❌ Funcionalidades específicas de um projeto
2. ❌ Lógica de negócio particular
3. ❌ Customizações de UI específicas
4. ❌ Integrações com serviços terceiros específicos

## Estrutura do Core

```
src/core/
├── ai/                 # Serviços de IA (GenAI)
│   ├── genai.ts       # Cliente e funções principais
│   └── usage-log.ts   # Schema e logging de uso
├── auth/              # Helpers de autenticação
│   └── helpers.ts     # Funções auxiliares para Clerk
├── context/           # React Contexts globais
│   └── app-context.tsx
├── database/          # MongoDB e auditoria
│   ├── db.ts          # Conexão cached
│   └── audit-log.ts   # Schema e função de log
├── email/             # Serviço de email
│   └── mailer.ts      # Wrapper do nodemailer
├── hooks/             # React Hooks reutilizáveis
│   ├── useAuth.ts
│   ├── useStorage.ts
│   └── useApi.ts
├── storage/           # S3/Minio
│   └── s3.ts          # Upload/download de arquivos
├── types/             # Tipos TypeScript globais
│   ├── common.ts      # ApiResponse, etc.
│   ├── database.ts
│   └── models.ts
├── ui/                # Componentes UI base (ShadCN)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── form.tsx
│   └── layout/
│       ├── sidebar.tsx
│       └── topbar.tsx
└── utils/             # Utilitários gerais
    ├── index.ts       # cn(), formatters, etc.
    ├── api.ts         # Cliente axios configurado
    └── storage.ts     # LocalStorage wrapper
```

## Princípios do Core

### 1. Zero Configuração

O core deve funcionar com configuração mínima via env vars. Usuários não devem precisar modificar código do core para usar.

### 2. Extensível

Sempre forneça pontos de extensão:

```typescript
// ✅ BOM: Permite override
export function sendEmail(to: string, subject: string, html: string, options?: EmailOptions) {
  // ...
}

// ❌ RUIM: Não permite customização
function sendEmail(to: string, subject: string) {
  // hardcoded
}
```

### 3. Type-Safe

Todo código do core deve ter tipos explícitos:

```typescript
// ✅ BOM
export async function generateText(
  prompt: string,
  modelName: string = defaultModel
): Promise<string> {
  // ...
}

// ❌ RUIM
export async function generateText(prompt, model) {
  // ...
}
```

### 4. Error Handling

Sempre trate erros gracefully:

```typescript
export async function uploadFile(key: string, body: Buffer) {
  if (!s3Client) {
    throw new Error('S3 Client not initialized. Check environment variables.');
  }

  try {
    // operação
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload file');
  }
}
```

### 5. Logging

Log operações importantes:

```typescript
export async function sendEmail(to: string, subject: string, html: string) {
  if (!SMTP_HOST) {
    console.log('SMTP not configured. Mock email sent:', { to, subject });
    return;
  }

  try {
    await transporter.sendMail({ to, subject, html });
    console.log('Email sent successfully to:', to);
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
}
```

## Adicionando Novos Serviços ao Core

### 1. Criar Estrutura

```
src/core/new-service/
├── index.ts           # Exportações principais
├── client.ts          # Cliente/configuração
└── types.ts           # Tipos específicos (se houver muitos)
```

### 2. Implementar Serviço

```typescript
// src/core/new-service/client.ts
const API_KEY = process.env.NEW_SERVICE_API_KEY;

let client: ServiceClient | null = null;

export function getClient() {
  if (!client) {
    if (!API_KEY) throw new Error('NEW_SERVICE_API_KEY not set');
    client = new ServiceClient({ apiKey: API_KEY });
  }
  return client;
}

export async function doSomething(params: Params): Promise<Result> {
  const client = getClient();
  try {
    const result = await client.action(params);
    // Log se necessário
    return result;
  } catch (error) {
    console.error('Error in new service:', error);
    throw error;
  }
}
```

### 3. Exportar

```typescript
// src/core/new-service/index.ts
export { doSomething } from './client';
export type { Params, Result } from './types';
```

### 4. Documentar

Atualizar `aicontext/core-context.md` com descrição do novo serviço.

### 5. Adicionar ao .env.example

```bash
# New Service
NEW_SERVICE_API_KEY=your_key_here
```

## Adicionando Componentes UI

Sempre use ShadCN CLI:

```bash
npx shadcn@latest add [component-name]
```

Isso garante consistência. Os componentes são adicionados em `src/core/ui/`.

### Customizar Componente Base

Se precisar customizar um componente ShadCN, faça APÓS adicionar:

```typescript
// src/core/ui/button.tsx (após shadcn add button)

// Adicione variantes customizadas SE aplicável a todos os projetos
const buttonVariants = cva(
  // base classes
  {
    variants: {
      variant: {
        default: "...",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Adicione apenas variantes universais
      },
    },
  }
);
```

## Adicionando Hooks

```typescript
// src/core/hooks/useMyHook.ts
import { useState, useEffect } from 'react';

/**
 * Hook para fazer X
 * @param param - Descrição
 * @returns Valor retornado
 */
export function useMyHook(param: string) {
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // lógica
  }, [param]);

  return state;
}
```

Documente no JSDoc para facilitar uso.

## Adicionando Types

```typescript
// src/core/types/common.ts

/**
 * Resposta padrão de API
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any;
}

/**
 * Resposta paginada
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

## Testando Mudanças no Core

Sempre teste mudanças no core:

```typescript
// __tests__/core/service.test.ts
import { doSomething } from '@/core/new-service';

describe('New Service', () => {
  it('should work correctly', async () => {
    const result = await doSomething({ param: 'value' });
    expect(result).toBeDefined();
  });

  it('should throw error when not configured', () => {
    // teste sem API_KEY
  });
});
```

## Versionamento do Core

Quando fizer mudanças breaking no core:

1. Documente no CHANGELOG.md (criar se não existir)
2. Considere adicionar migrations/guias de atualização
3. Versione o template no package.json

## Atualizando Dependências

Ao atualizar dependências do core:

```bash
npm update [package]
npm test  # Garanta que tudo funciona
```

Teste especialmente:
- Next.js
- React
- Clerk
- Mongoose
- ShadCN components

## Code Review Checklist

Antes de commitar mudanças no core:

- [ ] Tipos TypeScript corretos
- [ ] Error handling implementado
- [ ] Logs apropriados
- [ ] Documentação atualizada em aicontext/
- [ ] .env.example atualizado se novos env vars
- [ ] Testes escritos/atualizados
- [ ] Zero breaking changes (ou documentado)
- [ ] Code é genérico e reutilizável

## Comunicação com Usuários do Template

Quando o core é atualizado:

1. Usuários devem fazer `git pull` do remote do template
2. Resolver conflitos (se houver)
3. Atualizar dependências: `npm install`
4. Verificar .env.local com novas variáveis

Documente mudanças em CHANGELOG.md.

---

**Lembre-se**: O core é compartilhado por todos os projetos. Mudanças devem ser cautelosas e bem testadas.
