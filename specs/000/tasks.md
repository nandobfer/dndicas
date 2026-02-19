# Tasks: Liquid Glass Core - Design System, Auth & Foundation

**Input**: Design documents from `/specs/000/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Tests are NOT explicitly requested - focusing on implementation tasks only.

**Organization**: Tasks grouped by user story (7 stories: P1×3, P2×2, P3×2) to enable independent implementation.

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US7)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, configuration files, and base structure

- [ ] T001 [P] Create color palette configuration in src/lib/config/colors.ts
- [ ] T002 [P] Create glassmorphism configuration in src/lib/config/glass-config.ts
- [ ] T003 [P] Create Framer Motion variants in src/lib/config/motion-configs.ts
- [ ] T004 [P] Create theme configuration aggregator in src/lib/config/theme-config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core UI components that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 [P] Create GlassCard component in src/components/ui/glass-card.tsx
- [ ] T006 [P] Create GlassModal component in src/components/ui/glass-modal.tsx
- [ ] T007 [P] Create LoadingState component in src/components/ui/loading-state.tsx
- [ ] T008 [P] Create EmptyState component in src/components/ui/empty-state.tsx
- [ ] T009 [P] Create ErrorState component in src/components/ui/error-state.tsx
- [ ] T010 [P] Create ComingSoonPlaceholder component in src/components/ui/coming-soon-placeholder.tsx
- [ ] T011 [P] Create ConfirmDialog component in src/components/ui/confirm-dialog.tsx
- [ ] T012 Create User model with Mongoose schema in src/features/users/models/user.ts
- [ ] T013 Create User types and interfaces in src/features/users/types/user.types.ts
- [ ] T014 Create Zod validation schemas in src/features/users/api/validation.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Navegação no Dashboard com Sidebar Expansível (Priority: P1)

**Goal**: Sidebar expansível à esquerda com animações fluidas e persistência de estado via sessionStorage

**Independent Test**: Navegar pelo dashboard, clicar no botão de menu para expandir/recolher, verificar animações suaves e persistência de estado

### Implementation for User Story 1

- [ ] T015 [US1] Create useSidebar hook with sessionStorage persistence in src/components/ui/hooks/useSidebar.ts
- [ ] T016 [US1] Create ExpandableSidebar component in src/components/ui/expandable-sidebar.tsx
- [ ] T017 [US1] Create SidebarItem component with tooltip support in src/components/ui/sidebar-item.tsx
- [ ] T018 [US1] Create SidebarToggleButton component in src/components/ui/sidebar-toggle-button.tsx
- [ ] T019 [US1] Update dashboard layout wrapper in src/app/(dashboard)/layout.tsx
- [ ] T020 [US1] Update sidebar navigation items - rename "Módulos" to "Cadastros", add "Usuários", remove "Empresas"

**Checkpoint**: US1 complete - sidebar expande/recolhe com animação < 400ms e estado persiste na sessão

---

## Phase 4: User Story 2 - Tema Liquid Glass Imersivo (Priority: P1)

**Goal**: Tema escuro com glassmorphism em todos os overlays, gradientes, bordas com glow e paleta D&D

**Independent Test**: Abrir modais, popovers, dropdowns e verificar efeitos de transparência, blur e cores D&D

### Implementation for User Story 2

- [ ] T021 [P] [US2] Apply Liquid Glass theme to existing Dialog component via wrapper
- [ ] T022 [P] [US2] Apply Liquid Glass theme to existing Popover component via wrapper
- [ ] T023 [P] [US2] Apply Liquid Glass theme to existing DropdownMenu component via wrapper
- [ ] T024 [P] [US2] Apply Liquid Glass theme to existing Sheet component via wrapper
- [ ] T025 [US2] Update global CSS with glass utilities in src/app/globals.css
- [ ] T026 [US2] Create Tooltip with Liquid Glass styling in src/components/ui/glass-tooltip.tsx
- [ ] T027 [US2] Add JSDoc documentation to all configuration files

**Checkpoint**: US2 complete - 100% dos overlays com efeitos Liquid Glass visíveis

---

## Phase 5: User Story 3 - Autenticação e Sincronização de Usuário (Priority: P1)

**Goal**: Sincronização automática de usuários Clerk → MongoDB com role padrão "user"

**Independent Test**: Fazer login com nova conta e verificar registro criado no banco local

### Implementation for User Story 3

- [ ] T028 [US3] Create Clerk webhook handler in src/app/api/webhooks/clerk/route.ts
- [ ] T029 [US3] Create user sync service in src/features/users/api/sync.ts
- [ ] T030 [US3] Update middleware to fallback sync user on request in src/middleware.ts
- [ ] T031 [US3] Create bootstrap-admin CLI script in scripts/bootstrap-admin.ts
- [ ] T032 [US3] Create helper to get current user from DB in src/features/users/api/get-current-user.ts

**Checkpoint**: US3 complete - novos logins criam registro no MongoDB em < 1s

---

## Phase 6: User Story 4 - CRUD de Usuários com Tabela Moderna (Priority: P2)

**Goal**: Interface completa de gerenciamento de usuários com tabela, filtros, busca e modais

**Independent Test**: Acessar /users, aplicar filtros, buscar, criar/editar/deletar usuários

### Implementation for User Story 4

#### UI Components

- [ ] T033 [P] [US4] Create Chip component with D&D rarity variants in src/components/ui/chip.tsx
- [ ] T034 [P] [US4] Create UserChip component with avatar and tooltip in src/components/ui/user-chip.tsx
- [ ] T035 [P] [US4] Create RoleTabs selector (admin=red, user=purple) in src/components/ui/role-tabs.tsx
- [ ] T036 [US4] Create SearchInput with 500ms debounce and progress bar in src/components/ui/search-input.tsx

#### Feature Hooks

- [ ] T037 [US4] Create useUsersFilters hook in src/features/users/hooks/useUsersFilters.ts
- [ ] T038 [US4] Create useUsers hook with TanStack Query in src/features/users/hooks/useUsers.ts

#### Feature Components

- [ ] T039 [US4] Create UserFilters component in src/features/users/components/user-filters.tsx
- [ ] T040 [US4] Create UsersTable component with server-side pagination in src/features/users/components/users-table.tsx
- [ ] T041 [US4] Create UserFormModal component in src/features/users/components/user-form-modal.tsx
- [ ] T042 [US4] Create UserDeleteDialog component in src/features/users/components/user-delete-dialog.tsx

#### API Routes

- [ ] T043 [US4] Create Users API route (GET list, POST create) in src/app/api/users/route.ts
- [ ] T044 [US4] Create User detail API route (GET, PUT, DELETE) in src/app/api/users/[id]/route.ts

#### Page

- [ ] T045 [US4] Create Users page with SSR hydration in src/app/(dashboard)/users/page.tsx

**Checkpoint**: US4 complete - CRUD completo funciona com paginação, filtros e animações

---

## Phase 7: User Story 5 - Registro de Auditoria Automático (Priority: P2)

**Goal**: Logging automático de todas operações CRUD com dados anteriores/novos

**Independent Test**: Criar/editar/deletar usuário e verificar registro de auditoria criado

### Implementation for User Story 5

- [ ] T046 [US5] Extend AuditLog model with previousData/newData in src/features/users/models/audit-log-extended.ts
- [ ] T047 [US5] Create audit types in src/features/users/types/audit.types.ts
- [ ] T048 [US5] Create audit service with logging functions in src/features/users/api/audit-service.ts
- [ ] T049 [US5] Integrate audit logging into Users API create operation
- [ ] T050 [US5] Integrate audit logging into Users API update operation
- [ ] T051 [US5] Integrate audit logging into Users API delete operation

**Checkpoint**: US5 complete - 100% das operações CRUD registradas automaticamente

---

## Phase 8: User Story 6 - Visualização de Logs de Auditoria (Priority: P3)

**Goal**: Tabela de audit logs com chips coloridos por ação e user chips com tooltips

**Independent Test**: Gerar logs via CRUD de usuários e visualizar na tabela

### Implementation for User Story 6

- [ ] T052 [P] [US6] Create ActionChip component (CREATE=green, UPDATE=blue, DELETE=red) in src/components/ui/action-chip.tsx
- [ ] T053 [US6] Create useAuditLogs hook with TanStack Query in src/features/users/hooks/useAuditLogs.ts
- [ ] T054 [US6] Create AuditLogsFilters component in src/features/users/components/audit-logs-filters.tsx
- [ ] T055 [US6] Create AuditLogsTable component with server-side pagination in src/features/users/components/audit-logs-table.tsx
- [ ] T056 [US6] Create Audit Logs API route (GET list) in src/app/api/audit-logs/route.ts
- [ ] T057 [US6] Update Audit Logs page with new components in src/app/(dashboard)/audit-logs/page.tsx

**Checkpoint**: US6 complete - logs visualizáveis com chips coloridos e tooltips

---

## Phase 9: User Story 7 - Visualização de Detalhes de Auditoria com Diff (Priority: P3)

**Goal**: Modal com diff view lado-a-lado mostrando mudanças destacadas

**Independent Test**: Editar usuário e visualizar log com diff das alterações

### Implementation for User Story 7

- [ ] T058 [US7] Create DiffView component in src/components/ui/diff-view.tsx
- [ ] T059 [US7] Create AuditLogDetailModal component in src/features/users/components/audit-log-detail-modal.tsx
- [ ] T060 [US7] Create Audit Log detail API route (GET by id) in src/app/api/audit-logs/[id]/route.ts
- [ ] T061 [US7] Integrate detail modal into AuditLogsTable component

**Checkpoint**: US7 complete - diff view exibe diferenças corretamente (add=verde, remove=vermelho)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T062 [P] Add JSDoc documentation to all UI components in src/components/ui/
- [ ] T063 [P] Add JSDoc documentation to all feature hooks in src/features/users/hooks/
- [ ] T064 Review and standardize error handling across all API routes
- [ ] T065 Validate all components render loading/empty/error states correctly
- [ ] T066 Run quickstart.md validation checklist
- [ ] T067 Performance check: ensure tables load < 2s, sidebar animation < 400ms

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ─────> BLOCKS ALL USER STORIES
    │
    ├──────────────────────────────────────────────────┐
    │                                                  │
    ▼                                                  ▼
Phase 3 (US1: Sidebar)                    Phase 4 (US2: Theme)
    │                                                  │
    └──────────────┬───────────────────────────────────┘
                   │
                   ▼
           Phase 5 (US3: Auth sync)
                   │
                   ▼
           Phase 6 (US4: Users CRUD) ──> Phase 7 (US5: Audit logging)
                   │                              │
                   └──────────────────────────────┤
                                                  │
                                                  ▼
                                    Phase 8 (US6: Audit visualization)
                                                  │
                                                  ▼
                                    Phase 9 (US7: Diff view)
                                                  │
                                                  ▼
                                    Phase 10 (Polish)
```

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|-------|------------|---------------------|
| US1 (Sidebar) | Foundational | US2 |
| US2 (Theme) | Foundational | US1 |
| US3 (Auth) | US1, US2 | - |
| US4 (CRUD) | US3 | - |
| US5 (Audit Log) | US4 | - |
| US6 (Audit View) | US5 | - |
| US7 (Diff) | US6 | - |

