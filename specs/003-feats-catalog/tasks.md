# Tasks: Catálogo de Talentos (Feats)

**Input**: Design documents from `/specs/003-feats-catalog/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/feats.yaml

**Tests**: Tests are OPTIONAL for this feature (not explicitly requested in spec).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app structure: `src/features/feats/`, `src/app/api/feats/`, `src/app/(dashboard)/feats/`
- Integrations: `src/lib/config/`, `src/features/rules/`, `src/features/users/`, `src/components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for Feats feature

- [X] T001 Create feature directory structure in src/features/feats/ with subdirectories: api/, components/, hooks/, models/, types/
- [X] T002 [P] Create main page route for feats catalog in src/app/(dashboard)/feats/page.tsx (empty scaffold)
- [X] T003 [P] Create API routes directory structure in src/app/api/feats/ with [id]/ subdirectory

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create Feat Mongoose model in src/features/feats/models/feat.ts with schema: name, description, source, level, prerequisites, status, timestamps, and indexes
- [X] T005 [P] Create TypeScript types in src/features/feats/types/feats.types.ts: Feat, CreateFeatInput, UpdateFeatInput, FeatsFilters, FeatsResponse, FeatSearchResult
- [X] T006 [P] Create Zod validation schemas in src/features/feats/api/validation.ts: createFeatSchema, updateFeatSchema with full validation rules
- [X] T007 Create entity colors configuration for Talento in src/lib/config/colors.ts with amber/orange theme (mention, badge, border, text styles)
- [X] T008 Add Feats entry to sidebar in src/components/sidebar/expandable-sidebar.tsx with Zap icon, label "Talentos", route "/feats"

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Visualizar Lista de Talentos (Priority: P1) 🎯 MVP

**Goal**: Enable users to view paginated list of feats with basic information (name, level, prerequisites, source, status)

**Independent Test**: Access `/feats` route, verify table loads with data, pagination works, level chips display correct colors

### API for User Story 1

- [X] T009 [US1] Implement GET /api/feats route in src/app/api/feats/route.ts with pagination, filters (page, limit, search, status, level, levelMax), return FeatsResponse
- [X] T010 [US1] Implement GET /api/feats/[id] route in src/app/api/feats/[id]/route.ts to fetch single feat by ID with error handling

### Client-Side API for User Story 1

- [X] T011 [P] [US1] Create client API wrapper in src/features/feats/api/feats-api.ts with fetchFeats() and fetchFeat(id) functions

### Hooks for User Story 1

- [X] T012 [US1] Create useFeats hook in src/features/feats/hooks/useFeats.ts using TanStack Query with filters support and caching

### Components for User Story 1

- [X] T013 [P] [US1] Create FeatsTable component in src/features/feats/components/feats-table.tsx with columns: Status, Name, Level (colored chip), Prerequisites (compact list), Description (truncated), Source, Preview icon, Actions (edit/delete buttons)
- [X] T014 [P] [US1] Create FeatsFilters component in src/features/feats/components/feats-filters.tsx with SearchInput, StatusChips, and level filter (exact/upto toggle)
- [X] T015 [US1] Implement main FeatsPage in src/app/(dashboard)/feats/page.tsx orchestrating FeatsTable and FeatsFilters with state management
- [X] T016 [US1] Add level-to-rarity color mapping helper function in src/features/feats/components/feats-table.tsx (levels 1-3=common, 4-8=uncommon, 9-13=rare, 14-17=veryRare, 18-19=legendary, 20=artifact)

**Checkpoint**: At this point, User Story 1 should be fully functional - users can browse feats catalog

---

## Phase 4: User Story 2 - Criar Novo Talento (Priority: P2)

**Goal**: Enable administrators to create new feats with all fields (name, source, description, level, prerequisites)

**Independent Test**: Click "Novo Talento" button, fill form, submit, verify feat appears in table and audit log created

### API for User Story 2

- [X] T017 [US2] Implement POST /api/feats route in src/app/api/feats/route.ts with Clerk authentication, Zod validation, uniqueness check, audit log creation, return 201 with created feat

### Hooks for User Story 2

