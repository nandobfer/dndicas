# Tasks: Minhas Fichas — Fichas de Personagem D&D 2024

**Input**: Design documents from `specs/005-character-sheets/`  
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅  
**Tests**: Not requested in spec — no test tasks included.  
**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no blocking deps between them)
- **[Story]**: User story this task belongs to (US1–US6)
- Exact file paths included in all task descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature folder structure and wire sidebar entry point

- [X] T001 Create feature folder structure `src/features/character-sheets/{api,components,hooks,models,types,utils}/` and page folders `src/app/(dashboard)/my-sheets/_components/` + `src/app/(dashboard)/sheets/[slug]/_components/` per plan.md
- [X] T002 Add "Minhas Fichas" entry to `mainItems` array in `src/components/ui/expandable-sidebar.tsx` (`{ label: 'Minhas Fichas', href: '/my-sheets', icon: ScrollText, authenticated: true }`, positioned below "Perfil")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core TypeScript types, Mongoose models, D&D utilities, API client functions, and server-side service with Fuse.js — MUST be complete before any user story begins

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create all TypeScript interfaces and Zod validation schemas in `src/features/character-sheets/types/character-sheet.types.ts` (types: CharacterSheet, CharacterItem, CharacterSpell, CharacterTrait, CharacterFeat, CharacterAttack, SheetsListResponse, PatchSheetBody, CreateItemBody, CreateSpellBody, CreateTraitBody, CreateFeatBody, CreateAttackBody; include Zod schemas for server-side validation of all POST/PATCH bodies)
- [X] T004 [P] Create CharacterSheet Mongoose model with all fields from data-model.md in `src/features/character-sheets/models/character-sheet.ts` (all attributes, combat, spellcasting, skills map, coins, personality — NO isPublic field; indexes on userId, slug unique, updatedAt)
- [X] T005 [P] Create CharacterItem Mongoose model (`sheetId` ref, `catalogItemId?` ref, `name`, `image?`, `quantity`, `notes`) in `src/features/character-sheets/models/character-item.ts` (index: sheetId)
- [X] T006 [P] Create CharacterSpell Mongoose model (`sheetId` ref, `catalogSpellId?` ref, `name`, `circle`, `school`, `image?`, `prepared`, `components[]`) in `src/features/character-sheets/models/character-spell.ts` (index: sheetId)
- [X] T007 [P] Create CharacterTrait Mongoose model (`sheetId` ref, `catalogTraitId?` ref, `name`, `description`, `origin` enum: `class|race|background|manual`) in `src/features/character-sheets/models/character-trait.ts` (indexes: sheetId, origin)
- [X] T008 [P] Create CharacterFeat Mongoose model (`sheetId` ref, `catalogFeatId?` ref, `name`, `description`, `levelAcquired?`) in `src/features/character-sheets/models/character-feat.ts` (index: sheetId)
- [X] T009 [P] Create CharacterAttack Mongoose model (`sheetId` ref, `name`, `attackBonus`, `damageType`) in `src/features/character-sheets/models/character-attack.ts` (index: sheetId)
- [X] T010 [P] Create D&D 2024 pure calculation utilities in `src/features/character-sheets/utils/dnd-calculations.ts` (each returns `{ value: number; formula: string }`: `getAttributeModifier`, `getProficiencyBonus`, `getSkillBonus`, `getSavingThrowBonus`, `getArmorClass`, `getInitiative`, `getPassivePerception`, `getSpellSaveDC`, `getSpellAttackBonus` — formulas match research.md Section 6 table)
- [X] T011 [P] Create slug utilities in `src/features/character-sheets/utils/slug.ts` (`generateSlug(id: string, name: string): string` → `{id}-{kebab-case-name}` or just `{id}` if name empty; `extractIdFromSlug(slug: string): string` → first segment before `-`)
- [X] T012 [P] Create typed client fetch functions in `src/features/character-sheets/api/character-sheets-api.ts` (one function per endpoint contract: `fetchSheets`, `fetchSheet`, `createSheet`, `patchSheet`, `deleteSheet`, `triggerLongRest`, `fetchItems`, `addItem`, `patchItem`, `removeItem`, `fetchSpells`, `addSpell`, `patchSpell`, `removeSpell`, `fetchTraits`, `addTrait`, `removeTrait`, `fetchFeats`, `addFeat`, `removeFeat`, `fetchAttacks`, `addAttack`, `patchAttack`, `removeAttack` — all fully typed with return types from T003)
- [X] T013 Create server-side character sheets service in `src/features/character-sheets/api/character-sheets-service.ts` (server-only; `getAllUserSheets(userId, search?)`: fetches all user sheets from MongoDB, runs Fuse.js with `{ keys: [name×10, class×5, race×5, subclass×3], threshold: 0.35 }` when search param present, returns filtered + paginated result; `createBlankSheet(userId)`: creates sheet with defaults + slug; `getSheetById(id)`: returns CharacterSheetFull with all sub-entity arrays populated; `patchSheet(id, userId, data)`: validates ownership + partial update; `deleteSheet(id, userId)`: cascade delete of all sub-entities collections)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Visualizar Lista de Fichas (Priority: P1) 🎯 MVP

