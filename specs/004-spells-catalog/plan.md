# Implementation Plan: Catálogo de Magias D&D

**Branch**: `004-spells-catalog` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-spells-catalog/spec.md`

**Note**: This plan follows the `/speckit.plan` workflow. See `.specify/templates/plan-template.md` for execution details.

## Summary

Implement a comprehensive D&D Spells catalog with full CRUD operations, advanced filtering, rich text descriptions with mentions, and audit logging. The feature provides spell management for admins and spell consultation for all users, following the exact same architectural patterns, components, and code structure established by the Rules and Feats features. The implementation reuses existing UI components (glassmorphism, Framer Motion animations, D&D rarity colors) and extends the mention system, audit logs, and dashboard navigation. Key technical approach: mirror Rules/Feats structure, extract reusable components (glass-level-chip, glass-attribute-chip, glass-dice-value, glass-spell-school, glass-dice-selector, glass-status-toggler), implement DiceValue as typed object `{quantidade: number, tipo: 'd4'|'d6'|'d8'|'d10'|'d12'|'d20'}`, map 8 spell schools to D&D rarity palette, and integrate with existing systems (Clerk auth, MongoDB, TanStack Query, S3 upload, audit logging, mention suggestions).

## Technical Context

**Language/Version**: TypeScript 5.x with strict mode enabled (Next.js 15+, React 18+, Node.js 20+ LTS)  
**Primary Dependencies**: Next.js 15+ App Router, React 18+, Mongoose (MongoDB), TanStack Query, Clerk (auth), React Hook Form, Zod, Framer Motion, Tailwind CSS, Shadcn/ui, TipTap (rich text)  
**Storage**: MongoDB Atlas with Mongoose ODM; S3 (via existing upload infrastructure) for images in rich text descriptions  
**Testing**: Jest + React Testing Library (structure: `__tests__/features/spells/`)  
**Target Platform**: Web application (Next.js SSR + Client Components), desktop and mobile browsers  
**Project Type**: Web application (frontend + API routes integrated)  
**Performance Goals**: <2s page load, <500ms filter response, <300ms text search, <400ms preview tooltip  
**Constraints**: Reuse existing patterns EXACTLY (Rules/Feats components, structure, code style); maintain glassmorphism + D&D rarity visual consistency; admin-only write operations; real-time search/filter UX  
**Scale/Scope**: ~300-500 D&D spells initially; 10+ filter combinations; 6 dice types (d4-d20); 8 spell schools; 10 spell circles (0-9); rich text with mentions and images; full audit trail

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence / Justification |
|-----------|--------|-------------------------|
| **1. TypeScript Estrito e Código Seguro** | ✅ PASS | All code will be strict TypeScript with explicit types for Spell entity, DiceValue, SpellSchool enum, API schemas (Zod), component props, and hooks. No `any` or `@ts-ignore`. Follows naming conventions (camelCase, PascalCase, kebab-case files). |
| **2. Core Imutável e Extensão por Features** | ✅ PASS | Implementation lives entirely in `src/features/spells/` and `src/app/spells/`. No modifications to `src/core/`. Reuses core components (`@/core/ui`, `@/core/hooks`, `@/core/database`) via imports. Extends audit-log-extended.ts (already in features layer) by adding "Spell" to entity enum. |
| **3. Separação de Responsabilidades e Hooks** | ✅ PASS | Components focus on rendering. Business logic extracted to custom hooks: `useSpells` (data fetching), `useSpellFilters` (filter state), `useSpellForm` (form logic). TanStack Query manages server state with SSR hydration. All hooks co-located in `src/features/spells/hooks/`. UI components like `glass-dice-selector` manage their own local state. |
| **4. Documentação e Contexto** | ✅ PASS | Following spec → plan → tasks workflow. Will create `aicontext/modules/spells.md` documenting structure, schemas, APIs, and examples. Adheres to `aicontext/use-sempre-que-desenvolver.md`, `docs/regras_gerais.md`, and `docs/stack_tecnica.md`. All clarifications captured in spec.md. |
| **5. Qualidade, Testes, Seg., Observabilidade** | ✅ PASS | Will include tests in `__tests__/features/spells/` (components, hooks, API routes). Error handling via toast notifications and form validation (Zod + React Hook Form). Auth via Clerk (admin role-based). Input validation client + server. Audit logging for all CREATE/UPDATE/DELETE. Empty states, loading states, Portuguese error messages. |

**Constitution Gate**: ✅ **APPROVED** - All principles satisfied. No violations. Ready for Phase 0 research.

## Project Structure

### Documentation (this feature)

```text
specs/004-spells-catalog/
├── spec.md              # Feature specification with user stories, requirements, clarifications
├── plan.md              # This file - implementation plan and architecture
├── research.md          # Phase 0: Technology research and pattern decisions
├── data-model.md        # Phase 1: Spell entity schema and relationships
├── quickstart.md        # Phase 1: Developer onboarding guide
├── contracts/           # Phase 1: API contracts (OpenAPI specs)
│   └── spells.yaml      # Spell CRUD endpoints schemas
├── checklists/          # Quality validation checklists
│   └── requirements.md  # Requirements coverage checklist
└── tasks.md             # Phase 2: Implementation tasks (generated by /speckit.tasks)
```

### Source Code (Next.js App Router + Feature-Based Architecture)

```text
src/
├── features/
│   └── spells/                      # NEW - Spell feature module
│       ├── api/
│       │   ├── validation.ts        # Zod schemas for create/update/query
│       │   ├── spells-service.ts    # Business logic and DB operations
│       │   └── spells-queries.ts    # TanStack Query hooks
│       ├── components/
│       │   ├── spells-table.tsx     # Main table (mirrors rules-table.tsx)
│       │   ├── spells-filters.tsx   # Filter panel (mirrors rules-filters.tsx)
│       │   ├── spell-form-modal.tsx # Create/edit modal (mirrors rule-form-modal.tsx)
│       │   ├── spell-preview.tsx    # Preview tooltip content
│       │   └── spells-entity-card.tsx # Dashboard card
│       ├── hooks/
│       │   ├── useSpells.ts         # Data fetching and mutations
│       │   ├── useSpellFilters.ts   # Filter state management
│       │   └── useSpellForm.ts      # Form logic and validation
│       ├── models/
│       │   └── spell.ts             # Mongoose schema and model
│       ├── types/
│       │   └── spells.types.ts      # TypeScript interfaces (Spell, SpellSchool, DiceValue)
│       └── utils/
│           └── spell-helpers.ts     # Helper functions (formatCircle, etc.)
│
├── components/
│   └── ui/                          # EXTRACTED/EXTENDED - Reusable UI components
│       ├── glass-level-chip.tsx     # NEW - Extracted from feats-table (circle/level display)
│       ├── glass-attribute-chip.tsx # NEW - Extracted from feats-table (attribute display)
│       ├── glass-dice-value.tsx     # NEW - Display dice values (1d6, 2d10)
│       ├── glass-dice-selector.tsx  # NEW - Form input for dice selection
│       ├── glass-spell-school.tsx   # NEW - Spell school chip with colors
│       └── glass-status-toggler.tsx # NEW - Extracted status toggle from forms
│
├── app/
│   ├── (dashboard)/
│   │   └── spells/                  # NEW - Spell pages
│   │       ├── page.tsx             # Main spells list page (SSR + hydration)
│       │   └── loading.tsx          # Loading state
│   └── api/
│       └── spells/                  # NEW - API routes
│           ├── route.ts             # GET (list), POST (create)
│           └── [id]/
│               └── route.ts         # GET (one), PUT (update), DELETE
│
├── lib/
│   └── config/
│       └── colors.ts                # EXTENDED - Add spell schools, dice types, veryRare for Magia entity
│
└── __tests__/
    └── features/
        └── spells/                  # NEW - Test suite
            ├── components/
            │   ├── spells-table.test.tsx
            │   ├── spell-form-modal.test.tsx
            │   └── glass-dice-selector.test.tsx
            ├── hooks/
            │   ├── useSpells.test.ts
            │   └── useSpellFilters.test.ts
            └── api/
                └── validation.test.ts