### MVP Suggestion

**MVP Scope**: US1 + US2 + US3 + US4 (Phases 1-6)
- Entrega: Dashboard funcional com theme Liquid Glass, autenticação e CRUD de usuários
- Deixa para depois: Sistema de auditoria completo (US5-US7)

### Parallel Opportunities

**Within Phase 1 (Setup)**:
- T001, T002, T003, T004 podem rodar em paralelo

**Within Phase 2 (Foundational)**:
- T005-T011 podem rodar em paralelo
- T012 → T013 → T014 são sequenciais

**Within User Stories**:
- Componentes UI [P] podem rodar em paralelo
- Hooks → Components → Pages são sequenciais
- API routes podem rodar em paralelo com componentes

---

## Parallel Example: Phase 2

```bash
# Parallel batch 1 (all UI components)
T005 glass-card.tsx &
T006 glass-modal.tsx &
T007 loading-state.tsx &
T008 empty-state.tsx &
T009 error-state.tsx &
T010 coming-soon-placeholder.tsx &
T011 confirm-dialog.tsx &
wait

# Sequential batch 2 (data model)
T012 user.ts
T013 user.types.ts
T014 validation.ts
```

---

## Summary

| Phase | Tasks | Parallelizable | Story |
|-------|-------|----------------|-------|
| Setup | 4 | 4 | - |
| Foundational | 10 | 7 | - |
| US1: Sidebar | 6 | 0 | P1 |
| US2: Theme | 7 | 4 | P1 |
| US3: Auth | 5 | 0 | P1 |
| US4: CRUD | 13 | 4 | P2 |
| US5: Audit Log | 6 | 0 | P2 |
| US6: Audit View | 6 | 1 | P3 |
| US7: Diff | 4 | 0 | P3 |
| Polish | 6 | 2 | - |
| **TOTAL** | **67** | **22** | - |

**Task Distribution by Priority**:
- P1 (MVP): 32 tasks (US1 + US2 + US3 + Setup + Foundational)
- P2: 19 tasks (US4 + US5)
- P3: 10 tasks (US6 + US7)
- Polish: 6 tasks
