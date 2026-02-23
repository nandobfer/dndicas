# Quickstart: Cadastro de Habilidades (Traits)

**Feature**: 002-traits-catalog  
**Date**: 2026-02-23  
**Audience**: Developers implementing this feature

## Prerequisites

- ✅ MongoDB connection configured (`.env.local` with `MONGODB_URI`)
- ✅ Clerk authentication set up
- ✅ Existing Rules module (`src/features/rules/`) as reference
- ✅ Read [research.md](./research.md), [data-model.md](./data-model.md), and [spec.md](./spec.md)

---

## Implementation Checklist

### Phase 1: Database & API Foundation (Backend)

- [ ] **1.1** Create Mongoose model: `src/core/database/models/trait.ts`
  - Copy `reference.ts` structure
  - Rename interface to `ITrait`
  - Update schema name to `"Trait"`
  - Ensure text indexes for search
  
- [ ] **1.2** Create API routes: `src/app/api/traits/`
  - `route.ts` → GET (list, search, filter) + POST (create)
  - `[id]/route.ts` → GET (single), PUT (update), DELETE
  - Integrate `createAuditLog` for CREATE/UPDATE/DELETE
  - Validate with Zod schemas (port from Rules)

- [ ] **1.3** Test API endpoints
  ```bash
  # In Postman/Thunder Client or similar
  POST /api/traits (with auth token)
  GET /api/traits?page=1&limit=10
  GET /api/traits/[id]
  PUT /api/traits/[id]
  DELETE /api/traits/[id]
  ```

---

### Phase 2: Feature Module (Frontend Data Layer)

- [ ] **2.1** Create feature folder: `src/features/traits/`
  ```
  traits/
  ├── types/traits.types.ts
  ├── api/
  │   ├── traits-api.ts
  │   └── validation.ts
  ├── hooks/
  │   ├── useTraits.ts
  │   └── useTraitMutations.ts
  ├── components/ (Phase 3)
  └── utils/
      └── suggestion.ts
  ```

- [ ] **2.2** Define TypeScript types: `types/traits.types.ts`
  - `Trait`, `CreateTraitInput`, `UpdateTraitInput`
  - `TraitsFilters`, `TraitsResponse`
  - Copy from `rules.types.ts`, rename interfaces

- [ ] **2.3** Create validation schemas: `api/validation.ts`
  - `createTraitSchema`, `updateTraitSchema` (Zod)
  - Copy from Rules, adjust field names if needed

- [ ] **2.4** Create client API functions: `api/traits-api.ts`
  - `fetchTraits(filters)`, `createTrait(input)`, `updateTrait(id, input)`, `deleteTrait(id)`
  - Use `fetch()` with error handling

- [ ] **2.5** Create TanStack Query hooks
  - **`hooks/useTraits.ts`** → `useQuery` for GET list
  - **`hooks/useTraitMutations.ts`** → `useMutation` for CREATE/UPDATE/DELETE
  - Define `traitKeys` for cache invalidation

---

### Phase 3: UI Components

- [ ] **3.1** Create page component: `components/traits-page.tsx`
  - Orchestrate table, filters, modal, delete dialog
  - Use `useTraits()`, `useTraitMutations()` hooks
  - Copy structure from `rules-page.tsx`

- [ ] **3.2** Create table: `components/traits-table.tsx`
  - Columns: Status, Nome, Descrição, Fonte, Prever (eye icon), Ações
  - Pagination with `DataTablePagination`
  - Edit/delete actions via dropdown
  - Copy from `rules-table.tsx`, adjust prop names

- [ ] **3.3** Create filters: `components/traits-filters.tsx`
  - `SearchInput` for name/description search
  - `StatusChips` for active/inactive/all
  - Copy from `rules-filters.tsx`, adjust placeholder text

- [ ] **3.4** Create form modal: `components/trait-form-modal.tsx`
  - Fields: Nome, Fonte, Status (switch), Descrição (RichTextEditor)
  - React Hook Form + Zod validation
  - Edit/create modes (pre-fill for edit)
  - Copy from `rule-form-modal.tsx`, rename props

