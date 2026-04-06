# Implementation Plan: Minhas Fichas — Fichas de Personagem D&D 2024

**Branch**: `005-character-sheets` | **Date**: 2026-03-12 | **Spec**: [specs/005-character-sheets/spec.md](./spec.md)  
**Input**: Feature specification from `specs/005-character-sheets/spec.md`

## Summary

Full D&D 2024 character sheet management for authenticated users on Dungeons & Dicas. Users create sheets from a list page (`/my-sheets`, infinite scroll, Fuse.js fuzzy search), edit every D&D field via a full-page form (`/sheets/[slug]`) with **per-field auto-save** (500ms debounce, PATCH transport), **auto-calculated derived values** (modifiers, skills, saves, CA, initiative, spell DC/attack) with hover tooltips, catalog integration via `GlassEntityChooser`, and a guided level-up wizard modal. All logic lives in custom hooks; components are pure rendering. Liquid Glass UI with Framer Motion animations.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16+ App Router, React 18+, Node.js 20+ LTS  
**Primary Dependencies**:
- TanStack Query v5 (`useInfiniteQuery`, `useMutation`, `useQueryClient`) — already installed
- React Hook Form — already installed
- Zod — already installed (validation schemas)
- Fuse.js — already installed (used in `src/core/utils/search-engine.ts`)
- Framer Motion — already installed
- Mongoose 8+ — already installed
- Clerk — already installed (auth)

**Storage**: MongoDB Atlas via Mongoose; AWS S3-compatible (Minio) for character photos (existing `src/core/storage/s3.ts`)  
**Testing**: Jest + React Testing Library (existing `__tests__/` structure)  
**Target Platform**: Web — desktop + mobile responsive  
**Project Type**: Web application (Next.js monorepo — frontend + API routes in same codebase)  
**Performance Goals**: List loads with animations in < 1.5s for ≤ 20 sheets (SC-004); auto-save round-trip < 500ms p95; sheet editor renders in < 2s  
**Constraints**: Zero new global dependencies; all logic in custom hooks (constitution §3); `src/core/` must NOT be modified (constitution §2)  
**Scale/Scope**: Per-user feature; expected ~10–50 sheets per user; ~6 MongoDB collections added

## Constitution Check

*GATE: Must pass before coding. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| 1 | TypeScript estrito — sem `any`, sem `@ts-ignore` | ✅ PASS | All models, hooks, and components fully typed; Zod for runtime validation |
| 2 | Core imutável — `src/core/` não modificado | ✅ PASS | Zero changes to `src/core/`; hooks use `useDebounce` from core but don't modify it |
| 3 | Separação: lógica em hooks, componentes só renderizam | ✅ PASS | All D&D calculations, auto-save, infinite query, wizard state in `hooks/`; components receive data as props |
| 4 | Documentação de contexto — `aicontext/modules/` | ✅ PASS | `aicontext/modules/character-sheets.md` must be created post-implementation |
| 5 | Qualidade — testes, erros, segurança, commits | ✔️ PASS | Auth gates on all write routes; 404 if sheet not found; Clerk auth validation; error states with pt-BR messages |

**Post-Phase 1 re-check**: All gates still pass. No catalog entity modifications required. No core changes.

## Project Structure

### Documentation (this feature)

```text
specs/005-character-sheets/
├── plan.md              ✅ This file
├── research.md          ✅ Phase 0 output
├── data-model.md        ✅ Phase 1 output
├── quickstart.md        ✅ Phase 1 output
├── contracts/
│   └── character-sheets.yaml   ✅ Phase 1 output (OpenAPI 3.0)
└── tasks.md             ⏳ Phase 2 output (speckit.tasks command)
```

### Source Code

