# Research: Cadastro de Habilidades (Traits)

**Feature**: 002-traits-catalog  
**Date**: 2026-02-23  
**Status**: Phase 0 Complete

## Research Overview

This document consolidates architectural decisions and best practices for implementing the Traits (Habilidades) catalog. Since this feature reuses 100% of the existing Rules module patterns, there were **no unknowns requiring external research**. All decisions are based on proven patterns from `src/features/rules/`.

---

## Decision 1: Follow Rules Module Architecture

**Context**: Need to implement CRUD operations for Traits with table, filters, and form modal.

**Decision**: **Replicate `src/features/rules/` structure exactly**, creating `src/features/traits/` with identical folder structure and component patterns.

**Rationale**:
- Rules module is proven, tested, and follows constitution principles
- Maintaining architectural consistency reduces cognitive load
- Reusing Glass UI components ensures visual consistency
- Faster development with zero new component creation needed

**Alternatives Considered**:
- **Create new custom components**: Rejected - Reinvents the wheel, increases maintenance burden, breaks visual consistency
- **Merge traits into rules module**: Rejected - Violates separation of concerns, makes codebase harder to navigate

**Implementation Pattern**:
```
src/features/traits/
├── components/       # UI components (table, form, filters)
├── hooks/            # useTraits, useTraitMutations
├── api/              # Client-side API functions
├── types/            # TypeScript interfaces
└── utils/            # Suggestion config for mentions
```

**References**:
- Existing: `src/features/rules/`
- Constitution: Principle 2 (Feature-based organization)

---

## Decision 2: MongoDB Trait Model with Mongoose

**Context**: Need to persist Traits with name, description (HTML), source, and status.

**Decision**: **Create `Trait` model in `src/core/database/models/trait.ts`** mirroring the `Reference` model structure.

**Rationale**:
- Reference model is battle-tested for rich-text content (HTML descriptions)
- Text indexes on name/description enable fast search
- Status enum ('active'/'inactive') matches UI filter requirements
- Timestamps (createdAt, updatedAt) support audit trail
- Virtual `id` field maps `_id` for clean frontend usage

**Schema**:
```typescript
{
  name: String (required, maxlength: 100, unique: true),
  description: String (required, HTML content),
  source: String (required, maxlength: 200),
  status: Enum ['active', 'inactive'] (default: 'active'),
  timestamps: true
}
```

**Indexes**:
- Text index: `{ name: "text", description: "text" }` for search
- Regular index: `{ status: 1 }` for filter queries

**Alternatives Considered**:
- **Store description as JSON (structured blocks)**: Rejected - Adds complexity, HTML string works perfectly for TipTap editor
- **Separate Status entity**: Rejected - Overkill for binary active/inactive state

**References**:
- Existing: `src/core/database/models/reference.ts`
- Constitution: Principle 2 (Core extension by composition)

---

## Decision 3: API Routes Following REST Conventions

**Context**: Need to expose CRUD endpoints for Traits accessible from frontend.

**Decision**: **Create API routes in `src/app/api/traits/`** following the same REST structure as `/api/rules/`.

**Endpoints**:
```
GET    /api/traits          # List traits (paginated, searchable, filterable)
POST   /api/traits          # Create new trait
GET    /api/traits/[id]     # Get single trait by ID
PUT    /api/traits/[id]     # Update existing trait
DELETE /api/traits/[id]     # Delete trait (with audit log)
GET    /api/traits/search   # Search for mentions (@-trigger)
```

**Query Parameters** (GET /api/traits):
- `page` (default: 1)
- `limit` (default: 10)
- `search` (filters name/description)
- `searchField` (for mentions: 'name', default: 'all')
- `status` ('active'|'inactive'|'all')

**Rationale**:
- Standard REST conventions are universally understood
- Pagination prevents performance issues at scale
- Search endpoint optimized for mention dropdown (searchField='name')
- Clerk `auth()` middleware ensures authentication on mutations
- Audit log service integration on CREATE/UPDATE/DELETE

**Alternatives Considered**:
- **GraphQL**: Rejected - Overkill for simple CRUD, adds complexity
- **tRPC**: Rejected - Not part of project stack, requires new patterns

**References**:
- Existing: `src/app/api/rules/route.ts`
- Constitution: Principle 5 (Security - authentication required)

---

## Decision 4: TanStack Query + React Hook Form

**Context**: Need to manage server state (fetching traits) and form state (create/edit).

**Decision**: **Use TanStack Query for data fetching and React Hook Form + Zod for forms**, exactly as in Rules module.

**TanStack Query Hooks**:
- `useTraits(filters)` - Fetches paginated trait list with automatic caching
- `useTraitMutations()` - Returns `createTrait`, `updateTrait`, `deleteTrait` mutations

