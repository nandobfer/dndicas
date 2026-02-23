# Module: Traits (Habilidades)

**Feature ID**: 002-traits-catalog  
**Domain**: D&D 5e Reference Catalog  
**Status**: Planned (implementation pending)

---

## Purpose

The Traits module provides CRUD functionality for managing D&D 5e character traits (e.g., darkvision, fey ancestry) in a structured catalog. It follows the exact same architecture, components, and patterns established by the Rules module (`src/features/rules/`).

Users can:
- View paginated list of traits with search and status filtering
- Create/edit/delete traits with rich-text descriptions
- Reference traits via @mentions in other entity descriptions
- Track all changes via audit logs

---

## Module Structure

```
src/features/traits/
├── types/
│   └── traits.types.ts           # TypeScript interfaces and types
├── api/
│   ├── traits-api.ts              # Client-side API functions
│   └── validation.ts              # Zod validation schemas
├── hooks/
│   ├── useTraits.ts               # TanStack Query for GET operations
│   └── useTraitMutations.ts      # TanStack Query for mutations
├── components/
│   ├── traits-page.tsx            # Main orchestrator component
│   ├── traits-table.tsx           # Paginated data table
│   ├── traits-filters.tsx         # Search and status filters
│   ├── trait-form-modal.tsx       # Create/edit modal
│   └── delete-trait-dialog.tsx    # Confirmation dialog
└── utils/
    └── suggestion.ts              # Mention autocomplete logic (shared)
```

---

## Database Schema

**Collection**: `traits`  
**Model**: `src/core/database/models/trait.ts` (mirrors `reference.ts` structure)

```typescript
interface ITrait {
  _id: string;
  name: string;         // Unique, max 100 chars, text indexed
  description: string;  // HTML content with @mentions, max 50,000 chars
  source: string;       // Book/source (e.g., "Player's Handbook", "Tasha's")
  status: 'active' | 'inactive';  // Visibility control
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:
- Text index: `{ name: 'text', description: 'text' }` (for search)
- Regular index: `{ status: 1 }` (for filtering)
- Unique index: `{ name: 1 }` (enforce uniqueness)

---

## API Endpoints

**Base**: `/api/traits`  
**Authentication**: Clerk (required for mutations)  
**Contract**: [contracts/traits.yaml](../../specs/002-traits-catalog/contracts/traits.yaml)

### Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/api/traits` | List traits (paginated, filtered, searched) | No |
| POST | `/api/traits` | Create new trait | Yes |
| GET | `/api/traits/[id]` | Get single trait by ID | No |
| PUT | `/api/traits/[id]` | Update existing trait | Yes |
| DELETE | `/api/traits/[id]` | Soft/hard delete trait | Yes |
| GET | `/api/traits/search` | Search for mentions (limit 10) | No |

### Query Parameters (GET /api/traits)
- `page` (number, default: 1)
- `limit` (number, default: 10, max: 50)
- `search` (string, searches name + description)
- `status` (enum: 'active' | 'inactive' | 'all')

---

## Types & Validation

### Core Types (`types/traits.types.ts`)

```typescript
// Frontend entity type
export interface Trait {
  _id: string;
  name: string;
  description: string;
  source: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

// Create input
export interface CreateTraitInput {
  name: string;
  description: string;
  source: string;
  status: 'active' | 'inactive';
}

// Update input (all fields optional)
export interface UpdateTraitInput {
  name?: string;
  description?: string;
  source?: string;
  status?: 'active' | 'inactive';
}

// Filters
export interface TraitsFilters {
  search: string;
  status: 'all' | 'active' | 'inactive';
  page: number;
  limit: number;
}

// API response
export interface TraitsResponse {
  traits: Trait[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### Validation Schemas (`api/validation.ts`)

```typescript
import { z } from 'zod';

export const createTraitSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  description: z.string().min(1, "Descrição é obrigatória").max(50000),
  source: z.string().max(200),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateTraitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(50000).optional(),
  source: z.string().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