- [X] T018 [US2] Create useFeatMutations hook in src/features/feats/hooks/useFeatMutations.ts with createFeat mutation, invalidating queries ['feats'], ['audit-logs'], ['dashboard-stats']

### Components for User Story 2

- [X] T019 [US2] Create FeatFormModal component in src/features/feats/components/feat-form-modal.tsx with fields: name (GlassInput), source (GlassInput), status (GlassSwitch), level (GlassInput numeric min=1 max=20 default=1), description (RichTextEditor with mentions and S3 upload)
- [X] T020 [US2] Implement dynamic prerequisites list in FeatFormModal with add/remove buttons, RichTextEditor for each item, validation for non-empty strings, Framer Motion animations
- [X] T021 [US2] Add "Novo Talento" button to FeatsPage in src/app/(dashboard)/feats/page.tsx that opens FeatFormModal in create mode
- [X] T022 [US2] Integrate createFeat mutation in FeatsPage with form submission, success/error toasts, modal close, and list refresh

**Checkpoint**: At this point, User Stories 1 AND 2 both work - users can browse and admins can add feats

---

## Phase 5: User Story 3 - Editar Talento Existente (Priority: P3)

**Goal**: Enable administrators to update existing feats, modifying any field

**Independent Test**: Click edit button on a feat, modify fields, save, verify changes persist and appear in table

### API for User Story 3

- [X] T023 [US3] Implement PUT /api/feats/[id] route in src/app/api/feats/[id]/route.ts with Clerk authentication, partial update support, Zod validation, audit log with previousData and newData, return 200 with updated feat

### Hooks for User Story 3

- [X] T024 [US3] Add updateFeat mutation to useFeatMutations hook in src/features/feats/hooks/useFeatMutations.ts with cache invalidation

### Components for User Story 3

- [X] T025 [US3] Modify FeatFormModal in src/features/feats/components/feat-form-modal.tsx to support edit mode, pre-filling fields with existing feat data, preserving description formatting
- [X] T026 [US3] Add edit action handlers to FeatsTable in src/features/feats/components/feats-table.tsx that open FeatFormModal in edit mode with selected feat

**Checkpoint**: At this point, User Stories 1, 2, AND 3 work - full CRUD except delete

---

## Phase 6: User Story 4 - Deletar Talento (Priority: P4)

**Goal**: Enable administrators to delete feats with confirmation dialog

**Independent Test**: Click delete button, confirm in modal, verify feat removed from list and audit log created

### API for User Story 4

- [X] T027 [US4] Implement DELETE /api/feats/[id] route in src/app/api/feats/[id]/route.ts with Clerk authentication, audit log with previousData, return 200 with success message

### Hooks for User Story 4

- [X] T028 [US4] Add deleteFeat mutation to useFeatMutations hook in src/features/feats/hooks/useFeatMutations.ts with cache invalidation

### Components for User Story 4

- [X] T029 [US4] Add delete confirmation modal to FeatsTable in src/features/feats/components/feats-table.tsx showing feat name and Cancel/Delete buttons
- [X] T030 [US4] Integrate deleteFeat mutation in FeatsTable with confirmation flow, success/error toasts, and list refresh

**Checkpoint**: At this point, full CRUD operations work for feats catalog

---

## Phase 7: User Story 5 - Filtrar Talentos por Nível (Priority: P5)

**Goal**: Enable users to filter feats by level (exact match or range up to max level)

**Independent Test**: Apply level filter in exact mode, verify only matching feats shown; apply "up to" mode, verify range works

### API Enhancement for User Story 5

- [X] T031 [US5] Enhance GET /api/feats route in src/app/api/feats/route.ts to handle level (exact) and levelMax (range) query params with MongoDB queries

### Components for User Story 5

- [X] T032 [US5] Add level filter UI to FeatsFilters in src/features/feats/components/feats-filters.tsx with dropdown (1-20), mode toggle (Exact/Up to), send correct query params
- [X] T033 [US5] Update useFeats hook in src/features/feats/hooks/useFeats.ts to accept level and levelMax filter params

**Checkpoint**: Level filtering fully functional alongside existing filters

---

## Phase 8: User Story 6 - Buscar Talentos por Texto (Priority: P6)