- [ ] **3.5** Create delete dialog: `components/delete-trait-dialog.tsx`
  - Confirmation dialog with trait name
  - Trigger delete mutation on confirm
  - Copy from `delete-rule-dialog.tsx`

- [ ] **3.6** Reuse existing components (no changes needed)
  - ✅ `rich-text-editor.tsx` (already supports mentions)
  - ✅ `entity-description.tsx` (renders HTML with mentions)
  - ✅ `entity-preview-tooltip.tsx` (shows entity preview on hover)
  - ✅ `mention-badge.tsx` (renders mention badges)
  - ✅ `mention-list.tsx` (mention dropdown)

---

### Phase 4: Mention System Integration

- [ ] **4.1** Update mention suggestions: `utils/suggestion.ts`
  - Fetch from both `/api/rules` and `/api/traits`
  - Merge results, tag with `entityType: "Habilidade"`
  - Limit to 10 total results

- [ ] **4.2** Update entity colors: `src/lib/config/colors.ts`
  - Add `Habilidade` entry to `entityColors`
  ```typescript
  Habilidade: {
    name: 'Habilidade',
    color: 'gray',
    mention: "bg-gray-500/10 text-gray-300 border-gray-400/20",
    badge: "bg-gray-400/20 text-gray-300",
    border: "border-gray-500/20",
    hoverBorder: "hover:border-gray-500/40",
    bgAlpha: "bg-gray-500/10",
    text: "text-gray-300",
    hex: rarityColors.common, // #9CA3AF
  }
  ```

- [ ] **4.3** Update audit logs: `src/features/users/components/audit-logs-table.tsx`
  - Add `"Trait": "Habilidade"` to `formatEntityType()` mapping

- [ ] **4.4** Update entity filters: `src/features/users/components/audit-logs-filters.tsx`
  - Add "Habilidade" option to `EntityMultiSelect`

---

### Phase 5: Navigation & Dashboard

- [ ] **5.1** Create Next.js route: `src/app/(dashboard)/traits/page.tsx`
  ```tsx
  import { TraitsPage } from '@/features/traits/components/traits-page';
  import { Metadata } from 'next';

  export const metadata: Metadata = {
    title: 'Catálogo de Habilidades | D&Dicas',
    description: 'Gerencie habilidades e traits do sistema D&D 5e.',
  };

  export default function Page() {
    return <TraitsPage />;
  }
  ```

- [ ] **5.2** Add sidebar menu item: `src/components/ui/expandable-sidebar.tsx`
  - Add to `cadastrosItems` array:
  ```typescript
  { label: "Habilidades", href: "/traits", icon: Sparkles }
  ```

- [ ] **5.3** Create generalized dashboard card: `src/app/(dashboard)/_components/entity-card.tsx`
  - Extract layout from `RulesEntityCard`
  - Accept props: `title`, `description`, `icon`, `config`, `stats`, `loading`, `index`

- [ ] **5.4** Refactor Rules card: `src/app/(dashboard)/_components/rules-entity-card.tsx`
  - Use new `EntityCard` component
  - Pass `config={entityColors.Regra}`

- [ ] **5.5** Create Traits card: `src/app/(dashboard)/_components/traits-entity-card.tsx`
  - Use `EntityCard` component
  - Pass `config={entityColors.Habilidade}`, `icon={Sparkles}`

- [ ] **5.6** Update dashboard: `src/app/(dashboard)/page.tsx`
  - Add Traits card to `dndEntities` array (replace WipEntityCard)
  ```typescript
  { id: "traits", title: "Habilidades", component: TraitsEntityCard }
  ```
  - Fetch traits stats from `/api/dashboard/stats` (update endpoint)

- [ ] **5.7** Update dashboard stats API: `src/app/api/dashboard/stats/route.ts`
  - Add traits query:
  ```typescript
  const traitsTotal = await Trait.countDocuments();
  const traitsActive = await Trait.countDocuments({ status: 'active' });
  const traitsGrowth = await Trait.aggregate([...]); // Last 30 days
  
  return { traits: { total: traitsTotal, active: traitsActive, growth: traitsGrowth } }
  ```

