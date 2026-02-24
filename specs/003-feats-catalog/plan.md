# Implementation Plan: Catálogo de Talentos (Feats)

**Branch**: `003-feats-catalog` | **Date**: 2026-02-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-feats-catalog/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implementar catálogo completo de Talentos (Feats) de D&D 5e no sistema D&Dicas, permitindo operações CRUD em talentos com campos nome, descrição rica (HTML com menções e imagens), fonte, nível (1-20) e pré-requisitos (array de strings com suporte a menções). O sistema deve incluir interface de usuário (tabela paginada, filtros por nível/status/busca, formulário com editor rico), integração total com o sistema de menções, logs de auditoria automáticos, e card de dashboard com estatísticas. A implementação deve seguir rigorosamente os padrões já estabelecidos no catálogo de Regras (Rules) e Habilidades (Traits), reutilizando componentes Glass existentes, hooks do TanStack Query, e padrões de API/Mongoose.

**Decisões Técnicas da Clarificação**:
- **Nível**: Representa nível mínimo do personagem (1-20) para escolher o talento
- **Pré-requisitos**: Array de strings com suporte a menções (@) para linkar outros conteúdos
- **Integração UI**: Sidebar + Dashboard + Sistema de menções
- **Formulário**: Lista dinâmica de campos de texto com botão "+" para adicionar pré-requisitos
- **Exclusão**: Soft delete (mesmo padrão dos Traits)

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) com Next.js 15+ App Router, React 18+, Node.js 20+ LTS  
**Primary Dependencies**: Next.js, React, TanStack Query, Mongoose, Zod, React Hook Form, Tiptap (rich text editor), Framer Motion, Clerk (auth), Tailwind CSS, Shadcn/ui  
**Storage**: MongoDB Atlas com Mongoose ODM (collection: `feats`)  
**Testing**: Jest + React Testing Library (padrão do projeto, estrutura em `__tests__/`)  
**Target Platform**: Web application (Server-Side Rendering + Client interactions)  
**Project Type**: Web (frontend: Next.js App Router, backend: Next.js API Routes)  
**Performance Goals**: Listagem de até 10.000 talentos em <2s, operações CRUD em <500ms, busca/filtros em <300ms (debounce), preview tooltip em <400ms, dashboard stats em <1s  
**Constraints**: Seguir 100% os padrões de "Rules" (Reference model) e "Traits" para garantir consistência arquitetural; manter Core (`src/core/`) imutável; tipagem estrita sem `any` ou `@ts-ignore`; suporte a imagens S3 na descrição; logs de auditoria obrigatórios  
**Scale/Scope**: Área de Features (1 módulo novo: `src/features/feats/`), ~15 arquivos novos (model, API routes, types, hooks, components), integração com 8+ pontos existentes (sidebar, dashboard, mention system, audit logs, colors config)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence/Justification |
|-----------|--------|------------------------|
| **1. TypeScript Estrito e Código Seguro** | ✅ PASS | Todos os arquivos da feature serão TypeScript strict. Tipos explícitos para Feat entity, API inputs/outputs, component props. Schemas Zod para validação. Zero uso de `any` ou `@ts-ignore`. |
| **2. Core Imutável e Extensão por Features** | ✅ PASS | Nenhuma modificação em `src/core/`. Toda lógica em `src/features/feats/` e `src/app/(dashboard)/feats/`. Reutilização de componentes Glass, hooks e utilities do core via composição. Modelo Mongoose em `src/features/feats/models/`. |
| **3. Separação de Responsabilidades e Hooks de Negócio** | ✅ PASS | Componentes focados em UI. Lógica de dados em custom hooks (`useFeats`, `useFeatMutations`) com TanStack Query. Validação com Zod. API routes em `src/app/api/feats/`. Estrutura orientada a features: `components/`, `hooks/`, `types/`, `api/`, `models/`. |
| **4. Desenvolvimento Orientado a Contexto e Documentação Viva** | ✅ PASS | Esta feature possui `spec.md` e `plan.md` completos. Documentação será atualizada em `aicontext/modules/feats.md`. Seguindo padrões de `docs/regras_gerais.md` e `docs/stack_tecnica.md`. |
| **5. Qualidade, Testes, Segurança e Observabilidade** | ✅ PASS | Testes em `__tests__/features/feats/`. Validação Zod no cliente e servidor. Autenticação via Clerk (401 em POST/PUT/DELETE). Soft delete para integridade de menções. Logs de auditoria obrigatórios. Error handling com try-catch e estados de UI (loading, error, empty). |

**Gate Decision**: ✅ **APPROVED** - Nenhuma violação da constituição. Feature segue 100% os princípios estabelecidos.

### Post-Design Re-Evaluation (After Phase 1)

**Date**: 2026-02-24  
**Status**: ✅ **STILL COMPLIANT**

