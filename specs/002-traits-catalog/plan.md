# Implementation Plan: Cadastro de Habilidades (Traits)

**Branch**: `002-traits-catalog` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-traits-catalog/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a complete CRUD catalog for D&D Traits (Habilidades) following the exact same pattern as the existing Rules catalog. This includes a paginated table with search/filter, a form modal with rich-text editor supporting mentions and images, integration with the audit log system, entity mentions across the app, a dashboard card, and sidebar navigation. The implementation will reuse all existing Glass UI components, hooks patterns, and API structure from the Rules module, ensuring consistency and maintainability.

## Technical Context

**Language/Version**: TypeScript 5.x with strict mode enabled  
**Primary Dependencies**: Next.js 15+ (App Router), React 18+, MongoDB, Mongoose, TanStack Query, React Hook Form, Zod, Clerk, Framer Motion, Tailwind CSS, Shadcn/ui  
**Storage**: MongoDB (Atlas) with Mongoose ODM - new Trait collection following Reference pattern  
**Testing**: Jest + React Testing Library (tests in `__tests__/features/traits/`)  
**Target Platform**: Web application (Next.js server + browser client)
**Project Type**: Web application (Next.js full-stack)  
**Performance Goals**: <2s page load, <500ms search filtering, <1s pagination, <400ms mention tooltip  
**Constraints**: Must reuse existing Rules patterns 100%, maintain Liquid Glass theme consistency, ensure audit trail for all operations  
**Scale/Scope**: Support 1000+ traits without degradation, server-side pagination, real-time search, rich-text descriptions with mentions and images

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **1. TypeScript Estrito e Código Seguro** | ✅ PASS | All code will be TypeScript with strict mode. Types defined in `traits.types.ts`, no `any` or `@ts-ignore`. Following existing patterns from Rules. |
| **2. Core Imutável e Extensão por Features** | ✅ PASS | New feature lives in `src/features/traits/`. New API routes in `src/app/api/traits/`. New database model in `src/core/database/models/trait.ts` (follows existing pattern). No core modifications needed. |
| **3. Separação de Responsabilidades e Hooks** | ✅ PASS | Business logic extracted to custom hooks (`useTraits`, `useTraitMutations`). Components focus on rendering. TanStack Query for server state. Follows Rules pattern exactly. |
| **4. Documentação Viva e Contexto** | ✅ PASS | This spec, plan, and upcoming research/data-model/quickstart provide full context. Will create `aicontext/modules/traits.md` documenting the feature. |
| **5. Qualidade, Testes, Segurança** | ✅ PASS | Form validation with Zod. Error boundaries and empty states. Clerk authentication. Audit logs for all CRUD operations. Tests will be added in `__tests__/features/traits/`. |

**Overall Assessment**: ✅ **ALL GATES PASS** - This feature fully adheres to the constitution. It's a direct replication of the Rules pattern applied to a new domain entity.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── features/
│   └── traits/                        # New feature module (mirrors rules/)
│       ├── components/
│       │   ├── traits-page.tsx        # Main page component
│       │   ├── traits-table.tsx       # Paginated table with edit/delete
│       │   ├── traits-filters.tsx     # Search + status chips
│       │   ├── trait-form-modal.tsx   # Create/Edit modal with rich-text
│       │   ├── delete-trait-dialog.tsx # Confirmation dialog
│       │   ├── entity-description.tsx  # (reuse from rules)
│       │   ├── entity-preview-tooltip.tsx # (reuse from rules)
│       │   ├── mention-badge.tsx      # (reuse from rules)
│       │   ├── mention-list.tsx       # (reuse from rules)
│       │   └── rich-text-editor.tsx   # (reuse from rules)
│       ├── hooks/
│       │   ├── useTraits.ts           # TanStack Query hook for GET
│       │   └── useTraitMutations.ts   # Mutations for CREATE/UPDATE/DELETE
│       ├── api/
│       │   ├── traits-api.ts          # Client-side API functions
│       │   └── validation.ts          # Zod schemas
│       ├── types/
│       │   └── traits.types.ts        # Trait, filters, response types
│       └── utils/
│           └── suggestion.ts          # Mention suggestion config (update to include traits)
├── app/
│   ├── (dashboard)/
│   │   ├── traits/
│   │   │   └── page.tsx               # Next.js route /traits
│   │   ├── _components/
│   │   │   ├── entity-card.tsx        # NEW: Generalized entity card
│   │   │   ├── traits-entity-card.tsx # NEW: Traits dashboard card
│   │   │   └── rules-entity-card.tsx  # REFACTOR: Use entity-card
│   │   └── page.tsx                   # EDIT: Add traits card to dashboard
│   └── api/
│       └── traits/
│           ├── route.ts               # GET /api/traits, POST /api/traits
│           ├── [id]/
│           │   └── route.ts           # GET, PUT, DELETE /api/traits/[id]
│           └── search/
│               └── route.ts           # GET /api/traits/search (for mentions)
├── core/
│   └── database/
│       └── models/
│           └── trait.ts               # NEW: Mongoose Trait model
├── lib/
│   └── config/
│       └── colors.ts                  # EDIT: Add Habilidade to entityColors
└── components/
    └── ui/
        ├── expandable-sidebar.tsx     # EDIT: Add "Habilidades" menu item
        └── (all other Glass UI components reused as-is)