**Goal**: Authenticated user accesses `/my-sheets`, sees their sheets in an infinite-scroll staggered grid with server-side fuzzy search, skeleton loading, and empty state

**Independent Test**: Access `/my-sheets` with a user who has sheets; verify 3-col grid, each card shows class background image (blurred), photo/avatar fallback, name, race, class, subclass, HP max, 6 attribute modifier chips; verify fuzzy search returns results with typos; verify scroll loads more; verify empty state for new users

- [X] T014 [P] [US1] Implement `GET /api/character-sheets` handler in `src/app/api/character-sheets/route.ts` (require Clerk `auth()` → 401 if missing; calls `getAllUserSheets(userId, search?)` from service; returns `SheetsListResponse` with `sheets[]`, `total`, `page`, `limit`, `hasMore`)
- [X] T015 [P] [US1] Create `character-sheets-queries.ts` with `useInfiniteSheets` hook in `src/features/character-sheets/api/character-sheets-queries.ts` (`useInfiniteQuery` with `queryKey: sheetsKeys.infinite({ search })`, `initialPageParam: 1`, `getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined`, calls `fetchSheets({ page, limit: 12, search })`)
- [X] T016 [US1] Create `use-sheet-list.ts` hook in `src/features/character-sheets/hooks/use-sheet-list.ts` (manages `search` state string; debounces 500ms before passing as param to `useInfiniteSheets`; exposes `sheets` (all pages flattened), `isLoading`, `isFetchingNextPage`, `fetchNextPage`, `hasNextPage`, `setSearch`)
- [X] T017 [P] [US1] Create `glass-sheet-card.tsx` in `src/components/ui/glass-sheet-card.tsx` (class/subclass image as blurred low-opacity background; character photo with generic avatar fallback; name, race, class, subclass; HP max; 6 attribute modifier chips using `attributeColors` from `@/lib/config/colors`; delete button → confirmation modal → calls `useDeleteSheet` mutation + invalidates list; click card body → navigates to `/sheets/[slug]`)
- [X] T018 [P] [US1] Create `sheets-search.tsx` component in `src/app/(dashboard)/my-sheets/_components/sheets-search.tsx` (wraps existing `SearchInput` component; receives `value` and `onValueChange` props; passes debounced search to parent)
- [X] T019 [US1] Create `sheets-list.tsx` component in `src/app/(dashboard)/my-sheets/_components/sheets-list.tsx` (renders `GlassSheetCard` grid with Framer Motion stagger `staggerChildren`; `AnimatePresence` for add/remove; `IntersectionObserver` on sentinel div at list bottom → calls `fetchNextPage`; empty state: animated message + "Criar primeira ficha" CTA; uses `use-sheet-list.ts`)
- [X] T020 [US1] Create `my-sheets/page.tsx` server component in `src/app/(dashboard)/my-sheets/page.tsx` (redirect to login if not authenticated via Clerk `auth()`; `HydrationBoundary` with prefetched first page of sheets; renders `sheets-search.tsx` + `sheets-list.tsx` + `new-sheet-button.tsx` placeholder)
- [X] T021 [P] [US1] Create `my-sheets/loading.tsx` skeleton grid in `src/app/(dashboard)/my-sheets/loading.tsx` (3-col responsive skeleton cards matching GlassSheetCard height, animated pulse)

**Checkpoint**: User Story 1 fully functional — `/my-sheets` shows user's sheets, infinite scroll, fuzzy search, empty state, skeleton loading all working

---

## Phase 4: User Story 2 — Criar Nova Ficha (Priority: P1)

**Goal**: User clicks "Nova Ficha" → blank sheet instantly created in DB → new card appears in list with animation → auto-navigate to sheet editor

