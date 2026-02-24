# Feats Module (Talentos)

**Feature**: Catálogo de Talentos D&D 5e  
**Entity Type**: Talento  
**Status**: ✅ Complete (User Stories 1-9 implemented)  
**Color Theme**: Amber/Orange (Legendary rarity)  
**Icon**: Zap (lightning bolt)

---

## Overview

The Feats module manages D&D 5e feats/talents with full CRUD operations, level-based filtering, rich text descriptions with mentions, and audit logging integration.

**Key Features**:
- Browse paginated list with search and filters (status, level, text)
- Create/edit/delete feats with form validation
- Level-based rarity color coding (1-3=common, 4-8=uncommon, 9-13=rare, 14-17=veryRare, 18-19=legendary, 20=artifact)
- Dynamic prerequisites list with add/remove UI
- Rich text editor with mentions (@Regras, @Habilidades, @Talentos) and S3 image upload
- Dashboard statistics card with growth chart
- Audit logs tracking all CRUD operations

---

## Directory Structure

```
src/features/feats/
├── api/
│   ├── feats-api.ts          # Client-side fetch wrappers
│   └── validation.ts         # Zod schemas (createFeatSchema, updateFeatSchema)
├── components/
│   ├── feat-form-modal.tsx   # Create/edit form with dynamic prerequisites
│   ├── feat-preview.tsx      # Tooltip preview component
│   ├── feats-filters.tsx     # SearchInput + StatusChips + Level filter
│   └── feats-table.tsx       # Paginated table with level chips
├── hooks/
│   ├── useFeatMutations.ts   # TanStack Query mutations (create/update/delete)
│   └── useFeats.ts           # TanStack Query hook with filters
├── models/
│   └── feat.ts               # Mongoose model with indexes
└── types/
    └── feats.types.ts        # TypeScript interfaces

src/app/api/feats/
├── route.ts                  # GET (list with filters), POST (create)
├── [id]/route.ts             # GET (single), PUT (update), DELETE
└── search/route.ts           # GET (mention system autocomplete)

src/app/(dashboard)/feats/
└── page.tsx                  # Main orchestrator page

src/app/(dashboard)/_components/
└── feats-entity-card.tsx     # Dashboard card component
```

---

## Data Model

**Feat Interface** (`IFeat`):
```typescript
{
  name: string              // Unique, 3-100 chars
  description: string       // HTML, 10-50000 chars
  source: string            // 1-200 chars (e.g., "PHB pg. 167")
  level: number             // 1-20, default 1 (minimum level required)
  prerequisites: string[]   // Array of prerequisite descriptions, default []
  status: 'active' | 'inactive'  // default 'active'
  createdAt: Date
  updatedAt: Date
}
```

**Indexes**:
1. Text search: `{ name: "text", description: "text" }`
2. Status: `{ status: 1 }`
3. Level: `{ level: 1 }`
4. Created date: `{ createdAt: -1 }`

---

## API Endpoints

### `GET /api/feats`
**Filters**: `page`, `limit`, `search`, `searchField`, `status`, `level` (exact), `levelMax` (range)  
**Response**: `{ items: Feat[], total, page, limit, totalPages }`  
**MongoDB Queries**:
- Text search: `$text: { $search: query }` or regex on name/description/source
- Status: `status: 'active' | 'inactive' | 'all'`
- Level exact: `level: { $eq: levelNum }`
- Level range: `level: { $lte: levelMaxNum }`

### `POST /api/feats`
**Auth**: Clerk (requires authentication)  
**Validation**: `createFeatSchema` (Zod)  
**Uniqueness**: Case-insensitive name check  
**Audit**: Creates log with action='CREATE', entity='Feat'

### `GET /api/feats/:id`
**Response**: Single feat object

### `PUT /api/feats/:id`
**Auth**: Clerk  
**Validation**: `updateFeatSchema` (partial updates)  
**Audit**: Creates log with previousData + newData

### `DELETE /api/feats/:id`
**Auth**: Clerk  
**Audit**: Creates log with previousData

### `GET /api/feats/search`
**Purpose**: Mention system autocomplete  
**Params**: `query` (name search), `limit` (default 10)  
**Filter**: Only active feats  
**Response**: `{ id, label, entityType: "Talento", metadata: { level } }[]`

---

## Client Hooks

### `useFeats(filters: FeatsFilters)`
**TanStack Query hook**:
- Query key: `['feats', filters]`
- Caching with `placeholderData` for optimistic UI
- Returns: `{ data: FeatsResponse, isLoading, error }`