**Goal**: Enable users to search feats by name, description, or source with debounced input

**Independent Test**: Type text in search field, verify results filter in real-time

### API Enhancement for User Story 6

- [X] T034 [US6] Enhance GET /api/feats route in src/app/api/feats/route.ts to support search and searchField params with MongoDB text index queries

### Components for User Story 6

- [X] T035 [US6] Verify SearchInput in FeatsFilters in src/features/feats/components/feats-filters.tsx has 300ms debounce and triggers useFeats with search param

**Checkpoint**: Text search works and combines with other filters

---

## Phase 9: User Story 7 - Mencionar Talentos em Descrições (Priority: P7)

**Goal**: Enable users to mention feats using @ in rich text editors, creating clickable badges with preview tooltips

**Independent Test**: Type @ in any RichTextEditor, verify feats appear in suggestions with amber badges, select one, verify badge renders with hover preview

### API for User Story 7

- [X] T036 [US7] Create GET /api/feats/search route in src/app/api/feats/search/route.ts for mention system, returning active feats only with id, label (name), entityType: "Talento", limit 10

### Integration for User Story 7

- [X] T037 [P] [US7] Register "Talento" provider in ENTITY_PROVIDERS in src/features/rules/utils/suggestion.ts with endpoint /api/feats/search
- [X] T038 [P] [US7] Update mention-list component in src/features/rules/components/mention-list.tsx to display feats with amber badge and "Talento" label
- [X] T039 [P] [US7] Update mention-badge component in src/features/rules/components/mention-badge.tsx to render feat mentions with amber styling
- [X] T040 [US7] Create FeatPreview component in src/features/feats/components/feat-preview.tsx displaying: name, level (chip), prerequisites (formatted list with level first), description (MentionContent block mode), source, status
- [X] T041 [US7] Add FeatPreview to entity-preview-tooltip in src/features/rules/components/entity-preview-tooltip.tsx for entityType "Talento"

**Checkpoint**: Feat mentions fully integrated across all rich text editors

---

## Phase 10: User Story 8 - Monitorar Dashboard com Estatísticas de Talentos (Priority: P8)

**Goal**: Display feats statistics card on dashboard showing total, active count, and growth graph

**Independent Test**: Access dashboard, verify Feats card displays correct metrics, click card redirects to /feats

### API for User Story 8

- [X] T042 [US8] Add feats statistics to GET /api/dashboard/stats route in src/app/api/dashboard/stats/route.ts with total count, active count, growth array (last 30 days)

### Components for User Story 8

- [X] T043 [US8] Create FeatsEntityCard component in src/features/feats/components/feats-entity-card.tsx using EntityCard generic with entityType "Talento", amber border, Zap icon
- [X] T044 [US8] Add FeatsEntityCard to dashboard in src/app/(dashboard)/page.tsx replacing placeholder WIP card, with click handler redirecting to /feats

**Checkpoint**: Dashboard card functional and displaying live stats

---

## Phase 11: User Story 9 - Auditar Operações em Talentos (Priority: P9)

**Goal**: Display audit logs for all feat CRUD operations with entity filter support

**Independent Test**: Create/edit/delete a feat, navigate to audit logs page, filter by "Talento", verify logs appear with correct details

### Integration for User Story 9

- [X] T045 [P] [US9] Update entityLabels mapping in src/features/users/components/audit-logs-table.tsx to map "Feat" to "Talento" label and Zap icon
- [X] T046 [P] [US9] Add "Talento" option to entity filter in src/features/users/components/entity-multiselect.tsx with Zap icon and amber color
- [X] T047 [US9] Verify GET /api/audit-logs route in src/app/api/audit-logs/route.ts accepts entityType=Feat or entityType=Talento filter

