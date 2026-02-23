# Data Model: Cadastro de Habilidades (Traits)

**Feature**: 002-traits-catalog  
**Date**: 2026-02-23  
**Status**: Phase 1 Complete

## Overview

This document defines the data model for the Traits (Habilidades) feature. The model closely mirrors the Reference (Rules) model, ensuring consistency across catalog entities.

---

## Entities

### Trait (Habilidade)

Represents a D&D 5e trait, ability, or feature (e.g., racial traits, class features, background features).

**MongoDB Collection**: `traits`

**Schema**:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `_id` | ObjectId | Auto | Primary key | MongoDB document ID |
| `name` | String | Yes | Unique, max 100 chars, trimmed | Trait name (e.g., "Fúria Bárbara") |
| `description` | String | Yes | Max 50,000 chars | HTML-formatted content with mentions, images, and rich formatting |
| `source` | String | Yes | Max 200 chars, trimmed | Reference source (e.g., "PHB pg. 48", "Xanathar's Guide") |
| `status` | Enum | Yes | `'active'` \| `'inactive'` (default: `'active'`) | Visibility status for filtering |
| `createdAt` | Date | Auto | Timestamp | Record creation timestamp |
| `updatedAt` | Date | Auto | Timestamp | Last modification timestamp |

**Indexes**:
- Text index: `{ name: "text", description: "text" }` - Enables fast full-text search
- Regular index: `{ status: 1 }` - Optimizes status-based filtering
- Unique index: `{ name: 1 }` - Enforces uniqueness constraint

**Virtual Fields**:
- `id`: String (mapped from `_id`) - Friendly ID for frontend usage

**Validation Rules**:
- `name`: 3-100 characters, unique across collection
- `description`: Minimum 10 characters (to ensure meaningful content)
- `source`: Required, non-empty string
- `status`: Must be exactly `'active'` or `'inactive'`

**Example Document**:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Fúria Bárbara",
  "description": "<p>Como ação bônus, você pode entrar em fúria durante 1 minuto. Enquanto estiver em fúria, você ganha os seguintes benefícios:</p><ul><li>Vantagem em testes de Força</li><li>+2 em dano com armas corpo a corpo</li><li>Resistência a dano físico</li></ul><p>Relacionado: <span data-type=\"mention\" data-id=\"507f1f77bcf86cd799439012\" data-label=\"Ataque Imprudente\" data-entity-type=\"Regra\"></span></p>",
  "source": "PHB pg. 48",
  "status": "active",
  "createdAt": "2026-02-23T10:00:00.000Z",
  "updatedAt": "2026-02-23T10:00:00.000Z"
}
```

---

## Relationships

### Trait ↔ AuditLog (1:N)

- **Nature**: One Trait can have many Audit Logs
- **Implementation**: Audit logs reference Trait via `entityId` and `entity: 'Trait'`
- **Cascade**: Audit logs are NOT deleted when Trait is deleted (historical preservation)

### Trait ↔ Mention (Embedded)

- **Nature**: One Trait description can contain many mentions to other entities (Rules, other Traits)
- **Implementation**: Mentions stored as HTML `<span>` elements with `data-type="mention"`, `data-id`, `data-label`, `data-entity-type` attributes
- **Referential Integrity**: Weak - mentions reference entity IDs but don't enforce existence (allows "broken" mentions for deleted entities)

### Trait ↔ User (N:1 - via Audit Log)

- **Nature**: Each Trait operation (CREATE/UPDATE/DELETE) is associated with a User
- **Implementation**: AuditLog stores `performedBy` (Clerk User ID)
- **Cascade**: No direct relationship in Trait document; user info retrieved via audit log

---

## Type Definitions (TypeScript)

### Frontend Types (`src/features/traits/types/traits.types.ts`)

```typescript
/**
 * Trait entity as returned from API
 */
export interface Trait {
  _id: string;       // MongoDB ObjectId as string
  id: string;        // Virtual field (same as _id)
  name: string;
  description: string; // HTML content
  source: string;
  status: 'active' | 'inactive';
  createdAt: string;  // ISO 8601 date string
  updatedAt: string;  // ISO 8601 date string
}

/**
 * Input for creating a new trait
 */
export interface CreateTraitInput {
  name: string;
  description: string;
  source: string;
  status: 'active' | 'inactive';
}

/**
 * Input for updating an existing trait
 */
export interface UpdateTraitInput extends Partial<Omit<CreateTraitInput, 'name'>> {
  name?: string; // Name is optional for updates
}

/**
 * Filters for querying traits
 */
export interface TraitsFilters {
  search?: string;              // Search in name and description
  status?: 'active' | 'inactive' | 'all';
  page?: number;                // Pagination page (1-indexed)
  limit?: number;               // Items per page (default: 10)
}

/**
 * Paginated response from GET /api/traits
 */
export interface TraitsResponse {
  items: Trait[];
  total: number;
  page: number;
  limit: number;
}
```

### Backend Types (`src/core/database/models/trait.ts`)

```typescript
import { Document } from 'mongoose';

/**
 * Mongoose document interface for Trait
 */
export interface ITrait extends Document {
  name: string;
  description: string;
  source: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}
```

### Validation Schemas (`src/features/traits/api/validation.ts`)

```typescript
import { z } from 'zod';

