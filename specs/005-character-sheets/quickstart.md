# Quickstart: Minhas Fichas — Fichas de Personagem D&D 2024

**Branch**: `005-character-sheets` | **Date**: 2026-03-12

---

## Developer Overview

This feature adds a complete D&D 2024 character sheet system to the Dungeons & Dicas platform. Key architectural pieces:

- **List page** (`/my-sheets`): Infinite scroll grid of sheet cards, Fuse.js client-side search
- **Sheet editor** (`/sheets/[slug]`): Full D&D 2024 form with per-field auto-save (500ms debounce)
- **Auto-calculations**: All derived D&D values computed client-side by `useCharacterCalculations` hook
- **Catalog integration**: `GlassEntityChooser` opens from any field that has catalog counterpart
- **Level-up wizard**: Multi-step modal for guided level progression

---

## Folder Structure

```
src/
├── features/
│   └── character-sheets/
│       ├── api/
│       │   ├── character-sheets-api.ts        # Client fetch functions (typed)
│       │   ├── character-sheets-queries.ts    # TanStack Query hooks (client)
│       │   └── character-sheets-service.ts    # Server-side Mongoose service
│       ├── components/
│       │   ├── sheet-input.tsx                # Debounced input + optional catalog chooser
│       │   ├── calc-tooltip.tsx               # Hover tooltip showing D&D formula
│       │   ├── long-rest-button.tsx           # Long rest with confirmation
│       │   └── level-up-wizard/
│       │       ├── index.tsx                  # Wizard modal entry point
│       │       ├── wizard-step.tsx            # Generic step wrapper
│       │       ├── wizard-ability-score.tsx   # ASI choice step
│       │       ├── wizard-spell-choice.tsx    # Spell selection step
│       │       └── wizard-feat-choice.tsx     # Feat selection step
│       ├── hooks/
│       │   ├── use-character-calculations.ts  # D&D formula engine
│       │   ├── use-sheet-auto-save.ts          # Per-field debounce + PATCH
│       │   ├── use-sheet-list.ts              # Infinite query + Fuse.js search
│       │   ├── use-level-up.ts                # Level-up wizard state machine
│       │   └── use-long-rest.ts               # Long rest mutation
│       ├── models/
│       │   ├── character-sheet.ts
│       │   ├── character-item.ts
│       │   ├── character-spell.ts
│       │   ├── character-trait.ts
│       │   ├── character-feat.ts
│       │   └── character-attack.ts
│       ├── types/
│       │   └── character-sheet.types.ts
│       └── utils/
│           ├── slug.ts                        # Slug generator/parser
│           └── dnd-calculations.ts            # Pure D&D formula functions
│
├── components/ui/
│   └── glass-sheet-card.tsx                   # Card component for sheet list
│
├── app/
│   ├── (dashboard)/
│   │   ├── my-sheets/
│   │   │   ├── page.tsx                       # Server component (hydration)
│   │   │   ├── loading.tsx                    # Skeleton loading
│   │   │   └── _components/
│   │   │       ├── sheets-list.tsx            # Grid with infinite scroll
│   │   │       ├── sheets-search.tsx          # Search input wrapper
│   │   │       └── new-sheet-button.tsx       # Create button
│   │   └── sheets/
│   │       └── [slug]/
│   │           ├── page.tsx                   # Server component (fetch + hydrate)
│   │           ├── loading.tsx
│   │           ├── not-found.tsx
│   │           └── _components/
│   │               ├── sheet-form.tsx         # Main form orchestrator
│   │               ├── sheet-header.tsx       # Name, class, level, photo
│   │               ├── sheet-attributes-column.tsx
│   │               ├── sheet-combat-column.tsx
│   │               ├── sheet-personality-column.tsx
│   │               ├── sheet-spells-section.tsx
│   │               ├── sheet-characteristics-section.tsx
│   │               ├── sheet-items-section.tsx
│   │               ├── sheet-attacks-section.tsx
│   │               └── sheet-coins-section.tsx
│   └── api/
│       └── character-sheets/
│           ├── route.ts                       # GET (list) + POST (create)
│           └── [id]/
│               ├── route.ts                   # GET + PATCH + DELETE
│               ├── long-rest/route.ts
│               ├── items/
│               │   ├── route.ts
│               │   └── [itemId]/route.ts
│               ├── spells/
│               │   ├── route.ts
│               │   └── [spellId]/route.ts
│               ├── traits/
│               │   ├── route.ts
│               │   └── [traitId]/route.ts
│               ├── feats/
│               │   ├── route.ts
│               │   └── [featId]/route.ts
│               └── attacks/
│                   ├── route.ts
│                   └── [attackId]/route.ts
```