### `useFeatMutations()`
**Mutations**:
- `createFeat.mutate(data: CreateFeatInput)`
- `updateFeat.mutate({ id, data: UpdateFeatInput })`
- `deleteFeat.mutate(id: string)`

**Cache Invalidation** (on success):
- `['feats']` - refetch all feats lists
- `['feat', id]` - refetch single feat
- `['audit-logs']` - refresh audit logs
- `['dashboard-stats']` - update dashboard card

---

## Components

### `FeatsTable`
**Columns**: Status, Name, Level (colored chip), Prerequisites (truncated), Description (EntityDescription), Source, Preview (tooltip), Actions (edit/delete)  
**Features**:
- Framer Motion row animations (staggered delays)
- Level-to-rarity color mapping via `getLevelRarityVariant(level)`
- EmptyState, LoadingState, ErrorState
- DataTablePagination
- EntityPreviewTooltip integration on preview icon

**Level Color Mapping**:
```typescript
1-3   → common (gray)
4-8   → uncommon (green)
9-13  → rare (blue)
14-17 → veryRare (purple)
18-19 → legendary (amber)
20    → artifact (red)
```

### `FeatsFilters`
**UI Elements**:
- SearchInput (debounced, placeholder "Buscar talentos...")
- StatusChips (all/active/inactive)
- Level dropdown (GlassSelect, 1-20 options)
- Mode toggle button ("= Exato" / "≤ Até Nível X")

**Callbacks**:
- `onSearchChange(search: string)`
- `onStatusChange(status: 'all' | 'active' | 'inactive')`
- `onLevelChange(level: number | undefined, mode: 'exact' | 'upto')`

### `FeatFormModal`
**Fields**:
- Name (GlassInput with Zap icon)
- Source (GlassInput with Link icon)
- Level (GlassInput numeric, min=1, max=20, default=1, Trophy icon)
- Status (GlassSwitch)
- Prerequisites (dynamic list with Add/Remove buttons, AnimatePresence)
- Description (RichTextEditor with mentions + S3 upload)

**Validation**: `react-hook-form` + Zod resolver  
**Modes**: Create (selectedFeat=null) or Edit (selectedFeat populated)  
**Animations**: Framer Motion for prerequisites add/remove

### `FeatPreview`
**Display**:
- Name with Zap icon
- Level chip (colored by rarity)
- Prerequisites (formatted list)
- Description (MentionContent block mode, imageWidth="small")
- Source (BookOpen icon)
- Status badge (if inactive)

---

## Integration Points

### Mentions System
**Provider Registration** (`src/features/rules/utils/suggestion.ts`):
```typescript
{
  name: "Talento",
  endpoint: (query) => `/api/feats/search?query=${query}&limit=10`,
  map: (item) => ({ id, label, entityType: "Talento", metadata })
}
```

**Badge Rendering**: Amber styling from `entityColors.Talento.mention`  
**Tooltip**: `EntityPreviewTooltip` fetches `/api/feats/:id` and renders `FeatPreview`

### Dashboard Integration
**Card**: `FeatsEntityCard` in `src/app/(dashboard)/_components/`  
**Stats API**: `/api/dashboard/stats` returns `feats: { total, active, growth }`  
**Navigation**: Click card → redirect to `/feats`

### Audit Logs Integration
**Entity Mapping**:
- `entityLabels["Feat"]` → "Talento"
- Icon: Zap
- Color: Amber (`entityColors.Talento`)

**Filter**: EntityMultiSelect includes "Talento" option with amber checkActive styling  
**Query**: `/api/audit-logs?entityType=Feat` or `entityType=Talento`

### Sidebar Navigation
**Entry**: `{ label: "Talentos", href: "/feats", icon: Zap }`  
**Location**: cadastrosItems array in `expandable-sidebar.tsx`

---

## Colors Configuration

**Entity Colors** (`src/lib/config/colors.ts`):
```typescript
Talento: {
  name: "Talento",
  color: "amber",
  mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
  badge: "bg-amber-400/20 text-amber-400",
  hex: rarityColors.legendary  // #f59e0b
}
```

---

## Validation Schemas

**createFeatSchema** (Zod):
```typescript
{
  name: z.string().min(3).max(100).trim(),
  description: z.string().min(10).max(50000).trim(),
  source: z.string().min(1).max(200).trim(),
  level: z.number().int().min(1).max(20).default(1),
  prerequisites: z.array(z.string()).default([]),
  status: z.enum(['active', 'inactive']).default('active')
}
```

**updateFeatSchema**: All fields optional except transformed to partial

---

## Development Patterns