**Independent Test**: Click "Nova Ficha", verify button enters loading/disabled state, new card shows in list with entry animation, browser navigates to `/sheets/[slug]` of the new sheet

- [X] T022 [US2] Add `POST /api/character-sheets` handler to `src/app/api/character-sheets/route.ts` (require Clerk `auth()` → 401; calls `createBlankSheet(userId)` which generates slug via `generateSlug(id, '')`, saves to DB; returns 201 with created `CharacterSheet`)
- [X] T023 [US2] Add `useCreateSheet` mutation to `src/features/character-sheets/api/character-sheets-queries.ts` (`useMutation` calling `createSheet()`; on success: `router.push('/sheets/' + sheet.slug)`; on settled: invalidate infinite list query)
- [X] T024 [US2] Create `new-sheet-button.tsx` in `src/app/(dashboard)/my-sheets/_components/new-sheet-button.tsx` (button labeled "Nova Ficha"; on click calls `useCreateSheet`; shows spinner inside button while `isPending`; `disabled` during mutation to prevent double-click; error toast via existing toast system on failure)

**Checkpoint**: User Stories 1 AND 2 functional — list page shows sheets, "Nova Ficha" creates blank sheet and navigates to editor

---

## Phase 5: User Story 3 — Editar Ficha com Auto-Save (Priority: P1)

**Goal**: Full D&D 2024 sheet editor at `/sheets/[slug]` — all fields with per-field 500ms auto-save, D&D formulas auto-calculated with `CalcTooltip` on hover, class image page background, read-only mode for non-owner visitors, attacks CRUD, long rest button

**Independent Test**: Open a sheet, edit the character name, wait 500ms, reload page — name must persist; verify each field shows its own saving indicator independently; verify a non-owner sees the sheet read-only without edit controls