/**
 * Zod schema for creating a trait
 */
export const createTraitSchema = z.object({
  name: z.string()
    .min(3, "Nome deve ter pelo menos 3 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  description: z.string()
    .min(10, "Descrição deve ter pelo menos 10 caracteres")
    .max(50000, "Descrição muito longa"),
  source: z.string()
    .min(1, "Fonte é obrigatória")
    .max(200, "Fonte muito longa"),
  status: z.enum(["active", "inactive"]),
});

/**
 * Zod schema for updating a trait
 */
export const updateTraitSchema = createTraitSchema.partial().omit({ name: true }).extend({
  name: z.string().min(3).max(100).optional()
});

export type CreateTraitSchema = z.infer<typeof createTraitSchema>;
export type UpdateTraitSchema = z.infer<typeof updateTraitSchema>;
```

---

## Query Patterns

### 1. List Traits (Paginated, Searchable, Filterable)

```typescript
// Backend (MongoDB)
const query: Record<string, unknown> = {};

// Search filter
if (search) {
  query.$or = [
    { name: { $regex: search, $options: 'i' } },
    { description: { $regex: search, $options: 'i' } }
  ];
}

// Status filter
if (status && status !== 'all') {
  query.status = status;
}

const items = await Trait.find(query)
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit);

const total = await Trait.countDocuments(query);
```

### 2. Search Traits for Mentions (Name-only, Limited)

```typescript
// Backend (MongoDB)
const items = await Trait.find({
  name: { $regex: query, $options: 'i' }
})
  .limit(10)
  .select('_id name source status'); // Only return needed fields
```

### 3. Get Single Trait by ID

```typescript
// Backend (MongoDB)
const trait = await Trait.findById(id);
if (!trait) throw new Error('Trait not found');
```

### 4. Check Name Uniqueness

```typescript
// Backend (MongoDB)
const existing = await Trait.findOne({ name: newName });
if (existing) throw new Error('Trait name already exists');
```

---

## State Management

### TanStack Query Keys

```typescript
export const traitKeys = {
  all: ['traits'] as const,
  lists: () => [...traitKeys.all, 'list'] as const,
  list: (filters: TraitsFilters) => [...traitKeys.lists(), filters] as const,
  details: () => [...traitKeys.all, 'detail'] as const,
  detail: (id: string) => [...traitKeys.details(), id] as const,
};
```

**Usage**:
- `useTraits(filters)` → `queryKey: traitKeys.list(filters)`
- `useQuery({ queryKey: traitKeys.detail(id), ... })` → Fetch single trait

### Cache Invalidation Strategy

| Operation | Invalidates |
|-----------|-------------|
| Create Trait | `traitKeys.lists()` |
| Update Trait | `traitKeys.lists()`, `traitKeys.detail(id)` |
| Delete Trait | `traitKeys.lists()`, `traitKeys.detail(id)` |

---

## Migration Notes

**No database migration required.** This is a new collection with no dependencies on existing data.

**Steps**:
1. Deploy model definition (`src/core/database/models/trait.ts`)
2. MongoDB automatically creates `traits` collection on first insert
3. Indexes are created on first query (or can be ensured with `Trait.createIndexes()`)

**Rollback Plan**:
- Drop collection: `db.traits.drop()`
- Remove API routes: Delete `src/app/api/traits/`
- Remove feature module: Delete `src/features/traits/`

---

## Data Integrity Rules

### Business Rules

1. **Unique Names**: Each trait must have a unique name (case-insensitive enforced by index)
2. **Non-Empty Description**: Description must contain at least 10 characters (validated by Zod)
3. **Valid Status**: Status must be exactly `'active'` or `'inactive'` (enforced by Mongoose enum)
4. **Audit Trail**: All CREATE/UPDATE/DELETE operations must generate audit logs (enforced in API routes)

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate name | Return 409 Conflict error |
| Mention to deleted entity | Render badge with "broken" style: Red color (#EF4444), Strikethrough, and Opacity 50%. Tooltip shows "Entidade não encontrada" |
| Empty search query | Return all traits (paginated) |
| Invalid status value | Return 400 Bad Request with Zod validation error |
| Trait referenced in other descriptions | Allow deletion (mentions become "broken" but remain visible) |

---

## Performance Considerations

**Text Search Optimization**:
- Text index on `name` and `description` enables fast regex queries
- Limit search results to 10 items for mention dropdown
- Use `searchField='name'` for mention search (avoids scanning description)

**Pagination**:
- Server-side pagination prevents loading entire collection
- Default limit of 10 items balances UX and performance
- Use `skip()` + `limit()` instead of `.slice()` for efficiency

**Rich-Text Storage**:
- HTML string storage is efficient (no JSON parsing overhead)
- Consider compressing descriptions exceeding 10KB (future optimization)

**Index Strategy**:
- Text index: `{ name: "text", description: "text" }` - Supports full-text search
- Single-field index: `{ status: 1 }` - Optimizes status filters
- Compound index not needed (queries filter by status OR search, rarely both simultaneously)

---

## Conclusion

The Trait data model is **production-ready** and follows established patterns from the Reference (Rules) model. All relationships, types, and query patterns are well-defined and testable.

**Next Steps**: Generate API contracts in `/contracts/` folder.
