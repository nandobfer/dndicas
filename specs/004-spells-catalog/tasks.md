# Tasks: Catálogo de Magias D&D

**Feature**: 004-spells-catalog  
**Input**: Design documents from `specs/004-spells-catalog/`  
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/spells.yaml, quickstart.md, research.md  

**Tests**: Tests are OPTIONAL and NOT included in this task list unless explicitly requested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and structure preparation

- [ ] T001 Verify branch `004-spells-catalog` is checked out and up-to-date with main
- [ ] T002 Review existing Rules and Feats features structure in src/features/ for pattern consistency
- [ ] T003 [P] Read constitution file at .specify/memory/constitution.md to understand project principles

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data layer and infrastructure that MUST be complete before ANY user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Data Layer Foundation

- [ ] T004 Create Spell model with Mongoose schema in src/features/spells/models/spell.ts (includes ISpell, DiceValue, SpellSchema with validation and indexes)
- [ ] T005 [P] Create TypeScript type definitions in src/features/spells/types/spells.types.ts (Spell, DiceValue, SpellSchool enum, AttributeType enum, CreateSpellInput, UpdateSpellInput, SpellsFilters)
- [ ] T006 [P] Create Zod validation schemas in src/features/spells/api/validation.ts (diceValueSchema, createSpellSchema, updateSpellSchema, spellsQuerySchema)
- [ ] T007 Implement spells service layer in src/features/spells/api/spells-service.ts (listSpells, getSpellById, createSpell, updateSpell, deleteSpell with audit logging)
- [ ] T008 Create API route for list and create in src/app/api/spells/route.ts (GET with filters/pagination, POST with admin auth)
- [ ] T009 Create API route for single spell operations in src/app/api/spells/[id]/route.ts (GET, PUT, DELETE with admin auth)
- [ ] T010 [P] Create TanStack Query hooks in src/features/spells/api/spells-queries.ts (useSpells, useSpell, useCreateSpell, useUpdateSpell, useDeleteSpell with proper onSuccess callbacks including queryClient.invalidateQueries(['spells']) for immediate list refresh)

### Reusable UI Components (Extracted from Rules/Feats)

- [ ] T011 [P] Extract glass-level-chip component to src/components/ui/glass-level-chip.tsx (displays circle/level with rarity colors, handles "Truque" for circle 0)
- [ ] T012 [P] Extract glass-attribute-chip component to src/components/ui/glass-attribute-chip.tsx (displays attribute abbreviation with color)
- [ ] T013 [P] Create glass-dice-value component in src/components/ui/glass-dice-value.tsx (displays dice notation "2d6" with icon and color by type)
- [ ] T014 [P] Create glass-dice-selector component in src/components/ui/glass-dice-selector.tsx (form input with quantity number + dice type select, manages own local state)
- [ ] T014b [P] Create glass-empty-value component in src/components/ui/glass-empty-value.tsx (compact inline empty state displaying "—" for null/undefined values in table cells, inspired by glass-inline-empty-state but minimal)
- [ ] T015 [P] Create glass-spell-school component in src/components/ui/glass-spell-school.tsx (chip with school name and mapped rarity color)
- [ ] T016 [P] Extract glass-status-toggler component to src/components/ui/glass-status-toggler.tsx (active/inactive toggle for forms)

### Configuration Extensions

- [ ] T017 [P] Extend colors config in src/lib/config/colors.ts (add spellSchoolColors mapping 8 schools to rarity, diceColors mapping d4-d20 to rarity, entityColors.Magia = veryRare)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Visualizar e Buscar Magias (Priority: P1) 🎯 MVP

**Goal**: Players and DMs can view paginated spell list with formatted chips (circle, school, dice) and perform text search by name/description. This is the minimum viable product delivering immediate consultation value.

**Independent Test**: Access /spells page, verify table renders with: circle chips (colored 0-9, "Truque" for 0), school chips (8 schools with rarity colors), dice values (colored by type), attribute chips. Perform text search and verify filtering works in real-time (<300ms).

### Implementation for User Story 1