__tests__/
└── features/
    └── traits/
        ├── components/
        │   ├── traits-table.test.tsx
        │   └── trait-form-modal.test.tsx
        └── hooks/
            └── useTraits.test.ts
```

**Structure Decision**: Web application following Next.js App Router conventions. This feature strictly follows the existing Rules (`src/features/rules/`) structure as a template, ensuring architectural consistency. All Glass UI components, core utilities, and auth patterns are reused without modification.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *None* | All constitution principles followed | N/A - this feature reuses existing patterns |

---

## Constitution Check Re-Evaluation (Post-Design)

*After completing Phase 0 (research.md) and Phase 1 (data-model.md, contracts/, quickstart.md), we re-check all principles.*

| Principle | Status | Post-Design Notes |
|-----------|--------|-------------------|
| **1. TypeScript Estrito e Código Seguro** | ✅ PASS | data-model.md defines all types (Trait, CreateTraitInput, UpdateTraitInput, TraitsFilters, TraitsResponse). Zod schemas for validation. OpenAPI contract in contracts/traits.yaml specifies all request/response schemas. No unsafe types introduced. |
| **2. Core Imutável e Extensão por Features** | ✅ PASS | Feature structure confirmed: src/features/traits/ for all business logic. New Mongoose model (src/core/database/models/trait.ts) follows existing Reference pattern. API routes isolated to src/app/api/traits/. Only minimal integration points updated (colors.ts, sidebar, dashboard stats). Core remains untouched. |
| **3. Separação de Responsabilidades e Hooks** | ✅ PASS | Hooks defined: useTraits (TanStack Query GET), useTraitMutations (mutations). API layer (traits-api.ts) separated from components. Components focus on UI (TraitsPage, TraitsTable, TraitsFilters, TraitFormModal). Clear separation maintained. |
| **4. Documentação Viva e Contexto** | ✅ PASS | Complete documentation generated: spec.md (user stories + requirements), plan.md (this file), research.md (10 architectural decisions), data-model.md (schema + types + queries), contracts/traits.yaml (OpenAPI spec), quickstart.md (developer guide), aicontext/modules/traits.md (agent context). All files reference each other. |
| **5. Qualidade, Testes, Segurança** | ✅ PASS | Validation schemas defined (Zod). Clerk authentication enforced on all mutations. Audit logging integrated (CREATE/UPDATE/DELETE actions). Error handling patterns documented. Testing strategy outlined in quickstart.md. Performance considerations documented (pagination, indexes, caching). |

**Post-Design Overall Assessment**: ✅ **ALL GATES STILL PASS**

No deviations from the constitution were introduced during the planning phase. The feature design maintains architectural consistency, type safety, security patterns, and documentation standards. Ready to proceed with implementation.

**Artifacts Generated**:
- ✅ research.md (Phase 0)
- ✅ data-model.md (Phase 1)
- ✅ contracts/traits.yaml (Phase 1)
- ✅ quickstart.md (Phase 1)
- ✅ aicontext/modules/traits.md (Phase 1)

**Next Step**: Run `/speckit.tasks` command to generate tasks.md with detailed implementation breakdown.
