# Quickstart Guide: Catálogo de Magias D&D

**Feature**: 004-spells-catalog  
**For**: Developers implementing the Spells Catalog feature  
**Last Updated**: 2026-02-25

## Overview

This guide provides a step-by-step walkthrough for implementing the D&D Spells Catalog feature. Follow these instructions to set up the development environment, understand the architecture, and implement components in the recommended order.

---

## Prerequisites

Before starting, ensure you have:

- [x] Access to the repository on branch `004-spells-catalog`
- [x] Node.js 20+ LTS installed
- [x] MongoDB Atlas connection string in `.env.local`
- [x] Clerk API keys configured
- [x] Familiarity with existing Rules or Feats features (review their code structure)
- [x] Read the constitution (`.specify/memory/constitution.md`)
- [x] Read the spec (`specs/004-spells-catalog/spec.md`)
- [x] Read the plan (`specs/004-spells-catalog/plan.md`)
- [x] Read the data model (`specs/004-spells-catalog/data-model.md`)

---

## Architecture Overview

```
User Request → Next.js Page (SSR) → API Route → Service Layer → Mongoose Model → MongoDB
                     ↓                                                           ↓
                Client Hydration → TanStack Query → Cache → UI Components ← Audit Log
```

**Key Patterns**:
1. **SSR + Hydration**: Initial data fetched on server, hydrated to client with TanStack Query
2. **Feature-Based Structure**: All spell code in `src/features/spells/`
3. **Extracted Components**: Reusable UI components in `src/components/ui/`
4. **Hook-Based Logic**: Business logic in custom hooks, components stay pure
5. **Audit Logging**: Every CUD operation creates audit log entry

---

## Development Setup

### 1. Environment Variables

Ensure `.env.local` contains:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://...

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# S3 (for rich text images)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=...
```

### 2. Install Dependencies

```bash
npm install
# All dependencies already exist in package.json
```

### 3. Run Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000/spells` (after implementing the route).

---

## Implementation Order

Follow this sequence to minimize dependency issues:

### Phase 1: Data Layer (Backend)

1. **Mongoose Model** (`src/features/spells/models/spell.ts`)
   - Define `ISpell`, `DiceValue`, `SpellSchema`
   - Add validation, indexes, virtuals
   - Export `Spell` model

2. **TypeScript Types** (`src/features/spells/types/spells.types.ts`)
   - Define `Spell`, `DiceValue`, `SpellSchool`, `AttributeType`
   - Define `CreateSpellInput`, `UpdateSpellInput`, `SpellsFilters`
   - Define API response types

3. **Zod Validation** (`src/features/spells/api/validation.ts`)
   - `diceValueSchema`, `createSpellSchema`, `updateSpellSchema`, `spellsQuerySchema`
   - Export inferred types

4. **Service Layer** (`src/features/spells/api/spells-service.ts`)
   - `listSpells(filters, page, limit, isAdmin)` - query with filters, pagination
   - `getSpellById(id, isAdmin)` - fetch single spell
   - `createSpell(input, userId)` - create + audit log
   - `updateSpell(id, input, userId)` - update + audit log
   - `deleteSpell(id, userId)` - delete + audit log

5. **API Routes**
   - `src/app/api/spells/route.ts`: GET (list), POST (create)
   - `src/app/api/spells/[id]/route.ts`: GET (one), PUT (update), DELETE

6. **Test Data Layer**
   - `__tests__/features/spells/api/validation.test.ts` - Zod schema tests
   - `__tests__/features/spells/api/spells-service.test.ts` - Service logic tests (mocked DB)

---

### Phase 2: UI Foundation (Extracted Components)

**Order matters** - these are dependencies for spell-specific components.

7. **glass-level-chip.tsx** (extract from feats-table.tsx)
   - Props: `level: number`, `variant?: chipVariant`
   - Displays "Nv. 3", "Truque" (circle 0), color by rarity
   - Hook: `useLevelChip(level)` returns `{label, variant}`

8. **glass-attribute-chip.tsx** (extract from feats-table.tsx)
   - Props: `attribute: AttributeType`, `value?: number`, `size?: 'sm' | 'md'`
   - Displays "FOR +2", "DES" with color from `attributeColors`
   - Reusable in spells (no value), feats (with value)

