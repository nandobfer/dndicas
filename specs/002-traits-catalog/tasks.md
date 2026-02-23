# Tasks: Cadastro de Habilidades (Traits)

**Feature**: 002-traits-catalog  
**Input**: Design documents from `/specs/002-traits-catalog/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/traits.yaml

**Tests**: Not included - feature specification does not request TDD approach

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create feature directory structure at src/features/traits/ with subfolders: components/, hooks/, api/, types/, utils/
- [ ] T002 [P] Create __tests__/features/traits/ directory structure with subfolders: components/, hooks/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Create Mongoose Trait model in src/core/database/models/trait.ts with schema (name, description, source, status, timestamps) and indexes (text on name/description, regular on status, unique on name)
- [ ] T004 [P] Create TypeScript types in src/features/traits/types/traits.types.ts (Trait, CreateTraitInput, UpdateTraitInput, TraitsFilters, TraitsResponse)
- [ ] T005 [P] Create Zod validation schemas in src/features/traits/api/validation.ts (createTraitSchema, updateTraitSchema)
- [ ] T006 [P] Create client-side API functions in src/features/traits/api/traits-api.ts (fetchTraits, createTrait, updateTrait, deleteTrait, fetchTraitById, searchTraitsForMentions)
- [ ] T007 Create TanStack Query hook useTraits in src/features/traits/hooks/useTraits.ts with query keys factory (traitKeys.all, traitKeys.list, traitKeys.detail)
- [ ] T008 Create TanStack Query mutations hook useTraitMutations in src/features/traits/hooks/useTraitMutations.ts (create, update, remove mutations with cache invalidation)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Visualizar Catálogo de Habilidades (Priority: P1) 🎯 MVP

**Goal**: Display paginated, searchable, filterable list of traits with status, name, description, source, and actions columns

**Independent Test**: Navigate to /traits, verify table displays traits with pagination, search by name/description, filter by status (active/inactive/all), verify empty state when no results

### Implementation for User Story 1

- [ ] T009 [P] [US1] Create GET /api/traits route in src/app/api/traits/route.ts with query params (page, limit, search, searchField, status), pagination logic, text search using MongoDB text index, and status filtering
- [ ] T010 [P] [US1] Create TraitsFilters component in src/features/traits/components/traits-filters.tsx with SearchInput for name/description search and StatusChips for active/inactive/all filtering
- [ ] T011 [P] [US1] Create TraitsTable component in src/features/traits/components/traits-table.tsx with columns (Status badge, Nome, Descrição truncated, Fonte, Prever checkbox, Ações dropdown), sortable headers, and DataTablePagination integration
- [ ] T012 [US1] Create TraitsPage orchestrator component in src/features/traits/components/traits-page.tsx integrating useTraits hook, TraitsFilters, TraitsTable, pagination state, loading/error/empty states, and page header with "Nova Habilidade" button
- [ ] T013 [US1] Add TraitsPage export to src/features/traits/index.ts for clean imports
- [ ] T014 [US1] Verify GET /api/traits endpoint returns correct pagination metadata (total, page, limit, totalPages) and filters work correctly

**Checkpoint**: At this point, User Story 1 should be fully functional - users can view, search, and filter traits

---

## Phase 4: User Story 2 - Criar Nova Habilidade (Priority: P2)

**Goal**: Enable creating new traits with name, source, status, and rich-text description supporting mentions and images

**Independent Test**: Click "Nova Habilidade" button, fill form (name, source, description with formatting), save, verify trait appears in table and success message displays

### Implementation for User Story 2

- [ ] T015 [P] [US2] Create POST /api/traits route in src/app/api/traits/route.ts with Clerk authentication check, Zod validation, Mongoose create operation, and createAuditLog call for CREATE action
- [ ] T016 [US2] Create TraitFormModal component in src/features/traits/components/trait-form-modal.tsx with React Hook Form, Zod resolver, fields (Nome text input, Fonte text input, Status switch, Descrição RichTextEditor), create mode logic, and submission handler calling useTraitMutations.create
- [ ] T017 [US2] Integrate TraitFormModal into TraitsPage component with modal state management, open modal on "Nova Habilidade" button click, and close modal on successful save
- [ ] T018 [US2] Reuse existing RichTextEditor component from src/core/ui/rich-text-editor/ for Descrição field with TipTap extensions (mentions, images, formatting)
- [ ] T019 [US2] Add form validation error messages display in TraitFormModal for required fields (Nome, Fonte) and field constraints
- [ ] T020 [US2] Add success toast notification after trait creation and automatic table refresh via TanStack Query cache invalidation

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - users can view and create traits

---

## Phase 5: User Story 3 - Editar Habilidade Existente (Priority: P3)

**Goal**: Enable editing existing traits through same form modal, pre-filled with current data

**Independent Test**: Click edit icon on a trait in table, verify modal opens pre-filled, modify fields, save, verify changes appear in table

### Implementation for User Story 3

- [ ] T021 [P] [US3] Create GET /api/traits/[id] route in src/app/api/traits/[id]/route.ts to fetch single trait by ID with error handling for not found
- [ ] T022 [P] [US3] Create PUT /api/traits/[id] route in src/app/api/traits/[id]/route.ts with Clerk authentication check, Zod validation, Mongoose update operation, and createAuditLog call for UPDATE action with changes diff
- [ ] T023 [US3] Add edit mode logic to TraitFormModal component detecting editingTrait prop, pre-filling form with useEffect when editingTrait changes, and submission handler calling useTraitMutations.update
- [ ] T024 [US3] Add edit action to TraitsTable dropdown menu (pencil icon) triggering setEditingTrait in TraitsPage and opening modal
- [ ] T025 [US3] Add success toast notification after trait update and automatic table refresh via TanStack Query cache invalidation

**Checkpoint**: All CRUD operations except delete are now functional - users can view, create, and edit traits

---

## Phase 6: User Story 4 - Excluir Habilidade (Priority: P4)

**Goal**: Enable deleting traits with confirmation dialog to prevent accidental deletions

**Independent Test**: Click delete icon on a trait, verify confirmation dialog appears with trait name, confirm deletion, verify trait disappears from table

### Implementation for User Story 4

- [ ] T026 [P] [US4] Create DELETE /api/traits/[id] route in src/app/api/traits/[id]/route.ts with Clerk authentication check, Mongoose delete operation, and createAuditLog call for DELETE action
- [ ] T027 [US4] Create DeleteTraitDialog component in src/features/traits/components/delete-trait-dialog.tsx with confirmation message including trait name, Cancel and Confirm buttons, and submission handler calling useTraitMutations.remove
- [ ] T028 [US4] Add delete action to TraitsTable dropdown menu (trash icon) triggering setDeletingTrait in TraitsPage and opening DeleteTraitDialog
- [ ] T029 [US4] Add success toast notification after trait deletion and automatic table refresh via TanStack Query cache invalidation
- [ ] T030 [US4] Handle mentions to deleted traits by keeping mention visible with "broken" styling (if referenced entity not found during render)

**Checkpoint**: Full CRUD functionality complete - users can view, create, edit, and delete traits

---

## Phase 7: User Story 5 - Navegar para Habilidades e Visualizar Card no Dashboard (Priority: P5)

**Goal**: Enable navigation to traits catalog via sidebar menu and display traits statistics on dashboard card

**Independent Test**: Click "Habilidades" in sidebar (Cadastros section), verify navigation to /traits. On dashboard (/), verify Habilidades card shows total and active traits count

### Implementation for User Story 5

- [ ] T031 [P] [US5] Create Next.js route at src/app/(dashboard)/traits/page.tsx importing and rendering TraitsPage component with metadata (title: "Catálogo de Habilidades | D&Dicas", description)
- [ ] T032 [P] [US5] Add "Habilidades" menu item to cadastrosItems array in src/components/ui/expandable-sidebar.tsx with label "Habilidades", href "/traits", icon Sparkles (from lucide-react)
- [ ] T033 [P] [US5] Create generalized EntityCard component in src/app/(dashboard)/_components/entity-card.tsx extracting layout pattern from RulesEntityCard with props (title, description, icon, config from entityColors, stats, loading, index)
- [ ] T034 [US5] Refactor RulesEntityCard component in src/app/(dashboard)/_components/rules-entity-card.tsx to use new EntityCard component passing config={entityColors.Regra}
- [ ] T035 [US5] Create TraitsEntityCard component in src/app/(dashboard)/_components/traits-entity-card.tsx using EntityCard with config={entityColors.Habilidade}, icon={Sparkles}, fetching traits stats from useQuery
- [ ] T036 [US5] Update dashboard page in src/app/(dashboard)/page.tsx adding Traits card to dndEntities array replacing WipEntityCard with { id: "traits", title: "Habilidades", component: TraitsEntityCard }
- [ ] T037 [US5] Update dashboard stats API in src/app/api/dashboard/stats/route.ts adding traits query (countDocuments for total, countDocuments with status: 'active' for active, aggregate for last 30 days growth)

**Checkpoint**: Users can now discover and navigate to traits via sidebar and dashboard, with live statistics displayed

---

## Phase 8: User Story 6 - Mencionar Habilidades em Outras Entidades (Priority: P6)

**Goal**: Enable traits to be mentioned in rich-text descriptions of other entities using @ syntax, rendered as gray badges with tooltips

**Independent Test**: Open any entity editor with rich-text, type "@Fúria", verify traits appear in mention dropdown, select one, verify it renders as gray badge with tooltip showing trait preview

### Implementation for User Story 6

- [ ] T038 [P] [US6] Create GET /api/traits/search route in src/app/api/traits/search/route.ts accepting query parameter 'q' (search term), limiting results to 10, returning array with id, name, entityType: "Habilidade", source
- [ ] T039 [P] [US6] Add "Habilidade" entry to entityColors object in src/lib/config/colors.ts with color: 'gray', mention: "bg-gray-500/10 text-gray-300 border-gray-400/20", badge: "bg-gray-400/20 text-gray-300", border: "border-gray-500/20", hex: rarityColors.common (#9CA3AF)
- [ ] T040 [US6] Update suggestion.ts fetch logic in src/features/traits/utils/suggestion.ts (or shared utils location) to fetch from both /api/rules and /api/traits/search, merge results, tag each with entityType, and limit to 10 total results
- [ ] T041 [US6] Verify existing MentionBadge component in src/core/ui/rich-text-editor/mention-badge.tsx correctly renders Habilidade mentions with gray color from entityColors
- [ ] T042 [US6] Verify existing EntityPreviewTooltip component in src/core/ui/rich-text-editor/entity-preview-tooltip.tsx correctly fetches and displays trait preview on hover (name, source, description truncated)

**Checkpoint**: Mentions system now supports traits - users can reference traits in any rich-text description across the app

---

## Phase 9: User Story 7 - Visualizar Habilidades nos Logs de Auditoria (Priority: P7)

**Goal**: Display all trait operations (CREATE/UPDATE/DELETE) in audit logs page with filterable entity type "Habilidade"

**Independent Test**: Create/edit/delete a trait, navigate to /audit-logs, verify logs appear with entity "Habilidade" and correct action, apply entity filter for "Habilidade", verify only trait logs display

### Implementation for User Story 7

- [ ] T043 [P] [US7] Verify createAuditLog integration in POST /api/traits route (T015) logging action: 'CREATE', entity: 'Trait', performedBy from Clerk auth, entityName, entityId
- [ ] T044 [P] [US7] Verify createAuditLog integration in PUT /api/traits/[id] route (T022) logging action: 'UPDATE', entity: 'Trait', performedBy, entityName, entityId, changes diff (before/after values)
- [ ] T045 [P] [US7] Verify createAuditLog integration in DELETE /api/traits/[id] route (T026) logging action: 'DELETE', entity: 'Trait', performedBy, entityName, entityId
- [ ] T046 [US7] Update formatEntityType function in src/features/users/components/audit-logs-table.tsx adding mapping "Trait": "Habilidade" to display localized entity name
- [ ] T047 [US7] Update EntityMultiSelect options in src/features/users/components/audit-logs-filters.tsx adding "Habilidade" option to entity type filter dropdown

**Checkpoint**: Audit trail complete - all trait operations are logged and filterable in audit logs page

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and finalization

- [ ] T048 [P] Update aicontext/modules/traits.md documentation with final implementation notes, component tree, API endpoints, usage examples
- [ ] T049 [P] Add loading skeletons to TraitsTable during pagination/search operations for better UX
- [ ] T050 [P] Add error boundaries to TraitsPage component catching and displaying API errors gracefully
- [ ] T051 [P] Verify empty states in TraitsTable when no traits exist with "Nenhuma habilidade encontrada" message and "Criar primeira habilidade" CTA button
- [ ] T052 [P] Add Framer Motion animations to table rows on mount/unmount and modal open/close transitions
- [ ] T053 [P] Verify responsive design of TraitsTable on mobile/tablet breakpoints with horizontal scroll for table
- [ ] T054 Code cleanup: Remove unused imports, ensure consistent formatting with ESLint/Prettier, add JSDoc comments to complex functions
- [ ] T055 Run type-check (npm run type-check) and fix any TypeScript errors across all new files
- [ ] T056 Run linter (npm run lint) and fix any linting warnings/errors across all new files
- [ ] T057 Validate implementation against quickstart.md checklist ensuring all phases completed
- [ ] T058 [P] Write unit tests for useTraits hook in __tests__/features/traits/hooks/useTraits.test.ts mocking fetch and asserting query key structure
- [ ] T059 [P] Write component tests for TraitsTable in __tests__/features/traits/components/traits-table.test.tsx asserting columns render, pagination works, actions trigger correctly
- [ ] T060 [P] Write component tests for TraitFormModal in __tests__/features/traits/components/trait-form-modal.test.tsx asserting form validation, submission, create/edit modes
- [ ] T061 Manual E2E validation following quickstart.md Phase 6 testing checklist (create, search, filter, edit, delete, mentions, audit logs, dashboard)
- [ ] T062 Final review: Verify all 7 user stories acceptance criteria from spec.md are satisfied and success criteria (SC-001 to SC-010) targets are met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - User stories CAN proceed in parallel (if staffed) since each is independently testable
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5 → P6 → P7)
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates with US1 (reuses TraitsPage) but US1 can exist without US2
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Reuses TraitFormModal from US2 but extends it for edit mode
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Independent delete functionality
- **User Story 5 (P5)**: Can start after US1 is complete (needs TraitsPage to exist for routing)
- **User Story 6 (P6)**: Can start after Foundational (Phase 2) - Independent mentions integration
- **User Story 7 (P7)**: Can start after US2, US3, US4 are complete (needs mutation endpoints to have audit logs) - but audit log calls can be added retroactively

**Critical Path**: Setup → Foundational → US1 → US5 (because routing depends on US1's TraitsPage)

**Recommended Sequence**: 
1. Setup (Phase 1)
2. Foundational (Phase 2) - CRITICAL blocker
3. US1 (Phase 3) - MVP core feature
4. US2 (Phase 4) - Create functionality
5. US3 (Phase 5) - Edit functionality
6. US4 (Phase 6) - Delete functionality
7. US5 (Phase 7) - Navigation integration
8. US6 (Phase 8) - Mentions integration
9. US7 (Phase 9) - Audit integration
10. Polish (Phase 10) - Finalization

### Within Each User Story

- API routes before components (components depend on endpoints)
- Simple components before complex orchestrators (e.g., TraitsTable before TraitsPage)
- Core implementation before integration (e.g., EntityCard before TraitsEntityCard)
- Mutations before audit logs (can add audit logs retroactively to existing endpoints)

### Parallel Opportunities

**Phase 1 - Setup**: Both directory creation tasks can run in parallel

**Phase 2 - Foundational**: Tasks T004, T005, T006 can ALL run in parallel (different files, no dependencies)

**Phase 3 - US1**: Tasks T009, T010, T011 can run in parallel (different files), then T012 integrates them

**Phase 4 - US2**: Task T015 (API) can run parallel with T016 (form modal) initially, but T016 needs T015 complete for testing

**Phase 5 - US3**: Tasks T021, T022 (API routes) can run in parallel

**Phase 6 - US4**: Tasks T026, T027 can run in parallel

**Phase 7 - US5**: Tasks T031, T032, T033 can run in parallel, then T034/T035 depend on T033, then T036/T037

**Phase 8 - US6**: Tasks T038, T039, T040 can run in parallel, then T041/T042 verify

**Phase 9 - US7**: Tasks T043, T044, T045 can run in parallel (verification tasks), then T046/T047

**Phase 10 - Polish**: Tasks T048-T053, T055-T056, T058-T060 can ALL run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all parallel tasks for User Story 1 together:
# Terminal 1:
Task T009: "Create GET /api/traits route in src/app/api/traits/route.ts"

# Terminal 2:
Task T010: "Create TraitsFilters component in src/features/traits/components/traits-filters.tsx"

# Terminal 3:
Task T011: "Create TraitsTable component in src/features/traits/components/traits-table.tsx"

# After T009, T010, T011 complete:
Task T012: "Create TraitsPage orchestrator component in src/features/traits/components/traits-page.tsx"

# All crew members work simultaneously on different files, no conflicts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (< 5 minutes)
2. Complete Phase 2: Foundational (~2-3 hours) - CRITICAL blocker
3. Complete Phase 3: User Story 1 (~3-4 hours)
4. **STOP and VALIDATE**: 
   - Navigate to /traits
   - Verify table displays traits with pagination
   - Test search by name/description
   - Test status filters (active/inactive/all)
   - Verify empty state when no traits exist
5. **Result**: Working traits catalog viewer (read-only) - can deploy/demo

**Total MVP Time**: ~5-7 hours

### Incremental Delivery (Recommended)

1. Complete Setup + Foundational → Foundation ready (~2-3 hours)
2. Add User Story 1 → Test independently → Deploy/Demo (~3-4 hours) - **MVP: Read-only catalog**
3. Add User Story 2 → Test independently → Deploy/Demo (~2-3 hours) - **Can now create traits**
4. Add User Story 3 → Test independently → Deploy/Demo (~2 hours) - **Can now edit traits**
5. Add User Story 4 → Test independently → Deploy/Demo (~1 hour) - **Full CRUD complete**
6. Add User Story 5 → Test independently → Deploy/Demo (~2-3 hours) - **Integrated into app navigation**
7. Add User Story 6 → Test independently → Deploy/Demo (~2-3 hours) - **Mentions working**
8. Add User Story 7 → Test independently → Deploy/Demo (~1 hour) - **Audit trail complete**
9. Polish (Phase 10) → Final validation → Deploy/Demo (~2-3 hours)

**Total Implementation Time**: ~18-24 hours (following quickstart.md guidance of 8-12 hours assumes parallel work and experienced developer)

Each story adds value without breaking previous stories - can stop at any checkpoint for a working feature subset.

### Parallel Team Strategy

With 2-3 developers:

1. **Team completes Setup + Foundational together** (pair programming recommended) → ~2-3 hours
2. Once Foundational is done, split work:
   - **Developer A**: User Stories 1, 2 (read + create)
   - **Developer B**: User Stories 3, 4 (edit + delete)
   - **Developer C**: User Stories 5, 6, 7 (navigation + mentions + audit)
3. Stories complete in parallel, integrate independently, validate together
4. All developers collaborate on Polish phase

**Team Implementation Time**: ~8-12 hours (parallel execution)

---

## Risk Mitigation

### High Priority Risks

1. **Mentions Integration Complexity**
   - **Risk**: Existing mention system may not cleanly support new entity type
   - **Mitigation**: Review existing mention implementation in Rules early (T040-T042), test in isolation
   - **Contingency**: If blocked, defer US6 and deliver traits without mentions initially

2. **Audit Log Service Dependency**
   - **Risk**: createAuditLog service signature/behavior may have changed
   - **Mitigation**: Review existing audit log calls in Rules mutations (T043-T045 are verification tasks)
   - **Contingency**: If service unavailable, use console.log placeholder and add audit logs in Phase 10

3. **MongoDB Text Index Performance**
   - **Risk**: Text search may be slow on large datasets
   - **Mitigation**: Implement pagination server-side (T009), limit results, test with 1000+ seed records
   - **Contingency**: Add debounce to search input, increase cache staleTime, add loading spinner

### Medium Priority Risks

4. **EntityCard Refactoring Impact**
   - **Risk**: Extracting EntityCard may break existing RulesEntityCard
   - **Mitigation**: Create EntityCard first (T033), test with Rules before creating Traits card (T034-T035)
   - **Contingency**: If refactor risky, skip generalization and duplicate RulesEntityCard as TraitsEntityCard

5. **Rich-Text Editor Image Upload**
   - **Risk**: Image upload storage/endpoint may not exist or may need new implementation
   - **Mitigation**: Test existing RichTextEditor image functionality early in US2
   - **Contingency**: If broken, disable image upload for traits initially (edit TipTap extensions)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Constitution check passed - all principles followed (TypeScript strict, core immutable, hooks separation, documentation, quality)
- Exact pattern reuse from Rules module ensures consistency and reduced risk
- No tests requested in spec.md - test tasks (T058-T060) are OPTIONAL, deprioritize if time-constrained
- Commit after each task or logical group for easy rollback
- Stop at any checkpoint to validate story independently before proceeding
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Performance targets from spec.md: <2s page load, <500ms search, <1s pagination, <400ms tooltips, support 1000+ traits
