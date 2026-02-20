# Módulo: Users

**Criado**: 2026-02-19 | **Feature**: spec/000 | **Status**: Planejado

---

## Visão Geral

O módulo de Users gerencia usuários do sistema Dungeons & Dicas, incluindo sincronização com Clerk, CRUD administrativo e controle de roles.

---

## Estrutura

```
src/features/users/
├── components/
│   ├── users-table.tsx           # Tabela de usuários com filtros
│   ├── user-form-modal.tsx       # Modal de criação/edição
│   ├── user-delete-dialog.tsx    # Modal de confirmação de exclusão
│   └── user-filters.tsx          # Filtros de função e status
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
| `clerkId` | String | Sim | ID do usuário no Clerk |
| `username` | String | Sim | Nome de usuário (único) |
| `email` | String | Sim | Email (único) |
| `name` | String | Não | Nome completo |
| `avatarUrl` | String | Não | URL do avatar |
| `role` | Enum | Sim | `'admin'` ou `'user'` |
| `status` | Enum | Sim | `'active'` ou `'inactive'` |

---

## API Endpoints

### GET /api/users

Lista usuários com paginação e filtros.

**Query Parameters**:
- `search` - Busca textual
- `role` - `all`, `admin`, `user`
- `status` - `all`, `active`, `inactive`
- `page` - Número da página
- `limit` - Registros por página (default: 10)

### POST /api/users

Cria novo usuário (admin only).

### PUT /api/users/:id

Atualiza usuário (admin only).

### DELETE /api/users/:id

Soft delete - marca como `inactive` (admin only).

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
3. **Sincronização Clerk**: Usuários são criados/atualizados via webhook ou middleware
4. **Roles**: Apenas `admin` pode gerenciar usuários
5. **Auditoria**: Todas operações CRUD são registradas em AuditLog

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
- `@clerk/nextjs` - Autenticação