- [X] T025 [US3] Implement `GET`, `PATCH`, `DELETE` handlers in `src/app/api/character-sheets/[id]/route.ts` (`GET`: no auth required, call `getSheetById(id)` → returns `CharacterSheetFull` with all sub-entity arrays, 404 if not found; `PATCH`: `auth()` → 401, ownership check → 403, Zod partial validation, partial update, returns updated sheet; `DELETE`: `auth()` → 401, ownership check → 403, calls `deleteSheet(id, userId)` with cascade, returns `{ success: true }`)
- [X] T026 [P] [US3] Implement attacks API in `src/app/api/character-sheets/[id]/attacks/route.ts` (`GET` list by sheetId, `POST` add attack — auth + ownership) and `src/app/api/character-sheets/[id]/attacks/[attackId]/route.ts` (`PATCH` update name/bonus/damage — auth + ownership; `DELETE` remove — auth + ownership)
- [X] T027 [P] [US3] Implement `POST /api/character-sheets/[id]/long-rest` in `src/app/api/character-sheets/[id]/long-rest/route.ts` (auth + ownership check; atomic `findByIdAndUpdate` setting `hpCurrent = hpMax`, all `spellSlots[n].used = 0`, `hitDiceUsed = 0`; returns updated sheet)
- [X] T028 [P] [US3] Add `useSheet`, `usePatchSheet`, `useDeleteSheet`, `useAddAttack`, `usePatchAttack`, `useRemoveAttack` hooks to `src/features/character-sheets/api/character-sheets-queries.ts` (`useSheet`: single sheet query by slug/id; `usePatchSheet`: mutation PATCH one field; `useDeleteSheet`: mutation DELETE + invalidate list; attacks mutations: each invalidates sheet query on success)
- [X] T029 [US3] Create `use-sheet-auto-save.ts` hook in `src/features/character-sheets/hooks/use-sheet-auto-save.ts` (maintains `savingFields: Set<string>` and `errorFields: Set<string>` in state; `save(sheetId, field, value)` adds field to savingFields, calls `usePatchSheet` mutation, removes on success or adds to errorFields on failure; each `save()` call for same field cancels pending timeout)
- [X] T030 [P] [US3] Create `use-character-calculations.ts` hook in `src/features/character-sheets/hooks/use-character-calculations.ts` (receives sheet field values, calls pure functions from `dnd-calculations.ts`, returns: `attributeModifiers` for all 6 attributes, `proficiencyBonus`, `savingThrows` per attribute, `skills` per skill name (bonus + formula), `armorClass`, `initiative`, `passivePerception`, `spellSaveDC`, `spellAttackBonus` — all as `{ value: number; formula: string }`)
- [X] T031 [P] [US3] Create `use-long-rest.ts` hook in `src/features/character-sheets/hooks/use-long-rest.ts` (manages `isConfirming` state for confirmation dialog; on confirm: calls long-rest mutation, invalidates sheet query on success; exposes `confirm()`, `cancel()`, `isConfirming`, `isPending`)
- [X] T032 [P] [US3] Create `calc-tooltip.tsx` component in `src/features/character-sheets/components/calc-tooltip.tsx` (wraps any children element; on hover shows formula string from `{ value, formula }`; if value is overridden shows "Valor manual (cálculo: {formula})"; tooltip styled with Liquid Glass theme)
- [X] T033 [P] [US3] Create `sheet-input.tsx` base component in `src/features/character-sheets/components/sheet-input.tsx` (props: `value`, `onChange`, `label?`, `type: 'text' | 'number' | 'textarea'`, `isSaving?` shows inline spinner, `saveError?` shows red border, `readOnly?`, `placeholder?`, `className?`; NO catalog button yet — extended in US4 T042)
- [X] T034 [P] [US3] Create `long-rest-button.tsx` component in `src/features/character-sheets/components/long-rest-button.tsx` (button labeled "Descanso Longo"; uses `use-long-rest.ts`; renders confirmation dialog explaining what will be restored; shows loading state during mutation; hidden if `readOnly`)
- [X] T035 [P] [US3] Create `sheet-header.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-header.tsx` (fields: character name, class, subclass, level, race, origin, multiclassNotes, inspiration checkbox; all wired to `use-sheet-auto-save` via `watch` + `useEffect`; photo upload zone → POST `/api/upload` → PATCH `photo` field; class/subclass image as blurred page background overlay; `level` updates trigger `useCharacterCalculations` cascade recalc; "Subir de Nível" button placeholder for US5)
- [X] T036 [P] [US3] Create `sheet-left-column.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-left-column.tsx` (6 attribute `SheetInput` fields with `attributeColors` color chips and `CalcTooltip` over modifier display; proficiency bonus `SheetInput` with `CalcTooltip` formula; saving throws: 6 rows with proficiency checkbox + `CalcTooltip` value; 18 skills: each row with proficiency checkbox + expertise checkbox + `CalcTooltip` bonus; passive perception display with `CalcTooltip`; all values from `useCharacterCalculations`)
- [X] T037 [P] [US3] Create `sheet-center-column.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-center-column.tsx` (combat section: CA `SheetInput` + `CalcTooltip`, initiative `CalcTooltip`, deslocamento `SheetInput`, HP máx/atual/temp `SheetInput` fields, hit dice total/used `SheetInput`, death saves success/failure steppers; `LongRestButton`; attacks section: list of attack rows (name, bônus de ataque, dano/tipo) with add/edit/delete using `useAddAttack`, `usePatchAttack`, `useRemoveAttack` + `AnimatePresence`; coins section: PC/PP/PE/PO/PL `SheetInput` fields with tooltip showing PO equivalent; equipment area with empty-list placeholder for items — fully wired in US6)
- [X] T038 [P] [US3] Create `sheet-right-column.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-right-column.tsx` (personality: traços de personalidade, ideais, vínculos, falhas `SheetInput` textareas; 4 characteristics sections — "Características de Classe" (origin: class), "Características Raciais" (origin: race), "Talentos" (feats), "Habilidades" (origin: background/manual) — each with display list + "adicionar" button placeholder for US4; spellcasting: attribute dropdown, CD de Resistência `CalcTooltip`, bônus de ataque `CalcTooltip`, spell slots grid (nível 1–9, total/used inputs), spell list with prepared toggle + "adicionar magia" placeholder for US4; appearance: age, height, weight, eyes, skin, hair, appearance `SheetInput` fields; notes `SheetInput` textarea)
- [X] T039 [US3] Create `sheet-form.tsx` orchestrator in `src/app/(dashboard)/sheets/[slug]/_components/sheet-form.tsx` (`useForm` initialized with full `CharacterSheetFull` default values; `watch` + `useEffect` per field → `save(sheetId, field, value)` from `useSheetAutoSave`; passes `isSaving(field)` and `hasError(field)` down to each column as props; passes `calculations` from `useCharacterCalculations` to columns; `readOnly = currentUserId !== sheet.userId` disables all `SheetInput` fields for non-owners; renders `sheet-header` + 3-col layout desktop / single-col mobile)
- [X] T040 [US3] Create `sheets/[slug]/page.tsx` server component in `src/app/(dashboard)/sheets/[slug]/page.tsx` (extract sheet ID from slug via `extractIdFromSlug`; fetch sheet server-side via `getSheetById`; if not found → `notFound()`; `HydrationBoundary` with dehydrated sheet data; render `SheetForm` with `currentUserId` from Clerk `auth()` — may be null for visitors)
- [X] T041 [P] [US3] Create `sheets/[slug]/loading.tsx` 3-col skeleton and `sheets/[slug]/not-found.tsx` 404 page in `src/app/(dashboard)/sheets/[slug]/` (`loading.tsx`: 3-col form skeleton matching sheet layout; `not-found.tsx`: "Ficha não encontrada" message + link back to `/my-sheets`)

