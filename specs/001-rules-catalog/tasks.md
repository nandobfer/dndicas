# Tasks: Regras (Reference Catalog)

**Spec**: `specs/001-rules-catalog/spec.md`
**Branch**: `001-rules-catalog`
**Status**: Generated

## Phase 1: Setup
Initialization of the feature module and dependencies.

- [ ] T001 Install Tiptap dependencies (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image` etc)
- [ ] T002 Create feature directory structure in `src/features/rules/`
- [ ] T003 Define TypeScript interfaces in `src/features/rules/types/rules.types.ts`
- [ ] T004 [P] Create generic Upload API route in `src/app/api/upload/route.ts` using `s3.ts`

## Phase 2: Foundational (Backend & Core)
Blocking backend implementation required for UI development.

- [ ] T005 [P] Implement `Reference` Mongoose model in `src/core/database/models/reference.ts` (or features folder if preferred, but usually models are shared)
- [ ] T006 [P] Create API Route `GET /api/rules` (List & Search) in `src/app/api/rules/route.ts`
- [ ] T007 [P] Create API Route `POST /api/rules` (Create) with Generic Validation in `src/app/api/rules/route.ts`
- [ ] T008 [P] Create API Route `GET/PUT/DELETE /api/rules/[id]` in `src/app/api/rules/[id]/route.ts`
- [ ] T009 Ensure `AuditLogExtended` handles `Reference` entity (verify `src/features/users/models/audit-log-extended.ts` discrimination)

## Phase 3: User Story P1 (Gerenciamento de Regras - CRUD)
**Goal**: Administrator can create, read, update, and delete rules with rich text support.

- [ ] T010 [US1] Create `useRules` and `useRuleMutations` hooks in `src/features/rules/hooks/`
- [ ] T011 [US1] Implement `RichTextEditor` component with Tiptap in `src/features/rules/components/rich-text-editor.tsx`
- [ ] T012 [US1] Add Image Upload extension to `RichTextEditor` handling paste events
- [ ] T013 [US1] Implement `RuleFormModal` using `GlassModal` and `RichTextEditor` in `src/features/rules/components/rule-form-modal.tsx`
- [ ] T014 [US1] Implement `RulesTable` component mimicking `users-table.tsx` in `src/features/rules/components/rules-table.tsx`
- [ ] T015 [US1] Assemble `RulesPage` container in `src/features/rules/components/rules-page.tsx`
- [ ] T016 [US1] Create page entry point `src/app/(dashboard)/rules/page.tsx`
- [ ] T017 [US1] Implement Delete confirmation dialog `DeleteRuleDialog`

## Phase 4: User Story P2 (Busca e Filtragem)
**Goal**: Efficiently find rules among many entries.

- [ ] T018 [P] [US2] Implement `RulesFilters` component (Search + Status Toggle) in `src/features/rules/components/rules-filters.tsx`
- [ ] T019 [US2] Integrate Search/Filter state with `useRules` hook (Debounce logic)
- [ ] T020 [US2] Verify and optimize API Search performance (indexes on `name` and `description`)

## Phase 5: User Story P3 (Dashboard Integration)
**Goal**: Visualize rule repository growth and remove WIP placeholder.

- [ ] T021 [P] [US3] Create generic `StatsCard` component in `src/components/ui/stats-card.tsx` (refactoring from `dashboard/page.tsx`)
- [ ] T022 [US3] Implement `RulesStats` component fetching real counts in `src/features/rules/components/stats-card.tsx`
- [ ] T023 [US3] Update `src/app/(dashboard)/page.tsx` to replace WIP Rules card with `RulesStats`
- [ ] T024 [US3] Ensure Audit Logs for Rules appear in the main Audit Log table (Integration Check)

## Phase 6: Polish & Cross-Cutting
Final reviews and aesthetic adjustments.

- [ ] T025 Review Rich Text Editor styling matches "Glass" aesthetic (custom Tiptap toolbar)
- [ ] T026 Verify responsive layout for Mobile devices
- [ ] T027 Check strict mode compliance and `npm run lint` pass

## Dependencies

- **US2** depends on **US1** (needs data to filter).
- **US3** depends on **US1** (needs data to visualize).
- **Backend Tasks (Phase 2)** block **Frontend Tasks (Phase 3)**.

## Parallel Execution Examples

- **Backend**: T006, T007, T008 can be built while **Frontend** builds the UI skeleton (T014, T015).
- **Editor**: T011 and T012 (Editor logic) can be built independently of the main page logic.

## Implementation Strategy

1. **Backend First**: Secure the foundational API and Data Models.
2. **Editor Core**: Build the Tiptap wrapper early as it's the complex UI piece.
3. **CRUD Assembly**: Stitch the page together using the hooks and components.
4. **Dashboard**: Finish with the high-level integration.