9. **glass-dice-value.tsx** (NEW)
   - Props: `value: DiceValue | null | undefined`, `size?: 'sm' | 'md'`
   - Displays "2d6" with dice icon, color by dice type
   - Empty state: "—" or "Nenhum"
   - Hook: `useDiceDisplay(value)` returns `{label, color, icon}`

10. **glass-dice-selector.tsx** (NEW)
    - Props: `value: DiceValue | null`, `onChange: (v: DiceValue | null) => void`, `label: string`, `error?: string`
    - Numeric input + dice type select (d4-d20) side-by-side
    - Clear button to set null
    - Hook: `useDiceSelector(value, onChange)` handles state logic

11. **glass-spell-school.tsx** (NEW)
    - Props: `school: SpellSchool`, `size?: 'sm' | 'md'`
    - Chip with school name + color from `spellSchoolColors`
    - Config added to `lib/config/colors.ts`

12. **glass-status-toggler.tsx** (extract from form modals)
    - Props: `status: 'active' | 'inactive'`, `onToggle: (s) => void`, `disabled?: boolean`
    - Renders label "Status da Regra/Talento/Magia" + `GlassSwitch`
    - Reusable in all entity forms

13. **Test UI Components**
    - `__tests__/components/ui/glass-dice-value.test.tsx`
    - `__tests__/components/ui/glass-dice-selector.test.tsx`
    - `__tests__/components/ui/glass-spell-school.test.tsx`

---

### Phase 3: Spells Feature (Frontend)

14. **TanStack Query Hooks** (`src/features/spells/api/spells-queries.ts`)
    - `useSpells(filters, page, limit)` - list query
    - `useSpell(id)` - single spell query
    - `useCreateSpell()` - mutation
    - `useUpdateSpell()` - mutation
    - `useDeleteSpell()` - mutation
    - Query keys: `['spells', filters]`, `['spell', id]`

15. **Custom Hooks**
    - `useSpellFilters()` (`src/features/spells/hooks/useSpellFilters.ts`) - filter state
    - `useSpellForm(spell?)` (`src/features/spells/hooks/useSpellForm.ts`) - form logic with RHF + Zod

16. **Spell Components** (follow Rules/Feats patterns exactly)
    - `spells-filters.tsx` - clone `rules-filters.tsx`, add spell-specific filters
    - `spells-table.tsx` - clone `rules-table.tsx`, adjust columns
    - `spell-form-modal.tsx` - clone `rule-form-modal.tsx`, adjust fields
    - `spell-preview.tsx` - clone `feat-preview.tsx`, adjust rendering
    - `spells-entity-card.tsx` - clone `rules-entity-card.tsx`, adjust stats

17. **Page Components**
    - `src/app/(dashboard)/spells/page.tsx` - SSR list page
    - `src/app/(dashboard)/spells/loading.tsx` - loading state

18. **Test Spell Components**
    - `__tests__/features/spells/components/spells-table.test.tsx`
    - `__tests__/features/spells/components/spell-form-modal.test.tsx`

---

### Phase 4: Integration

19. **Extend Audit Log**
    - `src/features/users/models/audit-log-extended.ts`: Add "Spell" to entity enum
    - `src/features/users/components/audit-log-detail-modal.tsx`: Add "Spell" label
    - `src/features/users/components/audit-logs-table.tsx`: Add Spell icon (Wand from lucide)

20. **Extend Mention System**
    - `src/features/rules/lib/suggestion.ts`: Add "Magia" type, query function
    - `src/features/rules/components/mention-badge.tsx`: Add "Magia" case with veryRare variant
    - `src/features/rules/components/mention-list.tsx`: Add "Magia" icon

21. **Update Colors Config** (`src/lib/config/colors.ts`)
    - Add `spellSchoolColors` object (8 schools → rarity colors)
    - Add `diceColors` object (6 dice types → rarity colors)
    - Add `entityColors.Magia = veryRare` (purple)

22. **Update Dashboard** (`src/app/(dashboard)/page.tsx`)
    - Replace WIP spell card with `<SpellsEntityCard />`