| Principle | Status | Design Impact Assessment |
|-----------|--------|--------------------------|
| **1. TypeScript Estrito** | ✅ PASS | Data model, API contracts e components todos tipados. Zod schemas garantem validação em runtime. Zero uso de `any`. |
| **2. Core Imutável** | ✅ PASS | Design confirma: nenhuma modificação em `src/core/`. Todo código em `src/features/feats/` e integrações pontuais preservam arquitetura. |
| **3. Separação de Responsabilidades** | ✅ PASS | Arquitetura confirm: hooks (`useFeats`, `useFeatMutations`) isolam lógica de negócio, componentes apenas renderizam, API routes em camada separada. |
| **4. Documentação Viva** | ✅ PASS | Phase 1 gerou: `data-model.md`, `contracts/feats.yaml`, `quickstart.md`. Agent context atualizado automaticamente. Padrões documentados em research.md. |
| **5. Qualidade e Segurança** | ✅ PASS | Validação Zod no cliente e servidor confirmada. Autenticação Clerk em todas as rotas de escrita. Audit logs em todas as operações CRUD. Testes planejados em `__tests__/features/feats/`. |

**Design Changes from Initial Plan**: None. Design segue 100% o plano original.

**New Risks Identified**: None. Todos os riscos mapeados em research.md permanecem válidos e mitigados.

**Final Gate Decision**: ✅ **PROCEED TO PHASE 2** (Tasks creation via `/speckit.tasks`)

## Project Structure

### Documentation (this feature)

```text
specs/003-feats-catalog/
├── spec.md              # Feature specification (user stories, requirements)
├── plan.md              # This file (technical plan and constitution check)
├── research.md          # Phase 0 output (technology decisions and patterns)
├── data-model.md        # Phase 1 output (Feat entity schema and relationships)
├── quickstart.md        # Phase 1 output (developer onboarding guide)
├── contracts/           # Phase 1 output (API contracts OpenAPI specs)
│   └── feats.yaml       # Feats CRUD endpoints specification
├── checklists/
│   └── requirements.md  # Quality validation checklist (already exists)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root - Web Application)

```text
src/
├── features/
│   └── feats/                    # NEW: Feats feature module
│       ├── api/
│       │   ├── feats-api.ts      # Client-side API functions (fetch wrappers)
│       │   └── validation.ts     # Zod schemas (CreateFeatInput, UpdateFeatInput)
│       ├── components/
│       │   ├── feat-form-modal.tsx        # Create/Edit form with RichTextEditor
│       │   ├── feats-filters.tsx          # Search + Level + Status filters
│       │   ├── feats-table.tsx            # Paginated table with CRUD actions
│       │   ├── feat-preview.tsx           # Tooltip preview component
│       │   └── feats-entity-card.tsx      # Dashboard statistics card
│       ├── hooks/
│       │   ├── useFeats.ts                # TanStack Query hook for fetching feats
│       │   └── useFeatMutations.ts        # Mutations (create, update, delete) with audit invalidation
│       ├── models/
│       │   └── feat.ts                    # Mongoose model for Feat entity
│       └── types/
│           └── feats.types.ts             # TypeScript interfaces (Feat, CreateFeatInput, UpdateFeatInput, FeatsFilters, FeatsResponse)
│
├── app/
│   ├── (dashboard)/
│   │   ├── feats/
│   │   │   └── page.tsx          # NEW: Main feats catalog page (/feats route)
│   │   └── page.tsx              # MODIFIED: Add FeatsEntityCard to dashboard grid
│   ├── api/
│   │   ├── feats/
│   │   │   ├── route.ts          # NEW: GET (list with filters) and POST (create)
│   │   │   ├── [id]/
│   │   │   │   └── route.ts      # NEW: GET (single), PUT (update), DELETE
│   │   │   └── search/
│   │   │       └── route.ts      # NEW: Mention system search endpoint
│   │   └── dashboard/
│   │       └── stats/
│   │           └── route.ts      # MODIFIED: Add feats statistics
│
├── lib/
│   └── config/
│       └── colors.ts             # MODIFIED: Add Talento entity color config (amber)
│
└── components/
    └── sidebar/
        └── expandable-sidebar.tsx  # MODIFIED: Add Feats menu entry

# Integration Points (Files to Modify)
src/features/rules/
├── components/
│   ├── mention-list.tsx          # MODIFIED: Display feats with amber badge
│   ├── mention-badge.tsx         # MODIFIED: Render feat badges with amber style
│   └── entity-preview-tooltip.tsx # MODIFIED: Add FeatPreview component
└── utils/
    └── suggestion.ts             # MODIFIED: Register Talento provider in ENTITY_PROVIDERS

src/features/users/
├── components/
│   ├── audit-logs-table.tsx      # MODIFIED: Map "Feat" entity to "Talento" label + Zap icon
│   └── entity-multiselect.tsx    # MODIFIED: Add "Talento" filter option
└── models/
    └── audit-log-extended.ts     # ALREADY COMPATIBLE: Accepts "Feat" entity (flexible schema)

__tests__/
└── features/
    └── feats/                    # NEW: Test suite for Feats feature
        ├── components/
        │   └── feats-table.test.tsx
        └── hooks/
            └── useFeats.test.ts
```

**Structure Decision**: Web application (Next.js App Router). Feature seguirá o padrão orientado a features estabelecido no projeto, com todo código novo em `src/features/feats/` e rotas da página em `src/app/(dashboard)/feats/`. Integrações pontuais (sidebar, dashboard, mentions, audit logs, colors) serão feitas modificando arquivos existentes de forma cirúrgica, mantendo a separação de responsabilidades e a arquitetura do core intacta.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: ✅ No violations detected. This section is intentionally empty as the feature strictly adheres to all constitution principles.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