# EXTENDED FILES (modifications to existing files)
src/features/users/models/audit-log-extended.ts  # Add "Spell" to entity enum
src/features/users/components/audit-log-detail-modal.tsx # Add Spell entity type label
src/features/users/components/audit-logs-table.tsx # Add Spell icon and label  
src/features/rules/lib/suggestion.ts             # Add Spell to mention suggestions
src/features/rules/components/mention-badge.tsx  # Add Spell badge rendering
src/features/rules/components/mention-list.tsx   # Add Spell to mention dropdown
src/app/(dashboard)/page.tsx                    # Replace WIP spell card
aicontext/modules/spells.md                     # NEW - Feature documentation
```

**Structure Decision**: Following established Next.js 15 App Router pattern with feature-based architecture. Spells module mirrors Rules/Feats structure exactly (api/, components/, hooks/, models/, types/, utils/). Extracts 6 reusable UI components to `src/components/ui/` to avoid duplication. Extends audit log, mention system, and dashboard card. All new code in `src/features/spells/` and `src/app/spells/`; no core modifications.

## Complexity Tracking

> **No constitution violations** - This section is empty. All principles passed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | N/A | N/A |

---

## Phase 0: Outline & Research

**Objective**: Resolve all NEEDS CLARIFICATION items from Technical Context and research best practices for technologies and patterns used in this feature.

**Status**: ✅ COMPLETE - All clarifications resolved during spec phase; patterns already established in Rules/Feats features.

### Research Tasks Completed

1. **Data Structure for Dice Values** ✅
   - **Question**: How to represent and store dice notation (e.g., "2d6", "1d8")?
   - **Decision**: Typed object `{ quantidade: number, tipo: 'd4'|'d6'|'d8'|'d10'|'d12'|'d20' }`  
   - **Rationale**: Provides type safety, enables efficient queries, allows validation at schema level, easier to render with typed colors
   - **Alternatives Rejected**: String format ("2d6") rejected because no type safety, harder to query, requires parsing for display logic

2. **Color Palette for Spell Schools** ✅
   - **Question**: Which colors to use for 8 D&D spell schools?
   - **Decision**: Map schools to existing D&D rarity palette (common/uncommon/rare/veryRare/legendary/artifact)  
   - **Rationale**: Reuses established color system, maintains visual consistency, no new color definitions needed
   - **Alternatives Rejected**: Custom color palette rejected to avoid design inconsistency; grayscale rejected for lack of visual distinction

3. **Dice Type Visual Differentiation** ✅
   - **Question**: How to visually distinguish 6 dice types (d4-d20)?
   - **Decision**: Gradient by rarity: d4=common(gray), d6=uncommon(green), d8=rare(blue), d10=veryRare(purple), d12=legendary(gold), d20=artifact(red)  
   - **Rationale**: Intuitive progression (smaller dice = common, larger = rarer), leverages existing rarity colors
   - **Alternatives Rejected**: Random colors rejected for lack of semantic meaning; single color rejected for poor UX

4. **Cantrip Filter Behavior** ✅
   - **Question**: Should circle filters auto-include cantrips (circle 0)?
   - **Decision**: Cantrips are separate category; explicit selection required  
   - **Rationale**: Cantrips are mechanically distinct in D&D; users expect precise filtering, not implicit inclusions
   - **Alternatives Rejected**: Auto-include rejected for unexpected behavior; combined "0-1" option rejected for lack of granularity

5. **Source Field Input Type** ✅
   - **Question**: Should source be dropdown or free text?
   - **Decision**: Free text input  
   - **Rationale**: Allows flexibility for official books, homebrew, Unearthed Arcana, page numbers, custom formats
   - **Alternatives Rejected**: Dropdown rejected for maintenance overhead and limiting user creativity

6. **Table Column Order** ✅
   - **Question**: Optimal column sequence for spell table?
   - **Decision**: Status (admin only), Circle, Name, School, Save Attribute, Base Dice, Extra Dice per Level, Actions  
   - **Rationale**: Follows Rules/Feats pattern (status first for admin), prioritizes game-critical data (circle, name, school)
   - **Alternatives Rejected**: Alphabetical rejected for poor UX; description column rejected to avoid clutter (moved to preview)

7. **School Name Display** ✅
   - **Question**: Show full school names or abbreviations in chips?
   - **Decision**: Full names always  
   - **Rationale**: Readability over space; D&D schools are recognizable words, not acronyms
   - **Alternatives Rejected**: Abbreviations ("Evo", "Abj") rejected for poor clarity, especially for new players

8. **Dice Quantity Validation** ✅
   - **Question**: Max dice quantity limit (e.g., prevent "999d20")?
   - **Decision**: No upper limit, only validate positive integers (>0)  
   - **Rationale**: Trusts admin judgment; D&D has legitimate high-level spells with many dice; simpler validation logic
   - **Alternatives Rejected**: Hard limits (5, 20) rejected for potentially blocking legitimate spells; extra complexity not justified

9. **Unsaved Changes Protection** ✅
   - **Question**: Behavior when closing modal with unsaved changes?
   - **Decision**: Show confirmation dialog: "Você tem alterações não salvas. Descartar?" with Cancel/Discard buttons  
   - **Rationale**: Prevents accidental data loss; standard UX pattern; matches user expectations
   - **Alternatives Rejected**: Immediate close rejected for data loss risk; auto-save rejected for added complexity and potential unwanted drafts

10. **API Error Handling** ✅
    - **Question**: How to inform users of API failures?
    - **Decision**: Toast notification only; user retries manually; modal stays open preserving form data  
    - **Rationale**: Simple, consistent with rest of app; preserves user work; clear feedback
    - **Alternatives Rejected**: Retry button in toast rejected for added UI complexity; inline errors rejected for redundancy with toast

### Technology Stack Research

All technologies already established in codebase:

- **Next.js 15 App Router**: SSR, Server Components, API Routes → Use existing patterns from Rules/Feats  
- **Mongoose + MongoDB**: Schema definition, validation, indexes → Mirror Rules/Feats model structure  
- **TanStack Query**: Server state, caching, optimistic updates → Reuse query hooks pattern  
- **React Hook Form + Zod**: Form state, validation → Copy validation pattern from rule-form-modal  
- **Framer Motion**: Table animations, modal transitions → Apply existing motionConfig  
- **Glassmorphism + Tailwind**: Visual style → Extend existing components  
- **Clerk Auth**: Role-based access → Use existing `useAuth` hook  
- **TipTap**: Rich text with mentions → Reuse rich-text-editor component  
- **S3 Upload**: Image handling → Use existing upload infrastructure  

**No new dependencies required** - 100% reuse of existing stack.

### Best Practices & Patterns

Based on existing codebase analysis:

1. **Component Extraction**: Rules/Feats have repeated patterns (level chips, attribute chips, status toggle) → Extract to reusable components in `@/components/ui/`
2. **Hook-Based Logic**: All business logic in custom hooks (`useSpells`, `useSpellFilters`, `useSpellForm`) → Components remain pure render functions
3. **Server-Side Rendering**: Initial data fetch on server → Hydrate with TanStack Query → Client handles interactions
4. **Audit Logging Pattern**: Create audit entry after successful DB operation → Include performedBy, previousData, newData → Already implemented for Rules/Traits/Feats
5. **Mention System Extension**: Add entity to `suggestion.ts` → Update badge rendering → Update dropdown list → Pattern established
6. **Form Validation**: Zod schema on server → React Hook Form on client → Same validators → DRY principle
7. **Empty State Handling**: Conditional rendering with semantic placeholders ("Nenhum", "—", italic gray text) → Consistent UX
8. **Animation Pattern**: Apply `motionConfig.variants.tableRow` to table rows → Staggered delays → Consistent feel

---

## Phase 1: Design & Contracts

**Objective**: Generate data model, API contracts, and developer quickstart guide. Update agent context.

**Status**: ✅ COMPLETE - All artifacts generated.

### Artifacts Generated

1. **Data Model** ✅ ([data-model.md](./data-model.md))
   - Mongoose schema for Spell entity with DiceValue embedded documents
   - TypeScript interfaces and types (Spell, DiceValue, SpellSchool, AttributeType)
   - Zod validation schemas (createSpellSchema, updateSpellSchema, spellsQuerySchema)
   - Database indexes for query optimization (8 indexes total)
   - Relationships documented (Audit Log, Mentions, Dashboard aggregation)
   - Validation rules and business logic constraints
   - Query patterns for common operations

2. **API Contracts** ✅ ([contracts/spells.yaml](./contracts/spells.yaml))
   - OpenAPI 3.0.3 specification for Spell CRUD endpoints
   - GET /api/spells - List with filters, search, pagination
   - POST /api/spells - Create (admin only)
   - GET /api/spells/[id] - Retrieve single spell
   - PUT /api/spells/[id] - Update (admin only)
   - DELETE /api/spells/[id] - Delete (admin only)
   - Request/response schemas with examples
   - Authentication (Clerk JWT) and error responses documented

3. **Quickstart Guide** ✅ ([quickstart.md](./quickstart.md))
   - Development setup instructions
   - Implementation order (5 phases, 25 steps)
   - Code examples (service functions, components, API routes)
   - Common patterns (SSR + hydration, filter state, form protection)
   - Testing strategy and examples
   - Troubleshooting section
   - Performance optimization tips

### Agent Context Update

Agent-specific context files updated to include Spells feature:
- Added spells module to technology stack awareness
- Documented data model, API patterns, and component structure
- Preserved existing manual additions (per constitution requirements)

### Post-Design Constitution Check

Re-evaluating constitution compliance after design phase:

| Principle | Status | Post-Design Evidence |
|-----------|--------|---------------------|
| **1. TypeScript Estrito** | ✅ PASS | Data model defines strict types (ISpell, DiceValue interfaces), Zod schemas enforce validation, no any types in contracts |
| **2. Core Imutável** | ✅ PASS | All new code in features/spells/, no core modifications in design, extends audit-log-extended.ts (features layer) |
| **3. Hooks e Separação** | ✅ PASS | Quickstart documents hook-based architecture (useSpells, useSpellFilters, useSpellForm), service layer separate from UI |
| **4. Documentação** | ✅ PASS | Comprehensive documentation artifacts generated (research.md, data-model.md, contracts/spells.yaml, quickstart.md) |
| **5. Qualidade** | ✅ PASS | Testing strategy documented in quickstart, validation schemas defined, error handling patterns established |

**Post-Design Gate**: ✅ **APPROVED** - Design maintains constitution compliance. Ready for implementation.

---

## Phase 2: Task Breakdown

**Objective**: Generate structured task list organized by user story with dependencies and acceptance criteria.

**Status**: ⏳ PENDING - Generated separately by `/speckit.tasks` command.

**Output**: `specs/004-spells-catalog/tasks.md`

**Note**: This plan includes only Phase 0 (Research) and Phase 1 (Design & Contracts). Task breakdown (Phase 2) is generated by a separate command to allow for task management workflows.

---

## Implementation Workflow

### Development Flow

1. **Pre-Implementation**
   - ✅ Spec reviewed and approved
   - ✅ Plan generated (this document)
   - ✅ Constitution check passed
   - ✅ Research complete
   - ✅ Data model and contracts defined
   - ⏭️ Generate tasks: Run `/speckit.tasks` command

2. **Implementation** (follow quickstart.md)
   - Phase 1: Data Layer (backend) - Models, validation, services, API routes
   - Phase 2: UI Foundation (extracted components) - Reusable components in @/components/ui/
   - Phase 3: Spells Feature (frontend) - Hooks, filters, table, form, preview
   - Phase 4: Integration - Audit log, mentions, colors, dashboard, navigation
   - Phase 5: Documentation - aicontext/modules/spells.md, agent context update

3. **Testing**
   - Unit tests: Validation schemas, service functions, hooks
   - Component tests: Tables, forms, filters with user interactions
   - Integration tests: API routes with mocked auth/DB
   - Manual testing: End-to-end flows (create, filter, edit, delete, mentions)

4. **Review & Merge**
   - Run linter: `npm run lint`
   - Run type check: `npm run type-check`
   - Run tests: `npm test`
   - Update CHANGELOG (if applicable)
   - Create PR with reference to spec.md and plan.md
   - Request code review (check constitution compliance)
   - Merge to main branch

### Key Milestones

| Milestone | Description | Completion Criteria |
|-----------|-------------|---------------------|
| **M1: Backend Foundation** | Data layer complete | Spell model + API routes working, tests passing |
| **M2: UI Components** | Reusable components extracted | 6 glass-* components built and tested |
| **M3: Spells Feature** | Core feature functional | List, filter, CRUD all working in UI |
| **M4: System Integration** | Connected to existing systems | Audit logs, mentions, dashboard updated |
| **M5: Documentation & Polish** | Production-ready | Tests pass, docs complete, no TypeScript errors |

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Component extraction breaks existing features** | High | Low | Gradual extraction with thorough testing; Rules/Feats remain unchanged until spells tested |
| **Performance degradation with complex filters** | Medium | Low | Indexes on all filter fields; pagination enforced; tested with 500+ spells |
| **Audit log overhead affects write performance** | Low | Low | Async audit write (don't block main op); tested with load testing script |
| **Mention system extension conflicts** | Medium | Low | Follow established pattern from Traits/Feats extension; isolated changes |
| **Text search relevance issues** | Medium | Medium | MongoDB text index with score sorting; fallback to name-only search if needed |

### Non-Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Scope creep** (additional fields/features) | Medium | Medium | Stick to spec.md requirements; defer enhancements to future iterations |
| **Timeline pressure** (rushing implementation) | High | Low | Follow quickstart phased approach; skip optional features if needed |
| **Knowledge gaps** (unfamiliar with Next.js patterns) | Medium | Low | Quickstart includes examples; reference Rules/Feats code; ask for review |

---

## Success Criteria

Feature is considered complete when:

- [ ] All 30 functional requirements (FR-001 to FR-030) from spec.md are implemented
- [ ] All 10 success criteria (SC-001 to SC-010) from spec.md are validated
- [ ] Constitution Check passes post-implementation
- [ ] All tests (unit, component, integration) pass with >80% coverage for new code
- [ ] TypeScript compiles with zero errors (strict mode)
- [ ] ESLint passes with zero errors
- [ ] Manual testing validates all 5 user stories (P1-P5) work end-to-end
- [ ] Audit logs correctly capture all CREATE/UPDATE/DELETE operations
- [ ] Mention system shows spells in suggestions and preview tooltips work
- [ ] Dashboard card displays spell statistics
- [ ] Navigation menu includes "Magias" link below "Talentos"
- [ ] Documentation (aicontext/modules/spells.md) is complete and accurate

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building the D&D Spells Catalog feature. The plan follows the project's constitution, reuses established patterns from Rules and Feats features, and maintains architectural consistency.

**Key Highlights**:
- **Zero new dependencies** - 100% stack reuse
- **Constitution compliant** - All 5 principles satisfied
- **Pattern consistency** - Exact mirroring of Rules/Feats structure
- **Component extraction** - 6 reusable UI components to reduce duplication
- **Comprehensive documentation** - Research, data model, API contracts, quickstart guide
- **Clear milestones** - 5-phase implementation with checkpoints

**Next Steps**:
1. Generate task breakdown: Run `/speckit.tasks` command
2. Begin Phase 1 implementation (data layer): Follow [quickstart.md](./quickstart.md)
3. Update progress in tasks.md as work completes
4. Create PR with reference to [spec.md](./spec.md) and this plan

**Branch**: `004-spells-catalog`  
**Documentation**: `specs/004-spells-catalog/`  
**Estimated Effort**: 3-5 days for experienced developer following quickstart

---

**Plan Status**: ✅ COMPLETE (Phases 0 & 1)  
**Next Command**: `/speckit.tasks` (to generate Phase 2 task breakdown)