**Checkpoint**: User Stories 1, 2, and 3 fully functional — complete P1 MVP ready for production: create, list, and edit sheets with full D&D 2024 auto-calculated fields and per-field auto-save

---

## Phase 6: User Story 4 — Seleção por Catálogo com Preenchimento Automático (Priority: P2)

**Goal**: Catalog chooser button on every catalog-linked field; selecting race/class/origin auto-populates related sheet fields and adds sub-entities; spells, traits, feats can be added from catalog or manually

**Independent Test**: Click catalog button on the "Raça" field, select a race — verify race name, deslocamento, tamanho auto-populate in sheet and racial traits appear in "Características Raciais" section; click "adicionar magia", select from catalog — verify spell appears in list with avatar and prepared toggle

- [ ] T042 [US4] Extend `sheet-input.tsx` with optional catalog props in `src/features/character-sheets/components/sheet-input.tsx` (add `catalogProvider?: EntityProvider` and `onCatalogSelect?: (entity: EntityOption) => void`; when `catalogProvider` is set, render a Book icon button on right side of input; button click opens `GlassEntityChooser` modal with the provider; calls `onCatalogSelect` on selection; does not fire `onChange`)
- [ ] T043 [US4] Create `use-catalog-select.ts` hook in `src/features/character-sheets/hooks/use-catalog-select.ts` (receives `form.setValue` + `useAddTrait` + `useAddSpell` mutation references; exports: `onSelectRace(entity)` → sets race, deslocamento, tamanho fields + calls `addTrait` for each racial trait; `onSelectClass(entity)` → sets class, saves proticiências, marks saving throws + calls `addTrait` for level-1 class traits; `onSelectOrigin(entity)` → sets origin + calls `addTrait` for origin traits; handlers copy name/description to trait before calling addTrait)
- [ ] T044 [P] [US4] Implement spells sub-entity API in `src/app/api/character-sheets/[id]/spells/route.ts` (`GET` all spells for sheet — no auth; `POST` add spell from catalog or manual — auth + ownership) and `src/app/api/character-sheets/[id]/spells/[spellId]/route.ts` (`PATCH` prepared toggle — auth + ownership; `DELETE` remove — auth + ownership)
- [ ] T045 [P] [US4] Implement traits sub-entity API in `src/app/api/character-sheets/[id]/traits/route.ts` (`GET` all traits for sheet — no auth; `POST` add trait from catalog or manual — auth + ownership) and `src/app/api/character-sheets/[id]/traits/[traitId]/route.ts` (`DELETE` remove — auth + ownership)
- [ ] T046 [P] [US4] Implement feats sub-entity API in `src/app/api/character-sheets/[id]/feats/route.ts` (`GET` all feats for sheet — no auth; `POST` add feat from catalog or manual — auth + ownership) and `src/app/api/character-sheets/[id]/feats/[featId]/route.ts` (`DELETE` remove — auth + ownership)
- [ ] T047 [US4] Add sub-entity mutations to `src/features/character-sheets/api/character-sheets-queries.ts` (`useAddSpell`, `usePatchSpell` (prepared toggle), `useRemoveSpell`, `useAddTrait`, `useRemoveTrait`, `useAddFeat`, `useRemoveFeat` — all invalidate sheet query on success)
- [ ] T048 [US4] Wire catalog chooser buttons in `sheet-header.tsx` for race, class, origin, subclass fields via `use-catalog-select.ts` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-header.tsx` (pass EntityProvider for each catalog; `onCatalogSelect` calls appropriate handler from `useCatalogSelect`; hidden in readOnly mode)
- [ ] T049 [P] [US4] Wire spell list in `sheet-right-column.tsx` — add "adicionar magia (catálogo)" + "adicionar magia (manual)" buttons, render spells list with avatar, name, circle, prepared checkbox, remove button; `AnimatePresence` for list transitions in `src/app/(dashboard)/sheets/[slug]/_components/sheet-right-column.tsx`
- [ ] T050 [P] [US4] Wire traits sections in `sheet-right-column.tsx` — connect "adicionar" button in each of the 3 trait sections (Características de Classe, Características Raciais, Habilidades) with catalog chooser + manual input option; render trait list with name, description, remove button; `AnimatePresence` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-right-column.tsx`
- [ ] T051 [US4] Wire feats section in `sheet-right-column.tsx` — connect "adicionar talento" button with catalog chooser + manual input; render feats list with name, description, levelAcquired, remove button; `AnimatePresence` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-right-column.tsx`

**Checkpoint**: User Stories 1–4 functional — catalog auto-fill works for race/class/origin; spells, traits, feats can be added from catalog or manually

---

## Phase 7: User Story 5 — Gerenciamento de Nível e Progressão de Classe (Priority: P2)

**Goal**: "Subir de Nível" button opens a multi-step modal wizard with dynamic steps from class progression table; ASI/feat/spell choices applied; canceling wizard leaves sheet unchanged

**Independent Test**: With a level 1 character linked to a class, click "Subir de Nível", complete wizard flow for level 2, verify level incremented and choices applied (new trait, ASI, or spell); verify canceling wizard leaves level unchanged

- [ ] T052 [US5] Create `use-level-up.ts` state machine hook in `src/features/character-sheets/hooks/use-level-up.ts` (state: `isOpen`, `currentStep`, `steps[]`, `choices` map; opens by loading class progression table for next level from catalog; `next()`, `back()`, `cancel()` (resets without saving), `apply()` (calls PATCH level + POST sub-entity mutations for all choices atomically, closes modal on success); steps generated dynamically: HP summary, spell slots summary, new traits, ASI if applicable, spell selection if applicable)
- [ ] T053 [P] [US5] Create `wizard-step.tsx` generic step container in `src/features/character-sheets/components/level-up-wizard/wizard-step.tsx` (title, step progress indicator `{current}/{total}`, slot for step content, "Voltar" / "Próximo" / "Confirmar" buttons; "Confirmar" only on last step; "Cancelar" always visible)
- [ ] T054 [P] [US5] Create `wizard-ability-score.tsx` ASI choice component in `src/features/character-sheets/components/level-up-wizard/wizard-ability-score.tsx` (3 options: +2 to one attribute, +1/+1 to two attributes, or choose a feat; validation: total allocation must equal 2 points before allowing next; calls back with chosen distribution)
- [ ] T055 [P] [US5] Create `wizard-spell-choice.tsx` spell selection step in `src/features/character-sheets/components/level-up-wizard/wizard-spell-choice.tsx` (uses `GlassEntityChooser` with class spells `EntityProvider`; multi-select up to `n` spells granted by level; selected spells shown as chips; calls back with selection)
- [ ] T056 [P] [US5] Create `wizard-feat-choice.tsx` feat selection step in `src/features/character-sheets/components/level-up-wizard/wizard-feat-choice.tsx` (single-select feat from catalog via `GlassEntityChooser`; calls back with selected feat)
- [ ] T057 [US5] Create `level-up-wizard/index.tsx` modal entry point in `src/features/character-sheets/components/level-up-wizard/index.tsx` (full-screen or centered modal; renders steps array from `useLevelUp` using `wizard-step.tsx` container; maps step type to correct step component; `AnimatePresence` for step transitions)
- [ ] T058 [US5] Wire "Subir de Nível" button in `sheet-header.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-header.tsx` (button visible only when `currentUserId === sheet.userId`; disabled with tooltip "Selecione uma classe do catálogo para usar o wizard" when `classRef` is null; on click opens `LevelUpWizard` modal)

**Checkpoint**: User Stories 1–5 functional — level-up wizard guides players through level progression with appropriate choices

---

## Phase 8: User Story 6 — Gerenciar Itens com Quantidade e Avatar (Priority: P2)

**Goal**: Equipment section shows items with catalog avatar or fallback icon, name, quantity with auto-save, notes, remove button; user can add items from catalog or manually

**Independent Test**: Add an item manually to the equipment section, set quantity to 3, reload page — verify quantity is persisted; remove item — verify `AnimatePresence` exit animation plays and item is deleted from DB

- [ ] T059 [US6] Implement items sub-entity API in `src/app/api/character-sheets/[id]/items/route.ts` (`GET` all items by sheetId — no auth; `POST` add item — auth + ownership; body: `catalogItemId?`, `name`, `image?`, `quantity`, `notes`) and `src/app/api/character-sheets/[id]/items/[itemId]/route.ts` (`PATCH` update quantity and/or notes — auth + ownership; `DELETE` remove item — auth + ownership)
- [ ] T060 [US6] Add `useItems`, `useAddItem`, `usePatchItem`, `useRemoveItem` mutations to `src/features/character-sheets/api/character-sheets-queries.ts` (`usePatchItem`: debounce handled in component; all mutations invalidate sheet query on success)
- [ ] T061 [US6] Wire items list in equipment section of `sheet-center-column.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-center-column.tsx` (each item row: catalog image or generic backpack icon fallback, item name, quantity `SheetInput` with 500ms debounce → `usePatchItem`, notes `SheetInput` with 500ms debounce → `usePatchItem`, remove button → `useRemoveItem`; `AnimatePresence` for list transitions)
- [ ] T062 [US6] Add item-add controls to equipment section in `sheet-center-column.tsx` in `src/app/(dashboard)/sheets/[slug]/_components/sheet-center-column.tsx` ("adicionar do catálogo" icon button → opens `GlassEntityChooser` with items `EntityProvider` → `useAddItem` with catalogItemId + copied name/image; "adicionar manualmente" inline form → text input for name → `useAddItem` with no catalogItemId; both hidden in readOnly mode)

**Checkpoint**: All 6 user stories functional — complete feature implementation ready for polish

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, animation audit, and final integration validation

- [ ] T063 [P] Create `aicontext/modules/character-sheets.md` module context file documenting: feature structure, all hooks and their interfaces, key components and props, data flow (server-side Fuse search → TanStack infinite query → use-sheet-list), auto-save pattern (watch + debounce → useSheetAutoSave → usePatchSheet), and design decisions summary
- [ ] T064 [P] Audit Framer Motion coverage across all sub-entity lists in `sheet-left-column.tsx`, `sheet-center-column.tsx`, `sheet-right-column.tsx` — ensure consistent `AnimatePresence` enter/exit animations for attacks, items, spells, traits, feats lists; ensure `AnimatedNumber` used for HP and modifier value transitions
- [ ] T065 [P] Verify `glass-sheet-card.tsx` delete flow end-to-end: confirmation modal → `useDeleteSheet` mutation (implemented in T025) → `queryClient.invalidateQueries(sheetsKeys.infinite(...))` → card disappears from list with `AnimatePresence` exit animation in `src/components/ui/glass-sheet-card.tsx`
- [ ] T066 Run `specs/005-character-sheets/quickstart.md` validation checklist: verify all folder paths from plan.md exist, all Mongoose models have correct indexes, all API routes respond correctly, server-side Fuse.js search returns fuzzy results, auto-save persists per-field changes after page reload, cascade delete removes all sub-entities

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — independent of other stories
- **US2 (Phase 4)**: Depends on Phase 2 — independent of other stories; integrates into US1 list via query invalidation
- **US3 (Phase 5)**: Depends on Phase 2 — independent of other stories; DELETE API shared with US1 card delete
- **US4 (Phase 6)**: Depends on Phase 5 (extends `sheet-input.tsx`, wires catalog buttons into sheet columns)
- **US5 (Phase 7)**: Depends on Phase 6 (uses `useAddSpell`, `useAddFeat` mutations from US4) and Phase 5 (`sheet-header.tsx`)
- **US6 (Phase 8)**: Depends on Phase 5 (`sheet-center-column.tsx` equipment area built in US3)
- **Polish (Phase 9)**: Depends on all phases complete

### User Story Dependencies

| Story | Priority | Can Start After | Notes |
|---|---|---|---|
| US1 | P1 | Foundational | Fully independent |
| US2 | P1 | Foundational | Integrates with US1 list query invalidation |
| US3 | P1 | Foundational | DELETE API shared with US1 card; both P1 stories can be built in parallel |
| US4 | P2 | US3 | Extends US3 components; spells/traits/feats mutations new |
| US5 | P2 | US4 | Uses AddFeat/AddSpell from US4; wizard opens from US3 sheet-header |
| US6 | P2 | US3 | Extends US3 equipment section |

### Recommended Execution Order Within Phase 5 (US3)

```
Batch A (parallel): T025, T026, T027, T028   → API routes + query mutations
Batch B (parallel): T029, T030, T031, T032, T033, T034   → hooks + base components
Batch C (parallel): T035, T036, T037, T038   → column components
Sequential: T039 (form orchestrator) → T040 (page)
Parallel anytime: T041 (loading + not-found)
```

---

## Parallel Execution Examples

### Phase 2 — After T003 completes

```
T004 CharacterSheet model          T010 dnd-calculations.ts
T005 CharacterItem model           T011 slug.ts
T006 CharacterSpell model          T012 character-sheets-api.ts
T007 CharacterTrait model
T008 CharacterFeat model
T009 CharacterAttack model
→ All T004–T012 complete → then: T013 character-sheets-service.ts
```

### Phase 3 (US1) — After Phase 2 completes

```
T014 GET /api/character-sheets route    T017 glass-sheet-card.tsx
T015 character-sheets-queries.ts        T018 sheets-search.tsx
                                        T021 my-sheets/loading.tsx