**Checkpoint**: Audit logs fully functional for feats with proper filtering and display

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T048 [P] Add EmptyState, LoadingState, ErrorState components to FeatsTable in src/features/feats/components/feats-table.tsx with proper messages and retry handlers
- [X] T049 [P] Add form validation error display in FeatFormModal in src/features/feats/components/feat-form-modal.tsx using GlassInput error prop and visual alerts
- [X] T050 Add Framer Motion animations to FeatsTable rows in src/features/feats/components/feats-table.tsx using motionConfig variants
- [X] T051 [P] Implement toast notifications for all mutations (create, update, delete) in FeatsPage in src/app/(dashboard)/feats/page.tsx with success/error messages
- [X] T052 Add form reset logic to FeatFormModal in src/features/feats/components/feat-form-modal.tsx on open/close and mode changes using useEffect
- [X] T053 [P] Verify prerequisites rendering in FeatsTable in src/features/feats/components/feats-table.tsx displays compactly without breaking row height
- [X] T054 Create AI context documentation in aicontext/modules/feats.md documenting module structure, patterns, and integration points
- [X] T055 Run quickstart.md validation following steps in specs/003-feats-catalog/quickstart.md to verify all developer tasks work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phase 3-11)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9)
- **Polish (Phase 12)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - **No dependencies on other stories**
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses US1 components (FeatsPage) but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Reuses US2 form component but independently testable
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Independently testable
- **User Story 5 (P5)**: Can start after Foundational (Phase 2) - Enhances US1 but independently testable
- **User Story 6 (P6)**: Can start after Foundational (Phase 2) - Enhances US1 but independently testable
- **User Story 7 (P7)**: Can start after Foundational (Phase 2) - **No dependencies on other stories** (integrates with existing mention system)
- **User Story 8 (P8)**: Can start after Foundational (Phase 2) - **No dependencies on other stories** (standalone dashboard card)
- **User Story 9 (P9)**: Requires any CRUD operation (US2/3/4) to generate logs, but audit infrastructure is independently testable

### Within Each User Story

- API routes before client-side hooks
- Hooks before components that use them
- Base components before integration components
- Story complete before moving to next priority

### Parallel Opportunities

**Within Setup (Phase 1)**:
- T002 (page route) and T003 (API structure) can run in parallel

**Within Foundational (Phase 2)**:
- T005 (types), T006 (validation), T007 (colors), T008 (sidebar) can all run in parallel after T004 (model)

**Within User Story 1**:
- T011 (client API) can run in parallel with T009/T010 (API routes)
- T013 (table) and T014 (filters) can run in parallel after T012 (hooks)

**Within User Story 2**:
- T019 (form modal) and T020 (prerequisites) can be developed in parallel

**Within User Story 7**:
- T037, T038, T039 (mention integrations) can run in parallel after T036 (search API)

**Within User Story 9**:
- T045 and T046 (audit UI updates) can run in parallel

**Within Polish (Phase 12)**:
- T048, T049, T051, T053, T054 can all run in parallel

**Across User Stories** (after Foundational complete):
- US1, US7, US8, US9 are completely independent and can run in parallel
- US2, US3, US4 share form component but can run in parallel with coordination
- US5, US6 enhance US1 but can develop independently

---

## Parallel Example: User Story 1 (MVP)

```bash
# After Foundational phase completes:

# Step 1: Build API layer (sequential)
Task: T009 - "Implement GET /api/feats route"
Task: T010 - "Implement GET /api/feats/[id] route"

# Step 2: Build client API (can run with Step 1)
Task: T011 - "Create client API wrapper" [P]

# Step 3: Build hooks (after API ready)
Task: T012 - "Create useFeats hook"

# Step 4: Build components (parallel after hooks)
Task: T013 - "Create FeatsTable component" [P]
Task: T014 - "Create FeatsFilters component" [P]

# Step 5: Integration (after components ready)
Task: T015 - "Implement main FeatsPage"
Task: T016 - "Add level-to-rarity color mapping"

# Result: US1 complete and testable
```

---

## Parallel Example: Full Feature (All User Stories)