---

## Key Components

### `glass-sheet-card.tsx`
Card for the `/my-sheets` grid. Similar to `EntityCard` in `entity-card.tsx`.

```tsx
interface GlassSheetCardProps {
  sheet: CharacterSheet
  index: number                        // For stagger animation delay
  onDelete: (id: string) => void
  onToggleVisibility: (id: string, isPublic: boolean) => void
}
```

**Visual**: Background image from class/subclass (opacity 15% + blur), character photo with fallback avatar, 6 attribute modifier chips (color-coded via `attributeColors`), HP max, visibility lock icon.

---

### `sheet-input.tsx`
Shared input for all sheet fields. Wraps `SearchInput` for debounce + loading state.

```tsx
interface SheetInputProps {
  value: string | number
  onChange: (value: string | number) => void
  onCatalogSelect?: (entity: EntityOption) => void  // callback when entity chosen
  catalogProvider?: EntityProvider                   // enables catalog button
  isSaving?: boolean                                // shows spinner in input
  saveError?: boolean                               // shows red border
  label?: string
  type?: 'text' | 'number'
  placeholder?: string
  readOnly?: boolean                                // for public view mode
}
```

When `catalogProvider` is set, renders a small book icon button (right side of input) that opens `GlassEntityChooser`.

---

### `calc-tooltip.tsx`
Wrapper that shows a formula tooltip on hover for auto-calculated fields.

```tsx
interface CalcTooltipProps {
  formula: string            // e.g. "STR 16 → floor((16-10)/2) = +3"
  children: React.ReactNode
  disabled?: boolean         // when field has manual override active
}
```

---

### `use-character-calculations.ts`
Central hook that derives all calculated values from raw sheet data.

```tsx
const {
  modifiers,          // { strength: 3, dexterity: 1, ... }
  proficiencyBonus,   // 2 (from level)
  skillBonuses,       // { Percepção: 5, Atletismo: 3, ... }
  savingThrowBonuses, // { strength: 3, dexterity: 1, ... }
  armorClass,         // 10 + dex mod (or override)
  initiative,         // dex mod (or override)
  passivePerception,  // 10 + perception bonus (or override)
  spellSaveDC,        // 8 + prof + spellAttr mod (or override)
  spellAttackBonus,   // prof + spellAttr mod (or override)
  // Each field has: { value, formula, isOverridden }
} = useCharacterCalculations(sheet)
```

---

### `use-sheet-auto-save.ts`
Per-field debounce and PATCH. One instance per sheet editor.

```tsx
const { save, isSaving, hasError } = useSheetAutoSave(sheetId)

// Usage in SheetInput (via useEffect + watch):
// useEffect(() => { save('strength', value) }, [debouncedStrength])
```

---

### `use-sheet-list.ts`
Infinite query + Fuse.js search. Used by the `/my-sheets` page.

```tsx
const {
  sheets,           // Flattened from infinite pages
  allSheets,        // All loaded sheets (for Fuse.js)
  filteredSheets,   // After Fuse.js filter
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  search,           // Current search term
  setSearch,
} = useSheetList()
```

---

## Auto-Calculations Reference

