# Research Document: Catálogo de Magias D&D

**Feature**: 004-spells-catalog  
**Date**: 2026-02-25  
**Phase**: 0 - Outline & Research  

## Overview

This document consolidates research findings and decisions made during the clarification and planning phases for the D&D Spells Catalog feature. All technical unknowns identified in the initial spec have been resolved through systematic Q&A with the product owner and analysis of existing codebase patterns.

---

## 1. Data Representation for Dice Values

### Question
How should the system represent and store D&D dice notation (e.g., "2d6", "1d8", etc.)?

### Research Findings
Two primary approaches considered:
1. **String format**: Store as "2d6", "1d8" with regex validation
2. **Structured object**: Store as `{ quantidade: 2, tipo: "d6" }` with typed schema

### Decision
**Structured object format: `{ quantidade: number, tipo: 'd4'|'d6'|'d8'|'d10'|'d12'|'d20' }`**

### Rationale
- **Type Safety**: Enum for dice types prevents invalid values ("d7", "3d", "abc")
- **Query Efficiency**: Can filter spells by dice type directly (`diceType: "d6"`) without string parsing
- **Validation**: Mongoose schema validates structure at DB level
- **Rendering Logic**: Direct access to `tipo` for color mapping without regex extraction
- **Extensibility**: Easy to add metadata (e.g., `{ quantidade, tipo, bonus: +2 }`) if needed

### Alternatives Rejected
- **String format**: Rejected due to lack of type safety, requires runtime parsing, harder to query, no compile-time validation
- **Separate fields** (quantityD6, quantityD8, etc.): Rejected as overly complex schema with many nullable fields

### Implementation Impact
- Mongoose schema: `dadoBase: { quantidade: Number, tipo: String }` with enum validation
- TypeScript: `type DiceValue = { quantidade: number; tipo: 'd4'|'d6'|'d8'|'d10'|'d12'|'d20' }`
- Zod validation: `z.object({ quantidade: z.number().int().positive(), tipo: z.enum(['d4', 'd6', ...]) })`
- Component: `<GlassDiceValue value={{ quantidade: 2, tipo: "d6" }} />` renders "2d6" with colored icon

---

## 2. Color Palette for Spell Schools

### Question
Which color scheme should be used for the 8 D&D spell schools (Abjuration, Divination, Conjuration, Enchantment, Evocation, Illusion, Necromancy, Transmutation)?

### Research Findings
Existing codebase has established D&D rarity palette in `lib/config/colors.ts`:
- Common (gray), Uncommon (green), Rare (blue), Very Rare (purple), Legendary (gold/amber), Artifact (red)

### Decision
**Map 8 spell schools to 6 rarity colors (reuse existing palette)**

Proposed mapping:
- **Abjuration** → Rare (Blue) - protective magic, shield imagery
- **Divination** → Legendary (Gold) - knowledge, foresight, rare insight
- **Conjuration** → Uncommon (Green) - summoning, creation, nature-adjacent
- **Enchantment** → Very Rare (Purple) - mind magic, charm, mystical
- **Evocation** → Artifact (Red) - damage spells, fire/lightning, destructive
- **Illusion** → Common (Gray) - trickery, deception, subtle
- **Necromancy** → Very Rare (Purple) - death magic, dark arts (shares with Enchantment)
- **Transmutation** → Uncommon (Green) - transformation, alteration (shares with Conjuration)

### Rationale
- **Consistency**: Reuses established design system without introducing new colors
- **Semantic Meaning**: Color associations align with school themes (red=destruction, blue=protection, gold=knowledge)
- **Visual Distinction**: Even with overlaps, schools remain distinguishable by name + icon
- **Zero Design Debt**: No need for new Tailwind classes, CSS variables, or design approval

### Alternatives Rejected
- **Custom color palette**: Rejected to avoid design inconsistency and maintenance overhead
- **Grayscale differentiation**: Rejected for poor visual distinction and boring UX
- **Single color for all schools**: Rejected for lack of information density