```bash
# After Foundational (Phase 2) completes, launch in parallel:

# Developer A: MVP (US1) - Highest priority
Phase 3: Tasks T009-T016

# Developer B: Mentions Integration (US7) - No dependencies
Phase 9: Tasks T036-T041

# Developer C: Dashboard (US8) - No dependencies
Phase 10: Tasks T042-T044

# Developer D: Create/Edit/Delete (US2, US3, US4) - Sequential but isolated
Phase 4: Tasks T017-T022
Phase 5: Tasks T023-T026
Phase 6: Tasks T027-T030

# Developer E: Filters (US5, US6) - Enhances US1
Phase 7: Tasks T031-T033
Phase 8: Tasks T034-T035

# Developer F: Audit Logs (US9) - Needs CRUD operations
Phase 11: Tasks T045-T047 (waits for US2/3/4)

# All developers converge for Polish (Phase 12)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008) - **CRITICAL GATE**
3. Complete Phase 3: User Story 1 (T009-T016)
4. **STOP and VALIDATE**: Test `/feats` page independently
5. Deploy/demo if ready - **Users can browse feats catalog**

**Estimated effort**: ~8-12 hours for experienced developer

### Incremental Delivery Strategy

1. **Sprint 1**: Setup + Foundational + US1 (T001-T016) → **MVP Deployed**
2. **Sprint 2**: US2 + US3 + US4 (T017-T030) → **Full CRUD Deployed**
3. **Sprint 3**: US5 + US6 (T031-T035) → **Enhanced Search Deployed**
4. **Sprint 4**: US7 + US8 + US9 (T036-T047) → **Full Integration Deployed**
5. **Sprint 5**: Polish (T048-T055) → **Production Ready**

Each sprint delivers working increment that adds value without breaking previous features.

### Parallel Team Strategy (4-6 developers)

**Week 1**: All hands on Foundational (Phase 2)
- T004-T008 completed together
- **Checkpoint**: Foundation ready

**Week 2**: Parallel user stories
- Dev Team A: US1 (MVP) → Highest priority
- Dev Team B: US7 (Mentions) → Independent
- Dev Team C: US8 + US9 (Dashboard + Audit) → Independent
- **Checkpoint**: 3 independent features ready

**Week 3**: CRUD operations + Filters
- Dev Team A: US2 + US3 + US4 (Create/Edit/Delete)
- Dev Team B: US5 + US6 (Filters)
- Dev Team C: Integration testing
- **Checkpoint**: Full feature set complete

**Week 4**: Polish and production hardening
- All teams: Phase 12 tasks in parallel
- Code review, testing, documentation
- **Checkpoint**: Production deployment

---

## Task Count Summary

- **Setup**: 3 tasks
- **Foundational**: 5 tasks (BLOCKS all stories)
- **User Story 1 (P1)**: 8 tasks - MVP
- **User Story 2 (P2)**: 6 tasks
- **User Story 3 (P3)**: 3 tasks
- **User Story 4 (P4)**: 4 tasks
- **User Story 5 (P5)**: 3 tasks
- **User Story 6 (P6)**: 2 tasks
- **User Story 7 (P7)**: 6 tasks
- **User Story 8 (P8)**: 3 tasks
- **User Story 9 (P9)**: 3 tasks
- **Polish**: 8 tasks

**Total**: 55 tasks

**Parallelizable tasks**: 20 tasks marked with [P]
**MVP tasks** (Setup + Foundational + US1): 16 tasks
**Full feature tasks**: 55 tasks

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Each task includes exact file path for clarity
- Feats follows Rules/Traits patterns → minimal architectural risk
- All components reuse existing Glass design system
- TanStack Query patterns identical to Rules/Traits
- Audit log pattern identical to Rules/Traits

---

## Risk Mitigation per Task

| Task | Risk | Mitigation |
|------|------|------------|
| T004 | Mongoose schema validation edge cases | Follow Reference model pattern exactly, test with seed data |
| T009 | Complex query performance with filters | Use MongoDB indexes (defined in T004), test with 10k documents |
| T019 | Form complexity with dynamic prerequisites | Extract prerequisites as separate component, use field array pattern |
| T036 | Mention search performance | Limit to 10 results, index on name field, query only active feats |
| T042 | Dashboard stats aggregation slow | Cache results for 5 minutes, compute growth offline if needed |

---

**Feature Status**: ✅ Ready for implementation
**Estimated Total Effort**: 80-120 developer hours (experienced team)
**Minimum Viable Product (MVP)**: Tasks T001-T016 (Setup + Foundational + US1)
**MVP Effort**: 8-12 hours