- [ ] T018 [P] [US1] Create useSpellFilters custom hook in src/features/spells/hooks/useSpellFilters.ts (manages search text, pagination state, URL sync)
- [ ] T019 [P] [US1] Create spell preview component in src/features/spells/components/spell-preview.tsx (tooltip content with circle, school, dice, description formatted)
- [ ] T020 [US1] Create spells table component in src/features/spells/components/spells-table.tsx (mirrors rules-table.tsx pattern, columns: Status (admin only), Circle, Name, School, Save Attribute, Base Dice, Extra Dice, Actions)
- [ ] T021 [US1] Create spells page route in src/app/(dashboard)/spells/page.tsx (SSR with initial data fetch, hydration via TanStack Query)
- [ ] T022 [US1] Create loading state component in src/app/(dashboard)/spells/loading.tsx (skeleton with glassmorphism)
- [ ] T023 [US1] Add spells navigation item to sidebar in src/app/(dashboard)/layout.tsx or sidebar component (label "Magias", icon Wand from lucide-react, route /spells, position below Talentos)
- [ ] T024 [US1] Verify search functionality works with text input debounced to 300ms and filters by name or description content

**Checkpoint**: At this point, User Story 1 should be fully functional - users can view paginated spell list and search by text

---

## Phase 4: User Story 2 - Filtrar Magias por Critérios Avançados (Priority: P2)

**Goal**: Users can apply advanced filters (circle, school, save attribute, dice type) to narrow spell search. Filters combine with AND logic across categories, OR within multiselect fields.

**Independent Test**: Open /spells, apply filter "5º Círculo" + "Evocação" school + "d6" dice type. Verify only spells matching ALL criteria appear. Clear filters and verify full list returns. Test "Até 5º" circle mode shows circles 0-5. Verify truques require explicit selection (not auto-included).

### Implementation for User Story 2

- [ ] T025 [US2] Extend useSpellFilters hook in src/features/spells/hooks/useSpellFilters.ts (add state for circle, schools multiselect, attributes multiselect, diceTypes multiselect, circleMode "exact" or "upTo")
- [ ] T026 [US2] Create spells filters panel component in src/features/spells/components/spells-filters.tsx (mirrors feats-filters.tsx pattern EXACTLY, includes: search input, circle numeric input with GlassSelector toggle for "Exato" vs "Até N" modes like level filter, schools multiselect with chips, attributes grid selector, dice types multiselect, clear filters button)
- [ ] T027 [US2] Update spells page in src/app/(dashboard)/spells/page.tsx (integrate filters panel above table, pass filter state to API query)
- [ ] T028 [US2] Update spells table in src/features/spells/components/spells-table.tsx (add filter result count display, empty state when no results match filters)
- [ ] T029 [US2] Verify filters persist in URL query params and maintain state across page navigation and browser refresh
- [ ] T030 [US2] Verify filter response time is under 500ms for combined filters with 100+ spells in database

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - full view, search, and advanced filtering complete

---

## Phase 5: User Story 3 - Criar e Editar Magias (Admin) (Priority: P3)

**Goal**: Admins can create new spells and edit existing ones via modal form with validation. Form includes: name, circle selector (0-9 horizontal), school dropdown, attribute grid, dice selectors, rich text editor for description, source text input, status toggle.

**Independent Test**: Login as admin, click "Nova Magia" button, fill form fields (name "Raio Congelante", circle 0 "Truque", school "Evocação", base dice 1d8), click save. Verify spell appears in table with correct chips and values. Edit existing spell, change circle to 5º, verify update persists and audit log records change.

### Implementation for User Story 3

- [ ] T031 [P] [US3] Create useSpellForm custom hook in src/features/spells/hooks/useSpellForm.ts (React Hook Form + Zod validation, handles create/edit modes, unsaved changes warning)
- [ ] T032 [US3] Create spell form modal component in src/features/spells/components/spell-form-modal.tsx (mirrors rule-form-modal.tsx, fields: name input, circle selector, school dropdown, attribute grid selector, baseDice selector, extraDicePerLevel selector, TipTap editor for description with mention support, source input, status toggle)
- [ ] T033 [US3] Add "Nova Magia" button to spells page in src/app/(dashboard)/spells/page.tsx (visible only to admins, opens form modal in create mode)
- [ ] T034 [US3] Add edit action to spells table in src/features/spells/components/spells-table.tsx (pencil icon button visible only to admins, opens form modal in edit mode with spell data)
- [ ] T035 [US3] Implement unsaved changes dialog in spell-form-modal.tsx (detect form dirty state, show confirmation "Você tem alterações não salvas. Descartar?" with Cancel/Discard buttons on ESC, click outside, or X button)
- [ ] T036 [US3] Implement error handling in spell-form-modal.tsx (show toast notification with error message on API failure - network, validation, server - keep modal open preserving form data for manual retry)
- [ ] T037 [US3] Verify form validation works client-side (required fields, circle 0-9 range, positive dice quantity, valid dice types) and server-side (duplicate name check, schema validation)

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently - admins can now create and edit spells with full validation

---