### Implementation Impact
- Update `lib/config/colors.ts`:
  ```typescript
  export const spellSchoolColors: Record<SpellSchool, { badge: string; border: string; name: string }> = {
    Abjuração: { badge: "bg-blue-500/20 text-blue-400", border: "border-blue-500/30", name: "Abjuração" },
    // ... 7 more schools
  }
  ```
- Component: `<GlassSpellSchool school="Evocação" />` renders red chip with school name

---

## 3. Dice Type Visual Differentiation

### Question
How should the system visually distinguish between 6 dice types (d4, d6, d8, d10, d12, d20) in the `glass-dice-value` component?

### Research Findings
Dice represent escalating power in D&D:
- d4: weakest (cantrips, minor effects)
- d6: basic spells (Magic Missile, Cure Wounds)
- d8: moderate spells (Guiding Bolt)
- d10: strong spells (Inflict Wounds)
- d12: rare, powerful (Poison Spray upgrade)
- d20: very rare (high-level effects)

### Decision
**Gradient progression using rarity colors:**
- d4 → Common (Gray `#9CA3AF`)
- d6 → Uncommon (Green `#10B981`)
- d8 → Rare (Blue `#3B82F6`)
- d10 → Very Rare (Purple `#8B5CF6`)
- d12 → Legendary (Gold/Amber `#F59E0B`)
- d20 → Artifact (Red `#EF4444`)

### Rationale
- **Intuitive Progression**: Larger dice = more rare/powerful = rarer color
- **Semantic Encoding**: Color communicates relative strength at a glance
- **Reuses Existing System**: Leverages D&D rarity colors already in codebase
- **Accessibility**: High contrast colors distinguishable even for colorblind users (different shapes of dice icons can supplement)

### Alternatives Rejected
- **Random/arbitrary colors**: Rejected for lack of semantic meaning
- **Single color**: Rejected for poor UX and lost opportunity to convey information
- **Dice icons only** (no color): Rejected as less visually engaging

### Implementation Impact
- Update `lib/config/colors.ts`:
  ```typescript
  export const diceColors: Record<DiceType, { bg: string; text: string; icon: string }> = {
    d4: { bg: "bg-gray-500/20", text: "text-gray-400", icon: "⚀" },
    d6: { bg: "bg-green-500/20", text: "text-green-400", icon: "⚁" },
    // ... d8-d20
  }
  ```
- Component: `<GlassDiceValue value={{ quantidade: 2, tipo: "d10" }} />` renders with purple styling

---

## 4. Cantrip (Circle 0) Filter Behavior

### Question
When a user filters by a specific spell circle (e.g., "3º Círculo"), should the system automatically include cantrips (circle 0) in the results?

### Research Findings
- **D&D Mechanics**: Cantrips are mechanically distinct (unlimited casting, no spell slots, scale with character level)
- **User Mental Model**: Players distinguish between "preparing Circle 3 spells" vs. "cantrips known"
- **Existing Patterns**: Feats filter by exact level match, not "up to level X" by default

### Decision
**Cantrips are a separate filter category; explicit selection required**

Behavior:
- Filter "3º Círculo" shows ONLY 3rd circle spells
- Filter "Truque" shows ONLY cantrips (circle 0)
- User can select multiple: ["Truque", "1º Círculo", "3º Círculo"] to see combined results (OR logic)

### Rationale
- **Predictability**: User gets exactly what they filter for, no surprises
- **D&D Authenticity**: Matches how players think about spell levels
- **Flexibility**: Multi-select allows custom combinations (e.g., "show me all cantrips and 1st level spells")

### Alternatives Rejected
- **Auto-include cantrips**: Rejected for unexpected "magic" behavior and confusion
- **"Up to Nth Circle" mode only**: Rejected as less flexible for precise queries

### Implementation Impact
- Filter logic:
  ```typescript
  if (filters.circles.length > 0) {
    query.circle = { $in: filters.circles } // [0, 3] for Truque + 3º Círculo
  }
  ```