All calculations are pure functions in `dnd-calculations.ts`:

```ts
// Attribute modifier
const getModifier = (value: number): number => Math.floor((value - 10) / 2)

// Proficiency bonus from level
const getProficiencyBonus = (level: number): number => {
  if (level <= 4) return 2
  if (level <= 8) return 3
  if (level <= 12) return 4
  if (level <= 16) return 5
  return 6
}

// Skill bonus
const getSkillBonus = (attrMod: number, profBonus: number, proficient: boolean, expertise: boolean): number =>
  attrMod + (proficient ? profBonus : 0) + (expertise ? profBonus : 0)

// Spell save DC
const getSpellSaveDC = (profBonus: number, spellcastingMod: number): number =>
  8 + profBonus + spellcastingMod

// Spell attack bonus
const getSpellAttackBonus = (profBonus: number, spellcastingMod: number): number =>
  profBonus + spellcastingMod
```

---

## API Usage Examples

```ts
// Create blank sheet
const sheet = await createSheet()       // POST /api/character-sheets
router.push(`/sheets/${sheet.slug}`)

// Auto-save a field
await patchSheet(sheetId, { strength: 18 })

// Long rest
await triggerLongRest(sheetId)          // POST /api/character-sheets/{id}/long-rest

// Add spell from catalog
await addSpell(sheetId, {
  catalogSpellId: spell._id,
  name: spell.name,
  circle: spell.circle,
  image: spell.image,
})

// Delete sheet
await deleteSheet(sheetId)              // DELETE /api/character-sheets/{id}
```

---

## Color System Usage

```ts
import { attributeColors } from '@/lib/config/colors'

// Each attribute chip on the card:
const strengthConfig = attributeColors['Força']
// { bg, text, border, bgAlpha, hex } → "amber" theme

// Available attribute keys:
// 'Força' | 'Destreza' | 'Constituição' | 'Inteligência' | 'Sabedoria' | 'Carisma'
```

---

## Slug Pattern

```
Slug = "{mongoId}-{kebab-case-name}"
Examples:
  "65f1abc123-thorin-escudodepedra"
  "65f1abc123"   (when name is empty)

Route lookup:
  slug.split('-')[0]  → MongoDB _id
  findById(id) → sheet (then verify userId or isPublic)
```

---

## Level-Up Wizard Flow

```
User clicks "Subir de Nível" (level N → N+1)
  ↓
useLevelUp loads class progression table from catalog
  ↓
Wizard steps (only shown if relevant):
  1. HP notice (manual field reminder)
  2. New spell slots (shown as summary, auto-applied)
  3. New class traits (shown as summary, auto-applied)
  4. Ability Score Improvement? (if applicable for this level):
     - Option A: +2 to one attribute
     - Option B: +1/+1 to two attributes
     - Option C: Choose a feat (opens GlassEntityChooser for Feats)
  5. New spells known? (if class grants them):
     - Opens spell selector per circle
  6. Summary → "Confirmar Subida de Nível"
  ↓
All choices committed via PATCH + POST sub-entity calls
Level incremented last (cascade recalc)
```

---

## Checklist Before Implementation

- [ ] `Fuse` package: already in `package.json` (used by `search-engine.ts`)
- [ ] `useInfiniteQuery`: already available (TanStack Query already installed)
- [ ] `GlassEntityChooser`: exists at `@/components/ui/glass-entity-chooser`
- [ ] `SearchInput`: exists at `@/components/ui/search-input`
- [ ] `attributeColors`: exported from `@/lib/config/colors`
- [ ] `EntityProvider` type: exported from `@/lib/config/entities`
- [ ] S3 storage: `uploadFile` in `@/core/storage/s3`
- [ ] Clerk auth: `auth()` for server routes, `useAuth()` for client
- [ ] Add "Minhas Fichas" to sidebar: `src/components/ui/expandable-sidebar.tsx` → `mainItems`
