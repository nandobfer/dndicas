# Data Model: Liquid Glass Core

**Feature**: spec/000 | **Date**: 2026-02-19

---

## Entidades

### User

Representa um usuário do sistema, sincronizado com Clerk.

| Campo | Tipo | Obrigatório | Único | Descrição |
|-------|------|-------------|-------|-----------|
| `_id` | ObjectId | Sim | Sim | ID interno MongoDB |
| `clerkId` | String | Sim | Sim | ID do usuário no Clerk |
| `username` | String | Sim | Sim | Nome de usuário (login) |
| `email` | String | Sim | Sim | Email do usuário |
| `name` | String | Não | Não | Nome completo (display name) |
| `avatarUrl` | String | Não | Não | URL do avatar |
| `role` | Enum | Sim | Não | Função: `'admin'` ou `'user'` |
| `status` | Enum | Sim | Não | Status: `'active'` ou `'inactive'` |
| `createdAt` | Date | Sim | Não | Data de criação (automático) |
| `updatedAt` | Date | Sim | Não | Data de atualização (automático) |

**Indexes**:
- `clerkId` (unique)
- `username` (unique)
- `email` (unique)
- `status` (para filtros de listagem)
- `name` (text, para busca)

**Regras de Validação**:
- `username`: 3-50 caracteres, alfanumérico + underscore
- `email`: formato válido de email
- `role`: default `'user'`
- `status`: default `'active'`

**Transições de Estado**:
```
[Criação] → active
active → inactive (soft delete)
inactive → active (reativação)
```

**Mongoose Schema**:
```typescript
// src/features/users/models/user.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  clerkId: string;
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    clerkId: { type: String, required: true, unique: true },
    username: { 
      type: String, 
      required: true, 
      unique: true,
      minlength: 3,
      maxlength: 50,
      match: /^[a-zA-Z0-9_]+$/,
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    name: { type: String },
    avatarUrl: { type: String },
    role: { 
      type: String, 
      enum: ['admin', 'user'], 
      default: 'user',
    },
    status: { 
      type: String, 
      enum: ['active', 'inactive'], 
      default: 'active',
    },
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ status: 1 });
UserSchema.index({ name: 'text' });

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
```

---

### AuditLog

Representa um registro de auditoria de operação CRUD. **Nota**: Já existe em `src/core/database/audit-log.ts` mas será estendido via wrapper.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `_id` | ObjectId | Sim | ID interno MongoDB |
| `action` | Enum | Sim | Ação: `'CREATE'`, `'READ'`, `'UPDATE'`, `'DELETE'` |
| `entity` | String | Sim | Nome da entidade (ex: `'User'`) |
| `documentId` | String | Sim | ID do documento afetado |
| `userId` | ObjectId | Não | Referência ao User que executou |
| `previousData` | Mixed | Não | Estado anterior (para UPDATE/DELETE) |
| `newData` | Mixed | Não | Novo estado (para CREATE/UPDATE) |
| `timestamp` | Date | Sim | Data/hora da operação |
| `metadata` | Mixed | Não | Dados adicionais (IP, user agent, etc) |

**Indexes**:
- `timestamp` (para ordenação e filtros de período)
- `entity` (para filtros por entidade)
- `action` (para filtros por ação)
- `userId` (para filtros por usuário)

**Regras de Validação**:
- `action`: deve ser um dos valores enum
- `previousData`: obrigatório para UPDATE e DELETE
- `newData`: obrigatório para CREATE e UPDATE

**Mongoose Schema Estendido**:
```typescript
// src/features/users/models/audit-log-extended.ts
import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

export interface IAuditLogExtended extends Document {
  action: AuditAction;
  entity: string;
  documentId: string;
  userId?: mongoose.Types.ObjectId;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  timestamp: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
  };
}

const AuditLogExtendedSchema = new Schema<IAuditLogExtended>({
  action: { 
    type: String, 
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE'], 
    required: true,
  },
  entity: { type: String, required: true },
  documentId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  previousData: { type: Schema.Types.Mixed },
  newData: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, required: true },
  metadata: {
    ip: { type: String },
    userAgent: { type: String },
  },
});

// Indexes para performance em grandes volumes
AuditLogExtendedSchema.index({ timestamp: -1 });
AuditLogExtendedSchema.index({ entity: 1 });
AuditLogExtendedSchema.index({ action: 1 });
AuditLogExtendedSchema.index({ userId: 1 });
AuditLogExtendedSchema.index({ entity: 1, timestamp: -1 }); // Compound

export const AuditLogExtended = 
  mongoose.models.AuditLogExtended || 
  mongoose.model<IAuditLogExtended>('AuditLogExtended', AuditLogExtendedSchema);
```

---

### ThemeConfig (Runtime, não persistido)

Configuração de tema centralizada, usada em runtime para configurar componentes.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `colors` | Object | Paleta de cores (rarity, action, role, glass) |
| `glassmorphism` | Object | Configurações de blur, opacity, border |
| `motion` | Object | Variantes de animação Framer Motion |
| `spacing` | Object | Espaçamentos padrão |

**Arquivo de Configuração**:
```typescript
// src/lib/config/theme-config.ts
import { colors } from './colors';
import { glassConfig } from './glass-config';
import { motionConfig } from './motion-configs';

export const themeConfig = {
  colors,
  glass: glassConfig,
  motion: motionConfig,
  spacing: {
    sidebar: {
      expanded: 280,
      collapsed: 72,
    },
    page: {
      padding: 24,
      gap: 16,
    },
  },
};
```

---

## Relacionamentos

```
┌─────────────┐         ┌─────────────────┐
│    User     │◄────────│   AuditLog      │
│             │  userId │                 │
│ _id         │         │ userId (ref)    │
│ clerkId     │         │ action          │
│ username    │         │ entity          │
│ email       │         │ documentId      │
│ role        │         │ previousData    │
│ status      │         │ newData         │
└─────────────┘         └─────────────────┘
```

**Regras de Integridade**:
- AuditLog.userId é referência fraca (não usa foreign key constraint)
- Se User for soft-deleted, AuditLogs permanecem com userId válido
- Queries de AuditLog podem popular userId para exibir dados do usuário

---

## Schemas de Validação (Zod)

```typescript
// src/features/users/api/validation.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string()
    .min(3, 'Username deve ter no mínimo 3 caracteres')
    .max(50, 'Username deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username deve conter apenas letras, números e underscore'),
  email: z.string()
    .email('Email inválido'),
  name: z.string().optional(),
  avatarUrl: z.string().url('URL inválida').optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateUserSchema = createUserSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

export const userFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['all', 'admin', 'user']).default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

export const auditLogFiltersSchema = z.object({
  action: z.enum(['all', 'CREATE', 'READ', 'UPDATE', 'DELETE']).default('all'),
  entity: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

// Types inferidos
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserFilters = z.infer<typeof userFiltersSchema>;
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;
```

---

## Tipos TypeScript

```typescript
// src/features/users/types/user.types.ts
import type { IUser } from '../models/user';

// Response types para API
export interface UserResponse {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface UsersListResponse {
  items: UserResponse[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuditLogResponse {
  id: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  entity: string;
  documentId: string;
  user?: UserResponse;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditLogsListResponse {
  items: AuditLogResponse[];
  total: number;
  page: number;
  totalPages: number;
}

// Helper para converter Mongoose doc para response
export const toUserResponse = (user: IUser): UserResponse => ({
  id: user._id.toString(),
  username: user.username,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
```