- UI: Horizontal selector with "Truque", "1º", "2º"..."9º" as separate chips

---

## 5. Source Field Input Type

### Question
Should the "fonte" (source/reference) field be a dropdown of predefined sources or a free text input?

### Research Findings
- **Official books**: PHB, Xanathar's, Tasha's, Fizban's, etc. (20+ books)
- **Digital sources**: D&D Beyond, Roll20, unofficial SRDs
- **Custom content**: Homebrew, Unearthed Arcana (UA), DM's Guild
- **Page references**: "PHB pg. 230", "XGtE p. 157"

### Decision
**Free text input**

### Rationale
- **Flexibility**: Accommodates all formats without restricting user creativity
- **Low Maintenance**: No need to update dropdown when new books release
- **Page Numbers**: Users can include specific page references ("XGtE p. 62")
- **Homebrew-Friendly**: Allows "Homebrew - João", "UA 2023", "Custom", etc.

### Alternatives Rejected
- **Dropdown**: Rejected for high maintenance overhead, can't predict all sources, limits expressiveness
- **Dropdown + "Other" option**: Rejected as awkward UX (most users would pick "Other" anyway)

### Implementation Impact
- Form: `<GlassInput id="fonte" label="Fonte / Referência" placeholder="Ex: PHB pg. 195" />`
- Validation: Optional field, no enum constraint, max 200 characters
- Search: Full-text search includes source field for queries like "Xanathar"

---

## 6. Table Column Order

### Question
What is the optimal column sequence for the spells table to balance information density and usability?

### Research Findings
- **Rules table**: Status (admin), Name, Description, Source, Actions
- **Feats table**: Status (admin), Name, Level, Attributes, Description, Source, Preview, Actions
- **User priorities**: Identified through spec requirements - circle and school are game-critical filters

### Decision
**Column order: Status (admin only), Círculo, Nome, Escola, Atributo Resistência, Dado Base, Dado/Nível Extra, Ações**

### Rationale
- **Admin First**: Status column first (when visible) for quick scanning of inactive spells
- **Game-Critical Data**: Circle and School near the front (primary classification in D&D)
- **Identification**: Name after circle (natural reading flow: "3rd level Evocation spell...")
- **Mechanical Info**: School → Save Attribute → Dice (descending importance)
- **Actions Last**: Consistent pattern across all tables

### Alternatives Rejected
- **Alphabetical columns**: Rejected for poor task-oriented UX
- **Description in table**: Rejected for clutter; moved to preview tooltip (hover over Eye icon)
- **Source before mechanics**: Rejected as less relevant during gameplay filtering

### Implementation Impact
- Table structure mirrors `feats-table.tsx` with adjusted columns
- Column widths: Status (100px), Circle (90px), Name (auto), School (140px), Attribute (100px), Dice Base (100px), Dice Extra (100px), Actions (100px)

---

## 7. School Name Display Width

### Question
Should the "Escola" column display full school names ("Transmutação", "Adivinhação") or abbreviations ("Trans", "Adiv") to save space?

### Research Findings
- **Longest school names**: Transmutação (12 chars), Adivinhação (11 chars), Conjuração (10 chars)
- **Shortest**: Ilusão (6 chars), Evocação (8 chars)
- **Existing patterns**: Codebase prefers clarity over space (no abbreviated entity names found)

### Decision
**Always show full school names**

### Rationale
- **Clarity**: "Transmutação" is immediately recognizable; "Trans" could be confusing (Transformation? Translation?)
- **Accessibility**: Screen readers pronounce full words correctly
- **New Player Friendly**: D&D school names are not universally known acronyms (unlike "HP", "AC")
- **Modern UI**: Horizontal scroll is acceptable; readability > space savings

### Alternatives Rejected
- **Abbreviations**: Rejected for poor clarity, especially for non-native English speakers (PT translation complicates abbreviation)
- **Truncation with ellipsis**: Rejected as worse UX than full name with scroll