---

### Phase 6: Testing & Validation

- [ ] **6.1** Write unit tests
  - `__tests__/features/traits/hooks/useTraits.test.ts`
  - `__tests__/features/traits/components/traits-table.test.tsx`
  - `__tests__/features/traits/components/trait-form-modal.test.tsx`

- [ ] **6.2** Manual E2E testing
  - [ ] Create trait via form modal
  - [ ] Search trait by name
  - [ ] Filter by status (active/inactive)
  - [ ] Edit trait description with rich-text (mentions, S3-backed images)
  - [ ] Create mention to another trait/rule
  - [ ] Delete trait (confirm mentions become "broken" - Red, Strikethrough, Low Opacity)
  - [ ] Verify audit log entries
  - [ ] Check dashboard card shows correct stats

- [ ] **6.3** Accessibility testing
  - [ ] Keyboard navigation (Tab, Enter, Escape)
  - [ ] Screen reader labels (ARIA)
  - [ ] Form validation error messages visible

---

### Phase 7: Documentation & Deployment

- [ ] **7.1** Create module documentation: `aicontext/modules/traits.md`
  - Describe feature structure, API, types, hooks, components
  - Include usage examples
  - Document mention integration

- [ ] **7.2** Run type check
  ```bash
  npm run type-check
  ```

- [ ] **7.3** Run linter
  ```bash
  npm run lint
  ```

- [ ] **7.4** Run tests
  ```bash
  npm test
  ```

- [ ] **7.5** Build for production
  ```bash
  npm run build
  ```

- [ ] **7.6** Deploy to staging/production
  - MongoDB indexes will be created automatically on first query
  - Verify Clerk authentication works
  - Check audit logs are being created

---

## Quick Command Reference

```bash
# Development
npm run dev                # Start dev server http://localhost:3000

# Type checking
npm run type-check         # Run TypeScript compiler (no emit)

# Linting
npm run lint               # Run ESLint
npm run lint --fix         # Auto-fix linting issues

# Testing
npm test                   # Run Jest tests
npm test -- --watch        # Run tests in watch mode
npm test -- --coverage     # Generate coverage report

# Build
npm run build              # Production build

# Database
# No migrations needed - Mongoose creates collection on first insert
# To seed data, create a script in scripts/ folder
```

---

## Troubleshooting

### Issue: Trait name uniqueness error
**Solution**: MongoDB unique index on `name` field. Change the name or check if trait already exists.

### Issue: Mention dropdown not showing traits
**Solution**: 
1. Verify `/api/traits/search` endpoint works (check Network tab)
2. Ensure `suggestion.ts` fetches from both `/api/rules` and `/api/traits`
3. Check `entityType: "Habilidade"` is set correctly

### Issue: Audit logs not appearing
**Solution**:
1. Verify `createAuditLog()` is called in all mutation endpoints
2. Check Clerk `auth()` returns valid `userId`
3. Inspect MongoDB `auditlogs` collection directly

### Issue: Dashboard card not showing stats
**Solution**:
1. Update `/api/dashboard/stats` route to include traits query
2. Ensure Trait model is imported in stats endpoint
3. Check console for fetch errors

### Issue: Rich-text editor not saving HTML
**Solution**:
1. Verify `editor.getHTML()` is called in `onChange` handler
2. Check Zod schema allows HTML strings (max 50,000 chars)
3. Inspect Network tab to see if HTML is being sent in POST/PUT body

---

## Next Steps

After completing this quickstart:
1. ✅ All acceptance criteria from [spec.md](./spec.md) should pass
2. ✅ Constitution Check re-validated (should still be ✅ PASS on all principles)
3. 🚀 Ready for `/speckit.tasks` command to generate task breakdown

**Estimated Time**: 8-12 hours (for experienced developer following this guide)

---

## References

- [spec.md](./spec.md) - Full feature specification
- [research.md](./research.md) - Architectural decisions
- [data-model.md](./data-model.md) - Database schema and types
- [contracts/traits.yaml](./contracts/traits.yaml) - OpenAPI specification
- Existing Rules module: `src/features/rules/` - Template for all patterns
