# Módulo: Organizations (Organizações)

Módulo exemplo que demonstra implementação de CRUD completo fora do core.

## Objetivo

Gerenciar empresas, filiais e clientes no sistema, demonstrando:
- Estrutura de features separadas do core
- Relacionamentos entre entidades (Company -> Branch -> Client)
- CRUD completo com APIs REST
- Validação com Zod
- Auditoria de ações
- Paginação de listagens

## Estrutura

```
src/features/organizations/
├── models/              # Schemas Mongoose
│   ├── company.ts      # Empresa
│   ├── branch.ts       # Filial
│   └── client.ts       # Cliente
├── components/          # Componentes React (se houver)
├── services/            # Lógica de negócio (se houver)
└── types/               # Tipos TypeScript específicos
```

## Schemas do Banco de Dados

### Company (Empresa)

```typescript
{
  name: string;          // Nome da empresa
  cnpj: string;          // CNPJ (14 dígitos)
  email: string;
  phone?: string;
  website?: string;
  address?: Address;
  status: 'active' | 'inactive';
  timestamps: true;
}
```

### Branch (Filial)

```typescript
{
  companyId: string;     // Referência à empresa
  name: string;
  code: string;          // Código único da filial
  email: string;
  phone?: string;
  address: Address;      // Obrigatório
  status: 'active' | 'inactive';
  timestamps: true;
}
```

### Client (Cliente)

```typescript
{
  companyId: string;     // Referência à empresa
  branchId?: string;     // Referência à filial (opcional)
  name: string;
  document: string;      // CPF ou CNPJ
  documentType: 'cpf' | 'cnpj';
  email: string;
  phone: string;
  mobile?: string;
  address?: Address;
  notes?: string;
  status: 'active' | 'inactive';
  timestamps: true;
}
```

## APIs

### Companies

- **GET /api/companies** - Lista empresas (paginado, busca)
- **POST /api/companies** - Cria empresa
- **GET /api/companies/[id]** - Busca empresa por ID
- **PUT /api/companies/[id]** - Atualiza empresa
- **DELETE /api/companies/[id]** - Exclui empresa

### Branches

- **GET /api/branches** - Lista filiais
- **POST /api/branches** - Cria filial
- **GET /api/branches/[id]** - Busca filial
- **PUT /api/branches/[id]** - Atualiza filial
- **DELETE /api/branches/[id]** - Exclui filial

### Clients

- **GET /api/clients** - Lista clientes
- **POST /api/clients** - Cria cliente
- **GET /api/clients/[id]** - Busca cliente
- **PUT /api/clients/[id]** - Atualiza cliente
- **DELETE /api/clients/[id]** - Exclui cliente

## Fluxo de Dados

1. **Criação de Empresa**: Validação -> DB Insert -> Audit Log
2. **Listagem**: Query com paginação -> Retorno formatado
3. **Atualização**: Validação -> Find & Update -> Audit Log
4. **Exclusão**: Find & Delete -> Audit Log

## Validação

Usando Zod schemas para validar payloads:

```typescript
const CreateCompanySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().regex(/^\d{14}$/),
  email: z.string().email(),
  // ...
});
```

## Auditoria

Todas as operações (CREATE, UPDATE, DELETE) são registradas via `logAction()`.

## Paginação

Listagens suportam:
- `page`: número da página (padrão: 1)
- `limit`: itens por página (padrão: 10)
- `search`: busca textual

## Relacionamentos

- Uma **Company** pode ter várias **Branches**
- Uma **Branch** pertence a uma **Company**
- Um **Client** pode pertencer a uma **Company** e opcionalmente a uma **Branch**

## Páginas Frontend

### Implementadas

#### Companies Page (`src/app/(dashboard)/companies/page.tsx`)
✅ Página completa de listagem de empresas:
- Tabela responsiva com dados das empresas
- Busca por nome ou CNPJ
- Paginação (anterior/próxima)
- Formatação de CNPJ (XX.XXX.XXX/XXXX-XX)
- Status visual (Ativa/Inativa)
- Ações: Editar e Excluir
- Loading states e empty states
- Integração com API via axios

**Localização**: `/companies` (rota protegida por autenticação)

### A Implementar

- Formulário de criação/edição de empresa (modal ou página separada)
- Página de visualização detalhada de empresa
- Páginas de Branches (`/branches`)
- Páginas de Clients (`/clients`)
- Relacionamentos visuais entre entidades

## Exemplo de Uso

### Criar empresa via API (Backend)

```bash
POST /api/companies
{
  "name": "Empresa Exemplo",
  "cnpj": "12345678000190",
  "email": "contato@exemplo.com"
}
```

### Buscar empresas (Backend)

```bash
GET /api/companies?page=1&limit=10&search=Exemplo
```

### Consumir API no Frontend

**Importante**: Use o cliente axios configurado em `@/core/utils/api` que já possui `baseURL: '/api'`.

```typescript
import api from '@/core/utils/api';

// ✅ CORRETO - não adicione /api/ no início
const response = await api.get('/companies?page=1&limit=10');
const companies = response.data.data;

// ❌ ERRADO - não use /api/ no início (causa /api/api/...)
const response = await api.get('/api/companies'); // 404 error
```

## Extensões Possíveis

- Adicionar campos customizados por projeto
- Implementar soft delete
- Adicionar permissões por empresa
- Relatórios e dashboards
- Exportação de dados

---

Este módulo serve como referência para criar outros módulos fora do core.