**React Hook Form + Zod**:
- `createTraitSchema` - Validates name (3-100 chars), description (10-50000 chars), source (required), status
- `updateTraitSchema` - Partial validation for updates
- Error messages in Portuguese for user-friendly validation

**Rationale**:
- TanStack Query handles caching, refetching, optimistic updates automatically
- React Hook Form provides excellent DX with minimal re-renders
- Zod schemas enforce type safety between frontend/backend
- Pattern already proven in Rules module

**Alternatives Considered**:
- **SWR**: Rejected - TanStack Query is project standard
- **Manual fetch + useState**: Rejected - Loses caching, refetching, error handling benefits
- **Formik**: Rejected - React Hook Form is more performant and smaller bundle

**References**:
- Existing: `src/features/rules/hooks/useRules.ts`, `src/features/rules/api/validation.ts`
- Constitution: Principle 3 (Hooks for business logic)

---

## Decision 5: Rich-Text Editor with Mentions and Images

**Context**: Description field needs formatting, entity mentions (@), and image uploads.

**Decision**: **Reuse `RichTextEditor` component from Rules module** with TipTap, supporting StarterKit, Image extension, and custom Mention extension.

**Features**:
- **Formatting**: Bold, italic, headings, lists, blockquotes
- **Mentions**: Type `@` to search and insert Trait/Rule mentions as interactive badges
- **Images**: Drag-drop or paste images, upload to `/api/upload`, embed in editor

**Mention Configuration**:
- Extend `suggestion.ts` to fetch from `/api/traits/search?searchField=name`
- Badge color: Gray/Slate (rarityColors.common) for "Habilidade" entity type
- Tooltip shows preview with name, source, description snippet

**Rationale**:
- TipTap is powerful, extensible, and handles complex HTML well
- Mention system creates semantic links between entities
- Image upload pattern proven in Rules module
- Single editor component reduces maintenance

**Alternatives Considered**:
- **Markdown editor (react-md-editor)**: Rejected - Lacks mention system, less flexible for D&D content
- **Slate**: Rejected - More complex API, TipTap is already integrated
- **Plain textarea**: Rejected - Doesn't meet requirement for rich formatting

**References**:
- Existing: `src/features/rules/components/rich-text-editor.tsx`
- Spec: FR-009 (Rich-text requirements)

---

## Decision 6: Entity Color System (Gray/Slate for Traits)

**Context**: Need to visually distinguish Traits from Rules and other entities in mentions, badges, and audit logs.

**Decision**: **Add "Habilidade" to `entityColors` in `lib/config/colors.ts`** with Gray/Slate color scheme (rarityColors.common).

**Color Configuration**:
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

**Usage**:
- **Mentions**: `@Habilidade` badges in rich-text descriptions
- **Audit Logs**: Entity chip color for "Habilidade" events
- **Dashboard**: Entity card accent color
- **Tooltips**: Preview border color

**Rationale**:
- Gray/Slate aligns with D&D "common" rarity (as specified in clarifications)
- Creates clear visual hierarchy: Rules (green), Traits (gray), Security (purple)
- Maintains Liquid Glass theme aesthetic
- Centralized config ensures consistency across all UI surfaces

**Alternatives Considered**:
- **Reuse existing color**: Rejected - Would create confusion between entity types
- **Random color per trait**: Rejected - Inconsistent, hard to recognize entity types

**References**:
- Existing: `src/lib/config/colors.ts` (entityColors object)
- Clarifications: "Qual a cor oficial da entidade? → Gray/Slate"

---

## Decision 7: Audit Log Integration

**Context**: All CRUD operations on Traits must be logged for governance and security.

**Decision**: **Use existing `createAuditLog` service** from `src/features/users/api/audit-service.ts` in all mutation endpoints.

**Audit Events**:
```typescript
CREATE: { action: 'CREATE', entity: 'Trait', entityId, performedBy, newData }
UPDATE: { action: 'UPDATE', entity: 'Trait', entityId, performedBy, oldData, newData }
DELETE: { action: 'DELETE', entity: 'Trait', entityId, performedBy, oldData }
```

**Integration Points**:
- POST `/api/traits` → Log CREATE after successful insert
- PUT `/api/traits/[id]` → Log UPDATE with before/after snapshots
- DELETE `/api/traits/[id]` → Log DELETE with deleted data

**Audit Log Filters**:
- Update `formatEntityType()` in `audit-logs-table.tsx` to map "Trait" → "Habilidade"
- Add "Habilidade" to `EntityMultiSelect` options in filters

**Rationale**:
- Audit service is proven, centralized, and handles all edge cases
- Consistent audit trail across all entity types
- Meets compliance and security requirements
- Enables retroactive change tracking