```text
src/
├── features/
│   └── character-sheets/
│       ├── api/
│       │   ├── character-sheets-api.ts        # Client fetch functions (typed)
│       │   ├── character-sheets-queries.ts    # TanStack Query hooks (useInfiniteQuery, mutations)
│       │   └── character-sheets-service.ts    # Server-side Mongoose service
│       ├── components/
│       │   ├── sheet-input.tsx                # Debounced input + optional catalog chooser button
│       │   ├── calc-tooltip.tsx               # Hover tooltip with D&D formula memory
│       │   ├── long-rest-button.tsx           # Long rest confirmation + action
│       │   └── level-up-wizard/
│       │       ├── index.tsx                  # Wizard modal entry point
│       │       ├── wizard-step.tsx            # Generic step container
│       │       ├── wizard-ability-score.tsx   # ASI: +2/+1+1/feat choice
│       │       ├── wizard-spell-choice.tsx    # Spell selection (GlassEntityChooser)
│       │       └── wizard-feat-choice.tsx     # Feat selection (GlassEntityChooser)
│       ├── hooks/
│       │   ├── use-character-calculations.ts  # All D&D derived value computation
│       │   ├── use-sheet-auto-save.ts          # Per-field debounce + PATCH (isSaving/error state)
│       │   ├── use-sheet-list.ts              # useInfiniteQuery; search term sent as ?search= to server; Fuse.js runs server-side in character-sheets-service.ts
│       │   ├── use-level-up.ts                # Wizard step state machine
│       │   └── use-long-rest.ts               # Long rest mutation + confirmation
│       ├── models/
│       │   ├── character-sheet.ts             # Main CharacterSheet Mongoose model
│       │   ├── character-item.ts
│       │   ├── character-spell.ts
│       │   ├── character-trait.ts
│       │   ├── character-feat.ts
│       │   └── character-attack.ts
│       ├── types/
│       │   └── character-sheet.types.ts       # All TS interfaces and Zod schemas
│       └── utils/
│           ├── slug.ts                        # Slug generation and ID extraction
│           └── dnd-calculations.ts            # Pure functions: modifiers, profBonus, skills, spells
│
├── components/
│   └── ui/
│       └── glass-sheet-card.tsx               # Card for the list (similar to EntityCard)
│
└── app/
    ├── (dashboard)/
    │   ├── my-sheets/
    │   │   ├── page.tsx                        # Server component: HydrationBoundary + sheet list
    │   │   ├── loading.tsx                     # Skeleton grid
    │   │   └── _components/
    │   │       ├── sheets-list.tsx             # Grid + IntersectionObserver (infinite scroll)
    │   │       ├── sheets-search.tsx           # SearchInput wrapper (Fuse.js)
    │   │       └── new-sheet-button.tsx        # Create blank sheet + navigate
    │   └── sheets/
    │       └── [slug]/
    │           ├── page.tsx                    # Server component: fetch full sheet + hydrate
    │           ├── loading.tsx
    │           ├── not-found.tsx
    │           └── _components/
    │               ├── sheet-form.tsx          # useForm orchestrator + auto-save
    │               ├── sheet-header.tsx        # Name, class, level, inspiration, photo upload
    │               ├── sheet-left-column.tsx   # Attributes, saving throws, skills
    │               ├── sheet-center-column.tsx # Combat, attacks, equipment, coins
    │               └── sheet-right-column.tsx  # Personality, characteristics, spells, notes
    └── api/
        └── character-sheets/
            ├── route.ts                        # GET (list, auth) + POST (create blank)
            └── [id]/
                ├── route.ts                    # GET + PATCH + DELETE
                ├── long-rest/
                │   └── route.ts
                ├── items/
                │   ├── route.ts
                │   └── [itemId]/route.ts
                ├── spells/
                │   ├── route.ts
                │   └── [spellId]/route.ts
                ├── traits/
                │   ├── route.ts
                │   └── [traitId]/route.ts
                ├── feats/
                │   ├── route.ts
                │   └── [featId]/route.ts
                └── attacks/
                    ├── route.ts
                    └── [attackId]/route.ts
```

**Structure Decision**: Feature-oriented under `src/features/character-sheets/` following the existing spells/feats/traits pattern. Pages in `src/app/(dashboard)/`. API routes under `src/app/api/character-sheets/`. `glass-sheet-card.tsx` placed in `src/components/ui/` side-by-side with other shared card components.

### Existing Files That Require Modification

| File | Change |
|---|---|
| `src/components/ui/expandable-sidebar.tsx` | Add "Minhas Fichas" item to `mainItems` array (below "Perfil", `authenticated: true`, icon `ScrollText`, href `/my-sheets`) |