## Phase 6: User Story 4 - Deletar Magias com Confirmação (Admin) (Priority: P4)

**Goal**: Admins can delete obsolete or incorrect spells with mandatory confirmation dialog. All deletions are logged in audit system.

**Independent Test**: Login as admin, click delete icon on a test spell, verify confirmation dialog shows spell name, click "Confirm", verify spell disappears from table and success toast appears. Check audit logs page and verify DELETE action recorded with performedBy, timestamp, and previous spell data.

### Implementation for User Story 4

- [ ] T038 [US4] Add delete action to spells table in src/features/spells/components/spells-table.tsx (trash icon button visible only to admins, opens confirmation dialog)
- [ ] T039 [US4] Create delete confirmation dialog component (reusable or inline) showing spell name and "Tem certeza que deseja excluir esta magia?" with Cancel/Confirm buttons
- [ ] T040 [US4] Connect delete mutation from spells-queries.ts to confirmation dialog confirm action, show success toast on completion, refresh table data
- [ ] T041 [US4] Verify delete operation creates audit log entry with action DELETE, entity Spell, entityId, performedBy, and previousData containing full spell object
- [ ] T042 [US4] Verify deleted spell no longer appears in spell list (for admins and users), searches, filters, or mention suggestions

**Checkpoint**: All CRUD operations now functional - create, read, update, delete all working with proper validation, error handling, and audit logging

---

## Phase 7: User Story 5 - Referenciar Magias em Outros Conteúdos (Priority: P5)

**Goal**: Users can mention spells in rich text descriptions (rules, traits, feats) using @Magia syntax. Mentions render as purple badges with preview tooltip on hover.

**Independent Test**: Edit a rule or trait description, type "@Bola" in TipTap editor, verify dropdown suggests "Bola de Fogo" with type "Magia" and circle. Select spell, save content. Verify mention renders as purple badge. Hover badge and verify tooltip shows spell preview (circle, school, dice, description excerpt). Click badge to navigate to spell detail or modal.

### Implementation for User Story 5

- [ ] T043 [P] [US5] Extend mention suggestion system in src/features/rules/lib/suggestion.ts (add "Magia" type with query function that searches spells by name, returns spell._id, name, circle, school)
- [ ] T044 [P] [US5] Extend mention badge component in src/features/rules/components/mention-badge.tsx (add case for type "Magia" with veryRare variant purple color, displays spell name)
- [ ] T045 [P] [US5] Extend mention list dropdown in src/features/rules/components/mention-list.tsx (add "Magia" icon Wand from lucide-react, display circle and school in suggestion item)
- [ ] T046 [US5] Update spell preview component in src/features/spells/components/spell-preview.tsx (ensure it can be triggered from mention badge hover tooltip context)
- [ ] T047 [US5] Verify mention suggestions include active spells only for users, show inactive spells for admins with visual indicator (reduced opacity or "(Inativa)" label)
- [ ] T048 [US5] Verify mention badge click behavior (navigate to /spells or open spell detail modal - follow Rules/Feats pattern for consistency)

**Checkpoint**: Cross-referencing system complete - spells can be mentioned in other content with rich previews and navigation

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements, integrations, and documentation that affect multiple user stories or complete the feature

### Audit Log Integration

- [ ] T049 [P] Extend audit log model in src/features/users/models/audit-log-extended.ts (add "Spell" to entity enum)
- [ ] T050 [P] Update audit log detail modal in src/features/users/components/audit-log-detail-modal.tsx (add label "Magia" for entity type Spell, render spell-specific fields in detail view: name, circle with chip, school with color, base dice, extra dice, save attribute, description excerpt)
- [ ] T051 [P] Update audit logs table in src/features/users/components/audit-logs-table.tsx (add Wand icon for Spell entity, display spell name from entityId, support entity type "Spell" filter)

### Dashboard Integration

- [ ] T052 Replace WIP spells card in dashboard page src/app/(dashboard)/page.tsx (import and render SpellsEntityCard component with stats: total count, count by circle ranges 1-3, 4-6, 7-9, truques count)
- [ ] T053 [P] Create spells entity card component in src/features/spells/components/spells-entity-card.tsx (mirrors rules-entity-card.tsx pattern, shows spell icon, total count, quick stats, navigation to /spells)

### Utility Functions

- [ ] T054 [P] Create spell helper functions in src/features/spells/utils/spell-helpers.ts (formatCircle to convert 0-9 to "Truque", "1º Círculo", etc., formatSchool, formatDiceValue, getSchoolColor, getDiceColor)

### Documentation