### Following Established Conventions
The Feats module follows the **exact same patterns** as Rules and Traits modules:
- Mongoose model with indexes and validators
- Zod validation on API boundaries
- TanStack Query for data fetching + mutations
- Clerk authentication on write endpoints
- Audit logging with previousData/newData
- Rich text editor with mentions + S3
- GlassUI components (GlassCard, GlassInput, GlassModal)
- Framer Motion animations (tableRow variants, staggered delays)
- DataTablePagination, EmptyState, LoadingState

**Key Difference**: Level-based rarity color mapping (unique to Feats)

### Code Reuse
95% of component structure reused from Traits module:
- `FeatFormModal` ← based on `TraitFormModal`
- `FeatsTable` ← based on `TraitsTable` (added level chip logic)
- `FeatsFilters` ← based on `RulesFilters` (added level filter)
- `FeatPreview` ← based on `TraitPreview` (added prerequisites section)

---

## Testing Checklist

✅ **US1**: Browse feats catalog with pagination  
✅ **US2**: Create new feat with form validation  
✅ **US3**: Edit existing feat  
✅ **US4**: Delete feat with confirmation  
✅ **US5**: Filter by level (exact/up to)  
✅ **US6**: Search by text (name/description/source, debounced)  
✅ **US7**: Mention feats in descriptions with @Talento  
✅ **US8**: Dashboard card displays stats + growth  
✅ **US9**: Audit logs track all CRUD operations  

**Manual Tests**:
1. Navigate to `/feats` - verify table loads
2. Apply filters - verify results update
3. Click "Novo Talento" - verify form opens
4. Submit form with all fields - verify creation + toast
5. Click edit - verify form pre-fills
6. Update feat - verify changes + audit log
7. Delete feat - verify confirmation + removal
8. Type @ in any RichTextEditor - verify feats appear
9. Click dashboard feats card - verify navigation

---

## Performance Optimizations

- **Indexes**: Text search, status, level, createdAt for fast queries
- **Pagination**: Default limit 10, up to 100
- **Debounce**: 300ms on search input (FR-044)
- **Query Caching**: TanStack Query with placeholderData
- **Optimistic UI**: Cache remains visible during refetch
- **Lazy Loading**: Prerequisites animated with AnimatePresence

---

## Security

- **Authentication**: Clerk auth on POST/PUT/DELETE
- **Authorization**: Only authenticated users can create/edit/delete
- **Validation**: Zod schemas prevent invalid data
- **Sanitization**: HTML stored as-is, rendered via DOMParser (XSS-safe)
- **Audit Trail**: All operations logged with userId + timestamps

---

## Future Enhancements (Not Implemented)

- [ ] Bulk import from CSV/JSON
- [ ] Advanced filters (prerequisites regex, source dropdown)
- [ ] Featured feats (pinned to top)
- [ ] Feat categories/tags
- [ ] Related feats suggestions
- [ ] Export to PDF/JSON
- [ ] Version history for edits

---

## Related Documentation

- **Spec**: [specs/003-feats-catalog/spec.md](../../../specs/003-feats-catalog/spec.md)
- **Data Model**: [specs/003-feats-catalog/data-model.md](../../../specs/003-feats-catalog/data-model.md)
- **API Contracts**: [specs/003-feats-catalog/contracts/feats.yaml](../../../specs/003-feats-catalog/contracts/feats.yaml)
- **Tasks**: [specs/003-feats-catalog/tasks.md](../../../specs/003-feats-catalog/tasks.md)
- **Quickstart**: [specs/003-feats-catalog/quickstart.md](../../../specs/003-feats-catalog/quickstart.md)

---

## Maintenance Notes

**Dependencies**:
- Mongoose 8.x for MongoDB
- TanStack Query v5 for data fetching
- Zod 3.x for validation
- Clerk for authentication
- Framer Motion 11.x for animations
- Tippy.js for tooltips
- date-fns for date formatting

**Configuration Files**:
- `src/lib/config/colors.ts` - Entity colors
- `src/lib/config/motion-configs.ts` - Animation variants
- `src/lib/config/glass-config.ts` - GlassUI styling

**Common Issues**:
1. **Uniqueness check fails**: Case-insensitive regex on name field
2. **Prerequisites not saving**: Filter empty strings before submit
3. **Mentions not working**: Verify search endpoint returns active feats only
4. **Level filter mode toggle**: Ensure onLevelChange sends correct param (level vs levelMax)
5. **Audit logs missing**: Check createAuditLog service is called in API routes

---

*Last Updated*: December 2024  
*Version*: 1.0.0  
*Status*: Production Ready ✅