**Alternatives Considered**:
- **Custom audit logging per endpoint**: Rejected - DRY violation, inconsistent format
- **Third-party audit service (e.g., Audit Trail SaaS)**: Rejected - Adds cost, external dependency

**References**:
- Existing: `src/features/users/api/audit-service.ts`
- Spec: FR-012 (Audit requirements)

---

## Decision 8: Dashboard Entity Card Pattern

**Context**: Dashboard shows entity cards (Users, Audit Logs, Rules). Need to add Traits card.

**Decision**: **Extract generalized `EntityCard` component**, refactor `RulesEntityCard` to use it, create `TraitsEntityCard` using same pattern.

**Generalized Component**:
```typescript
<EntityCard
  title="Habilidades"
  description="Traits e habilidades de classe/raça"
  icon={Sparkles}
  config={entityColors.Habilidade}
  stats={{ total, active, growth }}
  loading={loading}
  index={4}
/>
```

**Implementation**:
- Extract layout/styling from `RulesEntityCard` into reusable `EntityCard`
- Pass entity-specific props (title, icon, config, stats)
- Reuse `MiniLineChart` for growth visualization

**Rationale**:
- DRY principle - avoid duplicating card layout code
- Future-proof - easy to add more entity cards (Spells, Items, etc.)
- Consistent visual design across all entity cards
- Reduces maintenance burden

**Alternatives Considered**:
- **Duplicate RulesEntityCard code**: Rejected - Violates DRY, hard to maintain
- **Single polymorphic EntityCard with switch statement**: Rejected - Less flexible, harder to customize

**References**:
- Existing: `src/app/(dashboard)/_components/rules-entity-card.tsx`
- User Request: "extrair o layout para um componente generalizado"

---

## Decision 9: Sidebar Navigation Item

**Context**: Users need to navigate to Traits page from sidebar menu.

**Decision**: **Add "Habilidades" menu item** to `cadastrosItems` array in `expandable-sidebar.tsx`, positioned after "Regras".

**Menu Item**:
```typescript
{ label: "Habilidades", href: "/traits", icon: Sparkles }
```

**Position**: In "Cadastros" section, order: Usuários → Regras → **Habilidades**

**Rationale**:
- Follows existing sidebar structure (cadastrosItems array)
- Icon (Sparkles) visually represents magical/special abilities
- Maintains alphabetical-ish order for intuitive navigation
- Keeps all catalog features grouped in "Cadastros" section

**Alternatives Considered**:
- **Create new sidebar section**: Rejected - Overkill for one item, breaks existing grouping
- **Add to admin section**: Rejected - Traits are content, not admin feature

**References**:
- Existing: `src/components/ui/expandable-sidebar.tsx`
- User Request: "essa página deve aparecer no expandable-sidebar"

---

## Decision 10: Mention System Update

**Context**: When users type `@` in any rich-text editor, suggestion dropdown should include Traits.

**Decision**: **Update `suggestion.ts` in both Rules and Traits modules** to fetch from both `/api/rules/search` and `/api/traits/search`.

**Unified Suggestion Config**:
```typescript
items: async ({ query }) => {
  const [rulesRes, traitsRes] = await Promise.all([
    fetch(`/api/rules?search=${query}&limit=5&searchField=name`),
    fetch(`/api/traits?search=${query}&limit=5&searchField=name`)
  ]);
  
  const rules = (await rulesRes.json()).items.map(item => ({
    id: item._id, label: item.name, entityType: "Regra"
  }));
  
  const traits = (await traitsRes.json()).items.map(item => ({
    id: item._id, label: item.name, entityType: "Habilidade"
  }));
  
  return [...rules, ...traits].slice(0, 10); // Max 10 results
}
```

**Badge Rendering**:
- `MentionBadge` already supports entityType prop
- Looks up color from `entityColors[entityType]`
- Traits render with Gray/Slate color, Rules with Emerald

**Rationale**:
- Unified search improves discoverability (users find related content faster)
- Badge color distinguishes entity types at a glance
- 10-result limit maintains performance
- Parallel fetching minimizes latency

**Alternatives Considered**:
- **Separate @ and # triggers**: Rejected - Adds cognitive load, non-standard UX
- **Unified entity endpoint**: Rejected - Requires backend refactor, less flexible

**References**:
- Existing: `src/features/rules/utils/suggestion.ts`
- User Request: "Essa nova entidade trait deve ser considerada nas menções"

---

## Research Conclusion

**All architectural decisions finalized.** Zero unknowns remain. Implementation can proceed directly to Phase 1 (data modeling and contracts).

**Key Takeaway**: By strictly reusing the Rules module patterns, we eliminate research overhead, reduce risk, and ensure architectural consistency. The only new code is entity-specific logic; all infrastructure (Glass UI, TanStack Query, Clerk auth, audit logs, etc.) is already proven.
