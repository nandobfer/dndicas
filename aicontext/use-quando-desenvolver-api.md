# Use Quando Desenvolver API

Diretrizes específicas para desenvolvimento de rotas de API no Next.js.

## Estrutura de APIs

APIs devem estar em `src/app/api`:
```
src/app/api/
├── core/              # APIs do core (exemplo/demonstração)
└── [feature]/         # APIs específicas de features
    ├── route.ts       # GET, POST, etc. da feature
    └── [id]/
        └── route.ts   # Rotas dinâmicas
```

## Consumindo APIs no Frontend

### Importante: Padrão de URL com Axios

O cliente axios está configurado com `baseURL: '/api'` em `src/core/utils/api.ts`.

**Isso significa:**
- ✅ Use caminhos **relativos** sem o prefixo `/api/`
- ❌ **Não** adicione `/api/` no início da URL

### Exemplos

```typescript
import api from '@/core/utils/api';

// ✅ CORRETO
await api.get('/companies');              // → GET /api/companies
await api.post('/core/ai', { prompt });   // → POST /api/core/ai
await api.get('/companies/123');          // → GET /api/companies/123

// ❌ ERRADO (resulta em /api/api/...)
await api.get('/api/companies');          // → GET /api/api/companies (404)
await api.post('/api/core/ai', data);     // → GET /api/api/core/ai (404)
```

### Usando hooks customizados

Os hooks `useQuery` e `useMutation` de `@/core/hooks/useApi` também seguem este padrão:

```typescript
import { useQuery, useMutation } from '@/core/hooks/useApi';

// ✅ CORRETO
const { data } = useQuery<Company[]>('/companies');
const { mutate } = useMutation('POST', '/core/ai');

// ❌ ERRADO
const { data } = useQuery<Company[]>('/api/companies');
const { mutate } = useMutation('POST', '/api/core/ai');
```

### Regra prática

> Se sua rota está em `src/app/api/companies/route.ts`, chame com `/companies` (sem `/api/`).

## Padrão de Resposta

Todas as APIs devem retornar um formato padronizado usando os tipos de `@/core/types/common`:

### Sucesso
```typescript
import { ApiResponse } from '@/core/types/common';

export async function GET() {
  const data = { /* seus dados */ };

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
  };

  return Response.json(response, { status: 200 });
}
```

### Erro
```typescript
import { ApiResponse } from '@/core/types/common';

export async function POST(request: Request) {
  try {
    // lógica
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Mensagem amigável do erro',
      code: 'ERROR_CODE',
    };

    return Response.json(response, { status: 400 });
  }
}
```

## Códigos de Status HTTP

Use códigos apropriados:
- `200`: Sucesso (GET, PUT, PATCH)
- `201`: Criado (POST)
- `204`: Sem conteúdo (DELETE bem-sucedido)
- `400`: Bad Request (validação falhou)
- `401`: Não autenticado
- `403`: Sem permissão
- `404`: Não encontrado
- `500`: Erro interno do servidor

## Autenticação

Use helpers do Clerk para proteger rotas:

```typescript
import { auth } from '@clerk/nextjs/server';
import { ApiResponse } from '@/core/types/common';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Não autenticado',
      code: 'UNAUTHORIZED',
    };
    return Response.json(response, { status: 401 });
  }

  // Lógica autenticada
}
```

## Validação de Dados

Use Zod para validar payloads:

```typescript
import { z } from 'zod';
import { ApiResponse } from '@/core/types/common';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(18).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = CreateUserSchema.parse(body);

    // Use validatedData que está type-safe

  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      };
      return Response.json(response, { status: 400 });
    }
    // Outros erros
  }
}
```

## Conexão com Banco de Dados

Sempre conecte antes de usar Mongoose:

```typescript
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';
import { User } from '@/features/users/models/user';

export async function POST(request: Request) {
  await dbConnect();

  const { userId } = await auth();
  const body = await request.json();

  const user = await User.create(body);

  // Log da ação
  await logAction('CREATE', 'User', user._id.toString(), userId, {
    email: user.email,
  });

  const response: ApiResponse<typeof user> = {
    success: true,
    data: user,
  };

  return Response.json(response, { status: 201 });
}
```

## Paginação

Use o tipo `PaginatedResponse` para listagens:

```typescript
import { PaginatedResponse } from '@/core/types/common';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const skip = (page - 1) * limit;

  await dbConnect();

  const [items, total] = await Promise.all([
    Model.find().skip(skip).limit(limit),
    Model.countDocuments(),
  ]);

  const response: PaginatedResponse<typeof items[0]> = {
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  return Response.json(response);
}
```

## Documentação OpenAPI

Use JSDoc para documentar suas APIs:

```typescript
/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Lista todos os usuários
 *     description: Retorna uma lista paginada de usuários
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número da página (padrão 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items por página (padrão 10)
 *     responses:
 *       200:
 *         description: Lista de usuários
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Não autenticado
 */
export async function GET(request: Request) {
  // implementação
}
```

## Exemplo Completo

```typescript
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';
import { ApiResponse } from '@/core/types/common';
import { Company } from '@/features/organizations/models/company';

const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ inválido'),
  email: z.string().email('Email inválido'),
});

/**
 * @openapi
 * /api/companies:
 *   post:
 *     summary: Cria uma nova empresa
 *     description: Cria uma nova empresa no sistema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - cnpj
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               cnpj:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Empresa criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 */
export async function POST(request: Request) {
  try {
    // 1. Autenticação
    const { userId } = await auth();
    if (!userId) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Não autenticado',
        code: 'UNAUTHORIZED',
      };
      return Response.json(response, { status: 401 });
    }

    // 2. Validação
    const body = await request.json();
    const validatedData = CreateCompanySchema.parse(body);

    // 3. Conexão DB
    await dbConnect();

    // 4. Verificar duplicatas
    const existing = await Company.findOne({ cnpj: validatedData.cnpj });
    if (existing) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'CNPJ já cadastrado',
        code: 'DUPLICATE_CNPJ',
      };
      return Response.json(response, { status: 400 });
    }

    // 5. Criar
    const company = await Company.create(validatedData);

    // 6. Log
    await logAction('CREATE', 'Company', company._id.toString(), userId, {
      name: company.name,
      cnpj: company.cnpj,
    });

    // 7. Resposta
    const response: ApiResponse<typeof company> = {
      success: true,
      data: company,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);

    if (error instanceof z.ZodError) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Dados inválidos',
        code: 'VALIDATION_ERROR',
        details: error.issues,
      };
      return Response.json(response, { status: 400 });
    }

    const response: ApiResponse<null> = {
      success: false,
      error: 'Erro ao criar empresa',
      code: 'INTERNAL_ERROR',
    };
    return Response.json(response, { status: 500 });
  }
}
```

## Rate Limiting

Para APIs sensíveis, considere implementar rate limiting (não incluído no core, mas recomendado para produção).

## CORS

Para APIs públicas, configure CORS apropriadamente no Next.js config ou na própria rota.

## Testes de API

Sempre teste suas APIs:
```typescript
// __tests__/api/companies/route.test.ts
describe('POST /api/companies', () => {
  it('should create a company', async () => {
    // teste
  });

  it('should return 400 for invalid data', async () => {
    // teste
  });
});
```

---

Seguir estes padrões garante consistência e manutenibilidade das APIs.