- [ ] T055 [P] Create spells feature documentation in aicontext/modules/spells.md (overview, structure, schemas, API endpoints, component usage, common queries, examples)
- [ ] T056 Run update-agent-context script to sync spells information to agent context file (.specify/scripts/powershell/update-agent-context.ps1 -AgentType copilot)

### Quality & Validation

- [ ] T057 Verify all 30 functional requirements from spec.md are implemented (FR-001 through FR-030)
- [ ] T058 Verify all 10 success criteria from spec.md are met (SC-001 through SC-010)
- [ ] T059 Run through quickstart.md validation scenarios to ensure all phases complete successfully
- [ ] T060 Perform accessibility audit on spells pages (keyboard navigation, screen reader labels, color contrast on chips, focus indicators)
- [ ] T061 Test responsive layout on mobile, tablet, desktop breakpoints (table stacking, modal sizing, filter panel collapse)
- [ ] T062 Verify performance targets met (page load <2s, filter response <500ms, search <300ms, preview tooltip <400ms)
- [ ] T063 Test edge cases from spec.md (empty states, truque rendering, null dice values, null save attribute, inactive spells visibility, unsaved changes warning, API error handling with retry)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - User stories CAN proceed in parallel if team capacity allows
  - OR sequentially in priority order: US1 (P1) → US2 (P2) → US3 (P3) → US4 (P4) → US5 (P5)
- **Polish (Phase 8)**: Depends on all desired user stories being complete (minimum US1-US4 for MVP)

### User Story Dependencies

- **User Story 1 (P1) - View & Search**: Can start immediately after Foundational phase - No dependencies on other stories ✅ MVP CORE
- **User Story 2 (P2) - Advanced Filters**: Can start immediately after Foundational phase - Independent of US1 but typically extends it
- **User Story 3 (P3) - Create/Edit**: Can start immediately after Foundational phase - Independent but requires US1 for full user experience
- **User Story 4 (P4) - Delete**: Depends on US3 completion (needs edit flow established for UI pattern consistency)
- **User Story 5 (P5) - Mentions**: Can start after Foundational phase - Independent but benefits from US1 for preview component

### Within Each User Story

**Phase 2 Foundational**:
- T004 (Spell model) MUST complete before T007 (service layer)
- T005-T006 (types, validation) can run parallel with T004
- T007 (service) MUST complete before T008-T009 (API routes)
- T008-T009 (API routes) MUST complete before T010 (TanStack Query hooks)
- T011-T016, T014b (UI components) can all run in parallel, no dependencies
- T017 (colors config) can run parallel with components

**Phase 3 User Story 1**:
- T018-T019 can run in parallel (hooks and preview component)
- T020 (table) depends on T018 and all foundational UI components (T011-T015)
- T021-T022 (page routes) depend on T020 (table component)
- T023 (navigation) can run parallel with T020-T022
- T024 (search verification) requires T021 completion

**Phase 4 User Story 2**:
- T025 extends T018, must wait for T018 completion
- T026 (filters panel) can start after T025, needs foundational UI components
- T027-T028 (page updates) depend on T026 (filters panel)
- T029-T030 (verification) require T027-T028 completion

**Phase 5 User Story 3**:
- T031 (form hook) can run parallel with T032 start
- T032 (form modal) needs T031 and foundational UI components (T011-T016)
- T033-T034 (buttons) depend on T032 completion
- T035-T036 (dialogs and error handling) depend on T032 completion
- T037 (verification) requires all US3 tasks complete

**Phase 6 User Story 4**:
- T038-T039 (delete action and dialog) can run parallel
- T040 (connect mutation) depends on T038-T039
- T041-T042 (verification) require T040 completion

**Phase 7 User Story 5**:
- T043-T045 can all run in parallel (independent files)
- T046 depends on T019 (spell preview component from US1)
- T047-T048 (verification) require T043-T046 completion

**Phase 8 Polish**:
- T049-T051 (audit log) can all run in parallel
- T052-T053 (dashboard) can run in parallel
- T054 (utils) can run parallel with any phase
- T055-T056 (documentation) can run parallel, should be last
- T057-T063 (quality validation) should run sequentially at the very end

### Parallel Opportunities

**Within Foundational Phase (maximum parallelization):**
```
Parallel Group A (no dependencies):
- T004 (model)
- T005 (types)
- T006 (validation)
- T011 (glass-level-chip)
- T012 (glass-attribute-chip)
- T013 (glass-dice-value)
- T014 (glass-dice-selector)
- T014b (glass-empty-value)
- T015 (glass-spell-school)
- T016 (glass-status-toggler)
- T017 (colors config)

Then Sequential:
- T007 (service - needs T004)
- T008, T009 (API routes - need T007)
- T010 (Query hooks - need T008, T009)
```