→ T016 use-sheet-list.ts (after T015)
→ T019 sheets-list.tsx (after T014, T015, T016, T017, T018)
→ T020 my-sheets/page.tsx (after T019)
```

### Phase 5 (US3) — Batch B Parallel

```
T029 use-sheet-auto-save.ts
T030 use-character-calculations.ts
T031 use-long-rest.ts
T032 calc-tooltip.tsx
T033 sheet-input.tsx (base)
T034 long-rest-button.tsx
→ All complete → T035, T036, T037, T038 (column components — parallel)
```

---

## Implementation Strategy

### MVP First (User Stories 1–3 — P1 Only)

1. Complete **Phase 1** (Setup)
2. Complete **Phase 2** (Foundational) — critical gate
3. Complete **Phase 3** (US1 — list page)
4. Complete **Phase 4** (US2 — create sheet)
5. Complete **Phase 5** (US3 — sheet editor)
6. **STOP AND VALIDATE**: Full P1 feature working — create, list, edit sheets with auto-save and D&D calculations
7. Deploy / demo MVP

### Incremental Delivery (All 6 Stories)

1. Setup + Foundational → foundation ready
2. US1 → list page works → demo
3. US2 → create sheet works → demo
4. US3 → full auto-save editor → **MVP shipped**
5. US4 → catalog auto-fill → quality of life improvement
6. US5 → level-up wizard → advanced gameplay feature
7. US6 → full item management → complete inventory system
8. Polish → production-ready

### Parallel Team Strategy

With multiple developers, after Foundational completes:
- **Developer A**: US1 (list page) + US2 (create button) — fast visible wins
- **Developer B**: US3 Batch A + B (API routes + hooks) then US3 column components
- Once US3 complete: Developer A → US4 + US5 (catalog + wizard); Developer B → US6 (items)

---

## Summary

| Phase | Story | Task Range | Task Count | Priority | In MVP? |
|---|---|---|---|---|---|
| Phase 1 | Setup | T001–T002 | 2 | — | ✅ Yes |
| Phase 2 | Foundational | T003–T013 | 11 | — | ✅ Yes |
| Phase 3 | US1: Lista de Fichas | T014–T021 | 8 | P1 | ✅ Yes |
| Phase 4 | US2: Criar Ficha | T022–T024 | 3 | P1 | ✅ Yes |
| Phase 5 | US3: Editar Ficha | T025–T041 | 17 | P1 | ✅ Yes |
| Phase 6 | US4: Seleção Catálogo | T042–T051 | 10 | P2 | No |
| Phase 7 | US5: Level-Up Wizard | T052–T058 | 7 | P2 | No |
| Phase 8 | US6: Gerenciar Itens | T059–T062 | 4 | P2 | No |
| Phase 9 | Polish | T063–T066 | 4 | — | No |
| **Total** | **6 user stories** | **T001–T066** | **66** | | |

**MVP task count (P1 only)**: T001–T041 = **41 tasks**  
**Parallel opportunities**: 38 tasks marked [P] across all phases  
**Independent test criteria**: One per user story (see each phase header)  
**Suggested MVP scope**: Complete Phases 1–5 (US1 + US2 + US3) for full sheet create/list/edit experience