23. **Update Navigation** (sidebar component)
    - Add "Magias" menu item below "Talentos"
    - Icon: Wand from lucide-react
    - Link: `/spells`

---

### Phase 5: Documentation

24. **Feature Documentation** (`aicontext/modules/spells.md`)
    - Overview, structure, schemas, APIs, examples
    - Component usage guide
    - Common queries and patterns

25. **Update Agent Context** (run script)
    ```bash
    .specify/scripts/powershell/update-agent-context.ps1 -AgentType copilot
    ```
    - Adds spells feature to agent context file

---

## Code Examples

### Example 1: Create Spell Service Function

```typescript
// src/features/spells/api/spells-service.ts
import { Spell, ISpell } from '../models/spell';
import { AuditLogExtended } from '@/features/users/models/audit-log-extended';
import { CreateSpellInput } from '../types/spells.types';

export async function createSpell(input: CreateSpellInput, userId: string): Promise<ISpell> {
  // Create spell
  const spell = await Spell.create(input);

  // Create audit log (async, don't block)
  AuditLogExtended.create({
    action: 'CREATE',
    entity: 'Spell',
    entityId: spell._id.toString(),
    performedBy: userId,
    newData: spell.toObject(),
  }).catch(err => console.error('Audit log failed:', err));

  return spell;
}
```

### Example 2: Spells Table Component

```typescript
// src/features/spells/components/spells-table.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { motionConfig } from '@/lib/config/motion-configs';
import { Spell } from '../types/spells.types';
import { GlassLevelChip } from '@/components/ui/glass-level-chip';
import { GlassSpellSchool } from '@/components/ui/glass-spell-school';
import { GlassDiceValue } from '@/components/ui/glass-dice-value';

export function SpellsTable({ spells, onEdit, onDelete }: Props) {
  return (
    <GlassCard>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5 bg-white/5">
            <th>Círculo</th>
            <th>Nome</th>
            <th>Escola</th>
            {/* ... more columns */}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {spells.map((spell, index) => (
              <motion.tr
                key={spell._id}
                variants={motionConfig.variants.tableRow}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ delay: index * 0.05 }}
              >
                <td><GlassLevelChip level={spell.circle} /></td>
                <td>{spell.name}</td>
                <td><GlassSpellSchool school={spell.school} /></td>
                <td><GlassDiceValue value={spell.baseDice} /></td>
                {/* ... more columns */}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </GlassCard>
  );
}
```

### Example 3: API Route with Auth

```typescript
// src/app/api/spells/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/core/auth/auth-helpers';
import { listSpells, createSpell } from '@/features/spells/api/spells-service';
import { createSpellSchema } from '@/features/spells/api/validation';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  const filters = parseFilters(req.nextUrl.searchParams);
  const result = await listSpells(filters, user.role === 'admin');
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req); // Throws 403 if not admin
  const body = await req.json();
  const validated = createSpellSchema.parse(body); // Throws 400 if invalid
  const spell = await createSpell(validated, user.clerkId);
  return NextResponse.json({ spell }, { status: 201 });
}
```

---

## Common Patterns

### Pattern 1: SSR with TanStack Query Hydration

```typescript
// src/app/(dashboard)/spells/page.tsx
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { listSpells } from '@/features/spells/api/spells-service';
import { SpellsClientPage } from './client-page';

export default async function SpellsPage() {
  const queryClient = new QueryClient();
  
  // Prefetch on server
  await queryClient.prefetchQuery({
    queryKey: ['spells', { page: 1 }],
    queryFn: () => listSpells({ status: 'active' }, 1, 10, false),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SpellsClientPage />
    </HydrationBoundary>
  );
}
```

### Pattern 2: Filter State Management

```typescript
// src/features/spells/hooks/useSpellFilters.ts
export function useSpellFilters() {
  const [filters, setFilters] = useState<SpellsFilters>({
    search: '',
    circles: [],
    schools: [],
    status: 'active',
  });

  const updateFilter = <K extends keyof SpellsFilters>(key: K, value: SpellsFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ search: '', circles: [], schools: [], status: 'active' });
  };

  return { filters, updateFilter, clearFilters };
}
```

### Pattern 3: Form with Unsaved Changes Protection