**User Story Parallelization (if team capacity allows):**
After Foundational phase completes, these can run in parallel:
- **Developer 1**: US1 (T018-T024) - View & Search
- **Developer 2**: US2 (T025-T030) - Filters (will integrate with US1 at end)
- **Developer 3**: US3 (T031-T037) - Create/Edit Forms
- **Developer 4**: US5 (T043-T048) - Mentions (independent of CRUD)

Then Sequential:
- **Developer 3**: US4 (T038-T042) - Delete (after US3 complete)

**Within User Story 1 Example:**
```bash
# Step 1: Parallel foundation prep
git checkout -b feature/us1-view-search
# Developer A: T018 (useSpellFilters hook)
# Developer B: T019 (spell preview component)
# Both can work simultaneously

# Step 2: Table component (waits for both hooks and preview)
# T020 (spells-table.tsx) - needs T018, T019, and foundational components

# Step 3: Parallel page and nav
# Developer A: T021-T022 (page routes)
# Developer B: T023 (navigation item)

# Step 4: Verification
# T024 (search functionality test) - requires T021
```

---

## Implementation Strategy

### MVP First Approach (Recommended)

**Week 1: Foundation + US1 (MVP)**
- Complete Phase 1 (Setup) - 1 day
- Complete Phase 2 (Foundational) - 2 days
- Complete Phase 3 (US1 - View & Search) - 2 days
- **Deliverable**: Users can view and search spells catalog 🎯

**Week 2: Filters + Admin CRUD**
- Complete Phase 4 (US2 - Advanced Filters) - 2 days
- Complete Phase 5 (US3 - Create/Edit) - 2 days
- Complete Phase 6 (US4 - Delete) - 1 day
- **Deliverable**: Full CRUD with advanced filtering 📝

**Week 3: Integration + Polish**
- Complete Phase 7 (US5 - Mentions) - 2 days
- Complete Phase 8 (Polish & Documentation) - 3 days
- **Deliverable**: Complete feature with cross-referencing and documentation ✅

### Incremental Delivery Milestones

1. **Milestone 1 - Read-Only Catalog (US1)**: Users can browse and search spells - Deploy to staging
2. **Milestone 2 - Filtered Catalog (US1 + US2)**: Users can apply advanced filters - Gather user feedback
3. **Milestone 3 - Admin CRUD (US1 + US2 + US3 + US4)**: Admins can manage spell content - Full catalog management
4. **Milestone 4 - Complete Feature (All US)**: Cross-referencing and mentions integrated - Production ready

---

## Task Validation Checklist

Before marking any task complete, verify:

- [ ] Code follows TypeScript strict mode (no `any`, no `@ts-ignore`)
- [ ] Component/file naming follows project conventions (kebab-case files, PascalCase components, camelCase variables)
- [ ] Imports use `@/` alias for absolute paths
- [ ] Error messages are in Portuguese
- [ ] Loading states and empty states implemented
- [ ] Glassmorphism styles applied consistently
- [ ] Framer Motion animations use motionConfig patterns
- [ ] Admin-only UI elements verified with Clerk auth checks
- [ ] API routes validate authentication and authorization
- [ ] Audit logging implemented for CREATE, UPDATE, DELETE
- [ ] Query invalidation configured for TanStack Query mutations
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] Accessibility considered (keyboard nav, ARIA labels, contrast)

---

## Notes

- **Pattern Consistency**: Always reference Rules or Feats features when in doubt about implementation patterns
- **Glassmorphism**: Use `GlassCard`, `GlassModal`, `GlassButton` components from `@/core/ui`
- **Colors**: Leverage `lib/config/colors.ts` for all color definitions, never hardcode hex values
- **Motion**: Import motion configs from `lib/config/motion-configs.ts`, use `motionConfig.variants.*`
- **Forms**: Always use React Hook Form + Zod for validation with Portuguese error messages
- **Queries**: Follow TanStack Query patterns with proper query keys, stale time, and cache invalidation
- **Audit**: Every CUD operation must log to `AuditLogExtended` with try/catch to not block main flow
- **Admin**: Use `useUser()` from Clerk to check `user.publicMetadata.isAdmin` for authorization

---

**Total Tasks**: 64  
**Estimated Effort**: 2-3 weeks (1 full-time developer) or 1-1.5 weeks (2 developers with parallel execution)  
**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (US1) = 25 tasks (can deliver read-only catalog in 1 week)