### Implementation Impact
- Column width: `w-[140px]` for school chip
- Chip component: `<GlassSpellSchool school="Transmutação" />` renders full name
- No abbreviation logic needed

---

## 8. Dice Quantity Validation Limit

### Question
Should the system enforce a maximum dice quantity (e.g., prevent "999d20") to ensure sanity, or trust admin judgment?

### Research Findings
- **Typical spells**: 1d6 to 10d10 (most official spells)
- **High-level extremes**: Meteor Swarm (40d6), some homebrew may exceed
- **Validation complexity**: Hard limits require arbitrary threshold, maintenance as game evolves

### Decision
**No upper limit; validate only positive integers (>0)**

### Rationale
- **Trust**: Admins are trusted to input valid game data
- **Flexibility**: Doesn't block legitimate high-level or homebrew spells
- **Simplicity**: Simpler validation logic, one less arbitrary constant to maintain
- **Error Recovery**: If someone enters 999d20, it's admin-visible before going public (status toggle)

### Alternatives Rejected
- **Max 5 dice**: Rejected as too restrictive (blocks many official spells)
- **Max 20 dice**: Rejected as arbitrary; still could block valid homebrew
- **Warning on >20**: Rejected as added UI complexity for edge case

### Implementation Impact
- Validation: `z.number().int().positive()` (no `.max()`)
- Error message (only for <1): "Quantidade deve ser pelo menos 1"
- Form input: `<input type="number" min="1" />` (browser-level hint, not enforced)

---

## 9. Unsaved Changes Protection

### Question
When a user has unsaved changes in the spell create/edit modal and attempts to close it (click outside, ESC key, X button), what should happen?

### Research Findings
- **Common UX patterns**: GitHub, Google Docs, Notion all show confirmation dialogs
- **User expectation**: Modern users expect protection from accidental data loss
- **Form investment**: Spell forms are multi-field with rich text; significant time investment

### Decision
**Show confirmation dialog:** "Você tem alterações não salvas. Descartar?" with Cancel/Discard buttons

### Rationale
- **Data Protection**: Prevents accidental loss of work (user might click outside by mistake)
- **Standard Pattern**: Matches user expectations from other apps
- **Low Friction**: One extra click only when user has unsaved work
- **Form State Preservation**: Modal stays open on Cancel, user can continue editing

### Alternatives Rejected
- **Immediate close**: Rejected for high data loss risk, poor UX
- **Auto-save drafts**: Rejected for added complexity (draft storage, restoration logic, cleanup)
- **Always confirm** (even without changes): Rejected as annoying and unnecessary

### Implementation Impact
- Form logic:
  ```typescript
  const { formState: { isDirty } } = useForm()
  const handleClose = () => {
    if (is Dirty) {
      setShowConfirmDialog(true)
    } else {
      onClose()
    }
  }
  ```
- Confirmation dialog component: Reuse existing `GlassAlertDialog` or create minimal version

---

## 10. API Error Handling Strategy

### Question
When an API operation fails (network error, validation error from backend, server error during create/update/delete), how should the system inform the user?

### Research Findings
- **Existing pattern**: Rules/Feats use toast notifications for success/error
- **Error types**: Network failure (offline), 400 validation (bad input), 403 forbidden (auth), 500 server error
- **User recovery**: User needs to understand what failed and how to retry

### Decision
**Show error toast only; user retries manually by clicking save/submit again; modal/form remains open preserving data**

### Rationale
- **Consistency**: Matches toast pattern used throughout app
- **Data Preservation**: Form data not lost, user can fix issue and retry
- **Simplicity**: No additional retry button logic, network request management
- **Clear Feedback**: Toast message describes error ("Erro ao salvar magia: [reason]")

### Alternatives Rejected
- **Toast with retry button**: Rejected as added UI complexity, managing retry state, unclear if form data changed
- **Inline errors + toast**: Rejected as redundant; toast sufficient for non-field-specific errors
- **Blocking modal**: Rejected as overly dramatic for transient network issues

