# Módulo: Users

**Criado**: 2026-02-19 | **Atualizado**: DND-4 | **Status**: Implementado

---

## Visão Geral

O módulo de Users gerencia usuários locais do sistema Dungeons & Dicas, incluindo autenticação Auth.js e CRUD protegido por permissões do [Perfix](./perfix.md).

---

## Estrutura

```
src/features/users/
├── components/
│   ├── users-table.tsx           # Tabela de usuários com filtros
│   ├── user-form-modal.tsx       # Modal de criação/edição
│   ├── user-delete-dialog.tsx    # Modal de confirmação de exclusão
│   └── user-filters.tsx          # Filtros de perfil (exige roles.view) e status
├── hooks/
│   ├── useUsers.ts               # Hook de CRUD de usuários
│   └── useUsersFilters.ts        # Hook de filtros e busca
├── api/
│   ├── users.ts                  # Funções de API client-side
│   └── validation.ts             # Schemas Zod
├── models/
│   └── user.ts                   # Mongoose model User
└── types/
    └── user.types.ts             # Interfaces TypeScript
```

---

## Modelo de Dados

### User

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `legacyClerkId` | String | Não | ID legado usado apenas durante migração |
| `username` | String | Sim | Nome de usuário (único) |
| `email` | String | Sim | Email (único) |
| `name` | String | Não | Nome completo |
| `avatarUrl` | String | Não | URL do avatar |
| `roles` | String[] | Sim | IDs dos perfis Perfix |
| `accessVersion` | Number | Sim | Versão otimista das alterações administrativas |
| `status` | Enum | Sim | `'active'` ou `'inactive'` |
| `mcpTokenHash` | String | Não | Hash SHA-256 do token MCP permanente |
| `mcpTokenPrefix` | String | Não | Prefixo mascarado exibido no perfil |
| `mcpTokenSuffix` | String | Não | Sufixo mascarado exibido no perfil |
| `mcpTokenCreatedAt` | Date | Não | Data de geração do token MCP |
| `mcpTokenLastUsedAt` | Date | Não | Último uso autenticado do token MCP |

---

## API Endpoints

### GET /api/users

Lista usuários com paginação e filtros.

**Query Parameters**:
- `search` - Busca textual
- `roleId` - ID de um perfil (opcional)
- `status` - `all`, `active`, `inactive`
- `page` - Número da página
- `limit` - Registros por página (default: 10)

### POST /api/users

Cria novo usuário (`users.create`); recebe `roleIds` ou usa o padrão da integração Perfix.

### PUT /api/users/:id

Atualiza usuário (`users.edit`), com `roleIds` e `version`. Atribuição respeita hierarquia e não permite alterar os próprios perfis. Versão obsoleta retorna 409.

### DELETE /api/users/:id

Soft delete - marca como `inactive` e `deleted` (`users.delete`), exige `{ version }`. Autoexclusão e remoção do último admin são bloqueadas. Mutações são transacionais/auditadas; exigem replica set.

Respostas incluem `roleIds`, `roles: RoleDto[]` e `version`, sem `role` legado, dentro de `{ success, data }`. Listagem exige `users.view`. Durante impersonação, ownership usa o usuário efetivo e auditoria preserva o administrador real.

### GET /api/auth/profile

Retorna o perfil do usuário autenticado e o estado mascarado do token MCP, sem expor segredo completo nem hash.

### POST /api/auth/profile/mcp-token

Gera ou rotaciona o token MCP permanente do usuário autenticado. O token completo é retornado apenas nesta resposta.

### DELETE /api/auth/profile/mcp-token

Revoga o token MCP removendo hash e metadados persistidos do usuário autenticado.

---

## Hooks

### useUsers

```typescript
import { useUsers } from '@/features/users/hooks/useUsers';

const { 
  users, 
  isLoading, 
  createUser, 
  updateUser, 
  deleteUser 
} = useUsers(filters);
```

### useUsersFilters

```typescript
import { useUsersFilters } from '@/features/users/hooks/useUsersFilters';

const { 
  filters, 
  setSearch, 
  setRole, 
  setStatus, 
  setPage 
} = useUsersFilters();
```

---

## Componentes

### UsersTable

Tabela de usuários com server-side pagination e filtros.

```tsx
<UsersTable 
  onEdit={(user) => setEditingUser(user)}
  onDelete={(user) => setDeletingUser(user)}
/>
```

### UserFormModal

Modal de criação/edição com validação.

```tsx
<UserFormModal 
  user={editingUser}
  open={!!editingUser}
  onClose={() => setEditingUser(null)}
/>
```

---

## Validação (Zod)

```typescript
import { createUserSchema, updateUserSchema } from '@/features/users/api/validation';

// createUserSchema:
// - username: obrigatório, 3-50 chars, alfanumérico + underscore
// - email: obrigatório, formato email válido
// - name: opcional
// - avatarUrl: opcional, URL válida
// - role: 'admin' | 'user', default 'user'

// updateUserSchema: 
// - Todos campos opcionais
// - status: 'active' | 'inactive'
```

---

## Regras de Negócio

1. **Soft Delete**: Exclusão marca status como `inactive`, não remove registro
2. **Auto-exclusão proibida**: Usuário não pode excluir a si mesmo
3. **Autenticação local**: Usuários são criados/atualizados no MongoDB e autenticados pelo Auth.js
4. **Roles**: Apenas `admin` pode gerenciar usuários
5. **Auditoria**: Todas operações CRUD são registradas em AuditLog
6. **Status local**: `inactive` bloqueia acesso no backend local
7. **Token MCP**: O token permanente é salvo apenas como hash SHA-256 e usa `User._id.toString()` como usuário canônico nas chamadas MCP protegidas.

---

## Exemplos de Uso

### Listar usuários ativos

```typescript
const { users } = useUsers({ status: 'active' });
```

### Criar usuário

```typescript
const { createUser } = useUsers();

await createUser({
  username: 'novousuario',
  email: 'novo@exemplo.com',
  role: 'user',
});
```

### Soft delete

```typescript
const { deleteUser } = useUsers();

await deleteUser(userId); // Marca como inactive
```

---

## Dependências

- `@tanstack/react-query` - Estado de servidor
- `react-hook-form` - Formulários
- `zod` - Validação
- `framer-motion` - Animações
- `next-auth` - Autenticação Auth.js

## Formulário de usuário

`UserFormModal` valida por modo: na criação envia só `username`, `email`, `name` e `roleIds`
(`createUserSchema` é estrito; `status`/`version` existem só na edição). Erros sem campo aparecem como
erro geral do formulário (`role="alert"`), nunca são descartados.