## Complexity Tracking

> No constitution violations to justify. All gates pass cleanly.

---

## Design Decisions (Phase 1 Summary)

### 1. Infinite Scroll Strategy
- `useInfiniteQuery` with `page` cursor (same pattern as `useInfiniteSpells`)
- 12 sheets per page (fits 3-col grid cleanly × N rows)
- `IntersectionObserver` on sentinel div below grid triggers `fetchNextPage`
- Client `SearchInput` debounces 500ms then updates the `?search=` query param; server runs Fuse.js in `character-sheets-service.ts` and returns pre-filtered paginated results

### 2. SheetInput Design
`SheetInput` wraps `SearchInput` for debounce and visual loading/error. When `catalogProvider` prop is provided:
- Renders a `Book` (or similar) icon button on the right side of the input
- Clicking the button opens `GlassEntityChooser` with the provider's endpoint
- `onCatalogSelect` callback receives the full `EntityOption` object
- Parent component decides how to populate related fields from the entity

### 3. Auto-Save Architecture
Each field in `sheet-form.tsx` uses `useForm`'s `watch(fieldName)` + `useEffect` with `useDebounce` → calls `save(field, value)` from `useSheetAutoSave`. The `isSaving(field)` / `hasError(field)` state flows back to `SheetInput` as `isSaving` / `saveError` props. No form submit — each field is independent.

### 4. CalcTooltip Pattern
Every derived field (modifiers, skills, saves, CA, initiative, passive perception, spell DC, spell attack) is wrapped with `CalcTooltip`:
```tsx
<CalcTooltip formula={`DEX ${sheet.dexterity} → (${sheet.dexterity}-10)/2 = ${dexMod}`}>
  <SheetInput value={armorClass} onChange={...} isSaving={isSaving('armorClassOverride')} />
</CalcTooltip>
```
When the user overrides a value manually, tooltip shows "Valor manual (cálculo: {formula})".

### 5. Color Coding
- Attribute chips on `GlassSheetCard`: `attributeColors['Força'].bgAlpha + attributeColors['Força'].text` (amber, emerald, red, blue, slate, purple)
- Attribute sections in the sheet editor use the same color per attribute
- `entityColors` not applicable for sheets (no shared entity type); use glass-neutral background with class image

### 6. Level-Up Wizard
Steps are generated from class catalog data (`classRef`). If class has no catalog link, wizard is disabled (user edits level manually). The hook `useLevelUp` manages: `currentStep`, `choices`, `isComplete`, `apply()`. On `apply()`, wizard calls one PATCH + multiple POST/DELETE sub-entity endpoints atomically (best-effort; no DB transactions needed since failures don't corrupt data).

### 7. Long Rest
`long-rest/route.ts` handler: reads `hpMax` and all `spellSlots` totals from sheet, writes `hpCurrent = hpMax`, `spellSlots[n].used = 0` for all n, `hitDiceUsed = 0`. Single atomic Mongoose `findByIdAndUpdate`.

### 8. All Sheets Are Public
All character sheets are publicly accessible to anyone with the link. There is no `isPublic` field and no private/public toggle.

- `GET /api/character-sheets/{id}`: No authentication required. Returns the sheet if it exists; 404 if not found.
- `GET /api/character-sheets` (list): Requires authentication. Returns only sheets where `sheet.userId === clerkUserId` (owner's own sheets).
- Read-only view mode in the sheet editor: determined by `sheet.userId !== currentUserId` (visitor sees data but no edit controls).
- `GlassSheetCard` has no visibility toggle; card only shows sheet metadata and a link.

### 9. Photo Upload
Reuses existing `/api/upload` endpoint and `src/core/storage/s3.ts`. The `sheet-header.tsx` component renders a photo upload zone that calls `/api/upload` then PATCHes the `photo` field.

### 10. Skills Map
All 18 D&D 2024 PT-BR skills stored as a map in `CharacterSheet.skills`. Default value: all skills default to `{ proficient: false, expertise: false }` with no override. The `useCharacterCalculations` hook maps each skill to its governing attribute and computes the bonus.

## Complexity Tracking

> No constitution violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