```

---

## React Hooks

### `useTraits()` - Fetch Traits List

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchTraits } from '../api/traits-api';

export const traitKeys = {
  all: ['traits'] as const,
  lists: () => [...traitKeys.all, 'list'] as const,
  list: (filters: TraitsFilters) => [...traitKeys.lists(), filters] as const,
  details: () => [...traitKeys.all, 'detail'] as const,
  detail: (id: string) => [...traitKeys.details(), id] as const,
};

export function useTraits(filters: TraitsFilters) {
  return useQuery({
    queryKey: traitKeys.list(filters),
    queryFn: () => fetchTraits(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
```

### `useTraitMutations()` - Create/Update/Delete

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTrait, updateTrait, deleteTrait } from '../api/traits-api';
import { traitKeys } from './useTraits';

export function useTraitMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: createTrait,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traitKeys.lists() });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTraitInput }) => 
      updateTrait(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traitKeys.all });
    },
  });

  const remove = useMutation({
    mutationFn: deleteTrait,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traitKeys.all });
    },
  });

  return { create, update, remove };
}
```

---

## Key Components

### `TraitsPage` - Orchestrator

Main page component that coordinates table, filters, and modals.

**Location**: `components/traits-page.tsx`  
**Pattern**: Copy from `rules-page.tsx`

```tsx
export function TraitsPage() {
  const [filters, setFilters] = useState<TraitsFilters>({ ... });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrait, setEditingTrait] = useState<Trait | null>(null);
  
  const { data, isLoading } = useTraits(filters);
  const { create, update } = useTraitMutations();

  // Render: Header + Filters + Table + Modal
}
```

### `TraitsTable` - Data Grid

Displays traits in sortable, paginated table.

**Columns**: Status Badge, Nome, Descrição (truncated), Fonte, Prever (preview), Ações (edit/delete)

### `TraitFormModal` - Create/Edit Form

Modal with React Hook Form + Zod validation.

**Fields**:
- Nome (text input, max 100 chars)
- Fonte (text input, max 200 chars)
- Status (switch toggle: Active/Inactive)
- Descrição (RichTextEditor with mentions and S3-backed images)

### `TraitsFilters` - Search and Status

- `SearchInput` for name/description search
- `StatusChips` for active/inactive/all filtering

---

## Mentions and Preview

### Mentions Rendering
Traits use the `Habilidade` (gray) color scheme from `entityColors`. When an entity is deleted, mentions to it must be rendered with a "broken" visual style:
- **Color**: Red (#EF4444)
- **Decoration**: Line-through (Strikethrough)
- **Opacity**: 50%
- **Tooltip**: Displays "Entidade não encontrada"

### Preview Eye Icon
In the `TraitsTable`, the "Prever" column uses an **eye icon**. Clicking it opens a preview of the trait (name, source, and truncated description) using the `EntityPreviewTooltip` logic.

---

## Integration Points

### 1. Sidebar Navigation

**File**: `src/components/ui/expandable-sidebar.tsx`

Add to `cadastrosItems` array:
```typescript
{ label: "Habilidades", href: "/traits", icon: Sparkles }
```

### 2. Entity Colors

**File**: `src/lib/config/colors.ts`

Add `Habilidade` to `entityColors`:
```typescript
Habilidade: {
  name: 'Habilidade',
  color: 'gray',
  mention: "bg-gray-500/10 text-gray-300 border-gray-400/20",
  badge: "bg-gray-400/20 text-gray-300",
  border: "border-gray-500/20",
  hex: rarityColors.common, // #9CA3AF
}
```

### 3. Mention System

**Files**: 
- `src/features/traits/utils/suggestion.ts` (fetch from `/api/traits/search`)
- `src/core/ui/rich-text-editor/mention-list.tsx` (already supports multiple entity types)
- `src/core/ui/rich-text-editor/mention-badge.tsx` (uses entityColors)

**Behavior**: Typing `@` triggers autocomplete dropdown showing traits + rules (merged, max 10 results).

### 4. Audit Logs

**Files**:
- All mutation endpoints call `createAuditLog()`
- Audit service: `src/core/database/services/audit-log.service.ts`
- Logs table: `src/features/users/components/audit-logs-table.tsx`

**Actions logged**:
- `CREATE` - New trait created
- `UPDATE` - Trait modified (with changes diff)
- `DELETE` - Trait deleted

### 5. Dashboard Card

**Files**:
- `src/app/(dashboard)/_components/entity-card.tsx` (generalized card component)
- `src/app/(dashboard)/_components/traits-entity-card.tsx` (Traits-specific card)
- `src/app/(dashboard)/page.tsx` (add to `dndEntities` array)
- `src/app/api/dashboard/stats/route.ts` (fetch traits stats)

**Stats displayed**: Total traits, Active traits, Growth (last 30 days)

---

## Performance Considerations

- **Pagination**: Server-side, default 10 items/page, max 50
- **Search**: MongoDB text index on `name` and `description` fields
- **Caching**: TanStack Query staleTime = 5 minutes
- **Lazy loading**: Dashboard card stats fetched only on dashboard mount
- **Mention search**: Limited to 10 results, debounced input (300ms)

---

## Testing Strategy

### Unit Tests
- Hooks: `useTraits`, `useTraitMutations` with mocked fetch
- Components: `TraitsTable`, `TraitFormModal` with React Testing Library
- Validation: Zod schemas with edge cases

### Integration Tests
- API routes: Create → Edit → Delete flow
- Mention autocomplete: Verify traits appear in dropdown
- Audit logs: Verify CREATE/UPDATE/DELETE logged correctly

### E2E Tests (Manual)
- Full user flow: Create trait → Mention it in another trait → Edit → Delete
- Verify "broken" mention styling after deletion
- Check dashboard stats update correctly

---

## Common Pitfalls

1. **Mention not showing**: Ensure `/api/traits/search` endpoint returns `entityType: "Habilidade"` in each result
2. **Unique name error**: MongoDB unique index enforced - check name uniqueness before save
3. **HTML not rendering**: Verify `EntityDescription` component is used to render trait descriptions
4. **Audit log missing userId**: Ensure Clerk `auth()` is called in all mutation endpoints
5. **Type errors**: Keep frontend types (`Trait`) separate from Mongoose types (`ITrait`)

---

## Usage Examples for AI Agents

### Creating a new trait programmatically
```typescript
const newTrait = await createTrait({
  name: "Darkvision",
  description: "<p>You can see in dim light within 60 feet as if it were bright light.</p>",
  source: "Player's Handbook",
  status: "active"
});
```

### Fetching traits with filters
```typescript
const { data } = useTraits({
  search: "vision",
  status: "active",
  page: 1,
  limit: 10
});
```

### Mentioning a trait in another entity
```typescript
<RichTextEditor
  value={description}
  onChange={setDescription}
  placeholder="Digite @ para mencionar habilidades ou regras..."
  enableMentions={true}
/>
// Typing "@Dark" shows "Darkvision" in autocomplete
// Selecting it inserts: <span data-type="mention" data-id="..." data-entity="Habilidade">@Darkvision</span>
```

---

## References

- **Feature Spec**: [specs/002-traits-catalog/spec.md](../../specs/002-traits-catalog/spec.md)
- **Implementation Plan**: [specs/002-traits-catalog/plan.md](../../specs/002-traits-catalog/plan.md)
- **Data Model**: [specs/002-traits-catalog/data-model.md](../../specs/002-traits-catalog/data-model.md)
- **API Contract**: [specs/002-traits-catalog/contracts/traits.yaml](../../specs/002-traits-catalog/contracts/traits.yaml)
- **Quickstart Guide**: [specs/002-traits-catalog/quickstart.md](../../specs/002-traits-catalog/quickstart.md)
- **Template Module**: `src/features/rules/` (replicate this structure exactly)