### Implementation Impact
- API mutation error handling:
  ```typescript
  onError: (error) => {
    toast.error(`Erro ao ${isEdit ? "atualizar" : "criar"} magia: ${error.message}`)
    // Modal stays open, form data preserved
  }
  ```
- Error messages in Portuguese, user-friendly ("Falha na conexão", not "ERR_NETWORK_TIMEOUT")

---

## Summary of Key Patterns to Reuse

Based on research and existing codebase analysis:

1. **Component Patterns** (from Rules/Feats):
   - Table: `AnimatePresence` + `motionConfig.variants.tableRow` for animations
   - Filters: `SearchInput` + `StatusChips` + `GlassSelector` for multiselect
   - Form: `GlassModal` + `GlassInput` + `RichTextEditor` + `Controller` from RHF
   - Empty states: `<EmptyState icon={Icon} title="..." description="..." />`
   - Loading: `<LoadingState variant="spinner" message="..." />`

2. **Data Patterns**:
   - Mongoose schema with timestamps, indexes, enums
   - Zod validation shared between API and form
   - TanStack Query: `useQuery` for GET, `useMutation` for CUD
   - SSR hydration: `await queryClient.prefetchQuery` → `<HydrationBoundary>`

3. **Auth Pattern**:
   - `useAuth()` hook checks `isAdmin`
   - API routes: `const user = await requireAuth(req)` → `if (user.role !== 'admin') throw 403`
   - Conditional rendering: `{isAdmin && <AdminOnlyButton />}`

4. **Audit Pattern**:
   - After successful DB op: `AuditLogExtended.create({ action: "CREATE", entity: "Spell", entityId, performedBy, newData, ... })`
   - Batch with mutation in transaction if needed
   - Include performedByUser populated data

5. **Mention Pattern**:
   - Add to `suggestion.ts`: `type: "Magia"`, query function, format function
   - Update `mention-badge.tsx`: Add case for "Magia" with purple (veryRare) variant
   - Update `mention-list.tsx`: Add "Magia" icon (could use Wand icon or similar)

6. **Animation Pattern**:
   - Import `motionConfig` from `@/lib/config/motion-configs`
   - Apply to table rows, cards, modal content
   - Use `initial`, `animate`, `exit` with `variants`

7. **Error Handling Pattern**:
   - Zod parse errors → 400 response with field details
   - Mongoose validation errors → 400 with message
   - Auth errors → 403 with "Forbidden"
   - Not found → 404 with "Spell not found"
   - Server errors → 500 with generic message (log details server-side)

---

## Technologies & Dependencies

**No new dependencies required.** All necessary technologies already in project:

| Technology | Version | Purpose | Pattern Source |
|------------|---------|---------|----------------|
| Next.js | 15+ | App Router, SSR, API Routes | Entire app |
| React | 18+ | UI components | Entire app |
| TypeScript | 5.x | Type safety | Entire app |
| Mongoose | Latest | MongoDB ODM | `src/core/database/`, `src/features/*/models/` |
| TanStack Query | v5 | Server state | `src/features/rules/api/rules-queries.ts` |
| React Hook Form | Latest | Form state | `src/features/rules/components/rule-form-modal.tsx` |
| Zod | Latest | Validation | `src/features/rules/api/validation.ts` |
| Framer Motion | Latest | Animations | `src/lib/config/motion-configs.ts` |
| Tailwind CSS | Latest | Styling | Entire app |
| Clerk | Latest | Authentication | `src/core/auth/` |
| TipTap | Latest | Rich text | `src/features/rules/components/rich-text-editor.tsx` |
| Lucide React | Latest | Icons | Throughout components |

---

## Conclusion

All research questions resolved. Implementation can proceed with:
- **Zero new dependencies**
- **100% pattern reuse** from Rules and Feats features
- **Clear design decisions** for all ambiguous requirements
- **Constitution-compliant** architecture (no core modifications, hooks-based, typed)

Next steps: Phase 1 - Generate data-model.md, contracts/, and quickstart.md.