```typescript
// src/features/spells/components/spell-form-modal.tsx
export function SpellFormModal({ spell, isOpen, onClose }: Props) {
  const { formState: { isDirty } } = useForm();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <GlassModal open={isOpen} onOpenChange={handleClose}>
        {/* Form content */}
      </GlassModal>
      <ConfirmDialog
        open={showConfirm}
        onConfirm={() => { setShowConfirm(false); onClose(); }}
        onCancel={() => setShowConfirm(false)}
        title="Alterações não salvas"
        message="Você tem alterações não salvas. Descartar?"
      />
    </>
  );
}
```

---

## Testing Strategy

### Unit Tests

- **Validation**: Test Zod schemas with valid/invalid inputs
- **Hooks**: Test custom hooks with React Testing Library hooks API
- **Components**: Test rendering, user interactions, empty states

### Integration Tests

- **API Routes**: Test with mocked auth and database
- **Service Layer**: Test with MongoDB in-memory server
- **End-to-End**: Consider Playwright tests for critical flows (optional)

### Test Example

```typescript
// __tests__/features/spells/api/validation.test.ts
import { createSpellSchema } from '@/features/spells/api/validation';

describe('createSpellSchema', () => {
  it('accepts valid spell data', () => {
    const result = createSpellSchema.safeParse({
      name: 'Fireball',
      description: '<p>A bright streak...</p>',
      circle: 3,
      school: 'Evocação',
      baseDice: { quantidade: 8, tipo: 'd6' },
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid circle', () => {
    const result = createSpellSchema.safeParse({
      name: 'Test',
      description: '<p>Test</p>',
      circle: 10, // Invalid: max is 9
      school: 'Evocação',
      status: 'active',
    });
    expect(result.success).toBe(false);
  });
});
```

---

## Troubleshooting

### Issue: "Spell model not found"

**Solution**: Ensure MongoDB connection is established before querying. Add connection check in API route:

```typescript
import dbConnect from '@/core/database/db-connect';
await dbConnect();
```

### Issue: "Clerk user not found"

**Solution**: User must be synced to local database after Clerk webhook. Check `src/core/auth/sync-user.ts`.

### Issue: "Audit log not appearing"

**Solution**: Check that "Spell" was added to entity enum in `audit-log-extended.ts`. Verify performedBy matches Clerk user ID.

### Issue: "Text search not working"

**Solution**: Ensure text index exists on `name` and `description` fields. Run in MongoDB shell:

```javascript
db.spells.createIndex({ name: "text", description: "text" });
```

### Issue: "Mention suggestions not showing spells"

**Solution**: Check that `suggestion.ts` includes spell query function and that spells are active status.

---

## Performance Optimization

1. **Indexes**: All filter fields indexed (see data-model.md)
2. **Lean Queries**: Use `.lean()` for read-only queries (50% faster)
3. **Pagination**: Always paginate, never fetch all spells
4. **TanStack Query Cache**: Set appropriate staleTime (5min default)
5. **SSR**: Prefetch initial page on server to avoid waterfall requests
6. **Debounce Search**: Debounce text search input (300ms) to reduce API calls

---

## Resources

- **Spec**: `specs/004-spells-catalog/spec.md`
- **Plan**: `specs/004-spells-catalog/plan.md`
- **Data Model**: `specs/004-spells-catalog/data-model.md`
- **API Contracts**: `specs/004-spells-catalog/contracts/spells.yaml`
- **Research**: `specs/004-spells-catalog/research.md`
- **Constitution**: `.specify/memory/constitution.md`
- **React Instructions**: `.github/instructions/react.instructions.md`
- **Tasks** (generated separately): `specs/004-spells-catalog/tasks.md`

**Reference Features**:
- Rules: `src/features/rules/`
- Feats: `src/features/feats/`
- Traits: `src/features/traits/`

---

## Next Steps

1. ✅ Review all documentation above
2. ⏭️ Start with Phase 1 (Data Layer)
3. ⏭️ Progress through phases sequentially
4. ⏭️ Test each component as you build
5. ⏭️ Generate tasks breakdown with `/speckit.tasks` command
6. ⏭️ Update `aicontext/modules/spells.md` as you build
7. ⏭️ Create PR referencing this spec and plan

**Happy coding! 🎲🔥**
