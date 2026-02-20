# Implementation Plan: Liquid Glass Core - Design System, Auth & Foundation

**Branch**: `spec/000` | **Date**: 2026-02-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/000/spec.md`

## Summary

Implementação fundacional do sistema de design "Liquid Glass + D&D" para o Dungeons & Dicas. Esta feature estabelece a identidade visual da plataforma (tema escuro com glassmorphism, paleta de cores D&D), componentes core reutilizáveis (DataTable, FormModal, Chips, DiffView), autenticação sincronizada com Clerk, CRUD de usuários com soft delete e sistema de auditoria automático.

**Abordagem técnica**: Extensão do template core existente via composição (não modificando `src/core/`), criando wrappers com estética Liquid Glass, usando Framer Motion para animações e TanStack Query para estado de servidor com hidratação SSR.

## Technical Context

**Language/Version**: TypeScript 5.0+ (strict mode), Node.js 20+ LTS  
**Primary Dependencies**: Next.js 16+, React 19+, TailwindCSS 4.0, Framer Motion 12+, Shadcn/ui, TanStack React Query 5+, React Hook Form, Zod  
**Storage**: MongoDB Atlas com Mongoose 9+  
**Testing**: Jest + React Testing Library (estrutura existente em `__tests__/`)  
**Target Platform**: Web (desktop-first, responsivo)  
**Project Type**: Web application (monorepo Next.js)  
**Performance Goals**: Tabelas carregam < 2s para 100 registros, animações de sidebar < 400ms, sincronização Clerk < 1s  
**Constraints**: Filtros e busca respondem < 300ms, debounce de 500ms com feedback visual  
**Scale/Scope**: ~10 telas novas/modificadas, 8 componentes core novos, 2 modelos de dados

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Observações |
|-----------|--------|-------------|
| **1. TypeScript Estrito e Código Seguro** | ✅ PASS | Todo código será TypeScript strict, sem `any` ou `@ts-ignore`, com tipos explícitos em funções e props |
| **2. Core Imutável e Extensão por Features** | ✅ PASS | Nenhuma modificação em `src/core/`; componentes novos serão wrappers compostos em `src/features/users/` e novos arquivos em `src/lib/config/` |
| **3. Separação de Responsabilidades e Hooks de Negócio** | ✅ PASS | Componentes focam em renderização; lógica de negócio em hooks (`useUsers`, `useAuditLogs`, `useSidebar`); estado de servidor via TanStack Query |
| **4. Desenvolvimento Orientado a Contexto e Documentação Viva** | ✅ PASS | spec.md e plan.md completos; `aicontext/modules/users.md` será criado |
| **5. Qualidade, Testes, Segurança e Observabilidade** | ✅ PASS | Testes para hooks críticos e API; validação client+server com Zod; autenticação via Clerk; sem segredos em código |

**Gate Result**: ✅ APROVADO - Nenhuma violação detectada

## Project Structure

### Documentation (this feature)

```text
specs/000/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
│   ├── users.yaml
│   └── audit-logs.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── config/
│       ├── colors.ts              # Paleta de cores D&D + Liquid Glass
│       ├── motion-configs.ts      # Variantes de animação Framer Motion
│       └── glass-config.ts        # Configurações de glassmorphism (blur, opacity, gradients)
│
├── features/
│   └── users/
│       ├── components/
│       │   ├── users-table.tsx           # Tabela de usuários com filtros
│       │   ├── user-form-modal.tsx       # Modal de criação/edição
│       │   ├── user-delete-dialog.tsx    # Modal de confirmação de exclusão
│       │   └── user-filters.tsx          # Filtros de função e status
│       ├── hooks/
│       │   ├── useUsers.ts               # Hook de CRUD de usuários
│       │   └── useUsersFilters.ts        # Hook de filtros e busca
│       ├── api/
│       │   ├── users.ts                  # Funções de API client-side
│       │   └── validation.ts             # Schemas Zod
│       ├── models/
│       │   └── user.ts                   # Mongoose model User
│       └── types/
│           └── user.types.ts             # Interfaces TypeScript
│
├── app/
│   └── (dashboard)/
│       ├── layout.tsx                    # Layout com sidebar expansível (wrapper)
│       ├── users/
│       │   └── page.tsx                  # Página de CRUD de usuários
│       └── audit-logs/
│           └── page.tsx                  # Página de logs (já existe, será aprimorada)
│   └── api/
│       ├── users/
│       │   └── route.ts                  # API Route de usuários
│       └── audit-logs/
│           └── route.ts                  # API Route de logs (já existe)
│
└── components/
    └── ui/
        ├── glass-card.tsx                # Card com efeito Liquid Glass
        ├── glass-modal.tsx               # Modal translúcido genérico
        ├── search-input.tsx              # Input de busca com debounce + progress
        ├── chip.tsx                      # Chip/Badge com variantes de cor D&D
        ├── user-chip.tsx                 # Chip de usuário com avatar e tooltip
        ├── role-tabs.tsx                 # Seletor de função estilo tabs
        ├── diff-view.tsx                 # Visualização de diff lado-a-lado
        ├── confirm-dialog.tsx            # Dialog de confirmação translúcido
        ├── expandable-sidebar.tsx        # Sidebar expansível com animação
        ├── loading-state.tsx             # Estado de loading Liquid Glass
        ├── empty-state.tsx               # Estado vazio com ícone e descrição
        ├── error-state.tsx               # Estado de erro com retry
        └── coming-soon-placeholder.tsx   # Placeholder para features futuras
```

**Structure Decision**: Arquitetura Next.js App Router com features modulares. Componentes UI reutilizáveis ficam em `src/components/ui/` (extensões do core, não modificando `src/core/ui/`). Features de negócio (users, audit) ficam em `src/features/`. Configurações globais em `src/lib/config/`.

## Complexity Tracking

> Nenhuma violação de constituição detectada - seção vazia.

---

## Generated Artifacts

Esta fase do planejamento gerou os seguintes artefatos:

| Artefato | Caminho | Descrição |
|----------|---------|-----------|
| Plan | [plan.md](plan.md) | Este arquivo - plano de implementação |
| Research | [research.md](research.md) | Decisões técnicas e melhores práticas |
| Data Model | [data-model.md](data-model.md) | Schemas, types e validações |
| API Contracts | [contracts/users.yaml](contracts/users.yaml) | OpenAPI spec da API de usuários |
| API Contracts | [contracts/audit-logs.yaml](contracts/audit-logs.yaml) | OpenAPI spec da API de logs |
| Quickstart | [quickstart.md](quickstart.md) | Guia de setup e validação |

**Agent Context atualizado**:
- [aicontext/modules/users.md](../../aicontext/modules/users.md)

---

## Implementation Phases

### Phase 1: Configurações e Design System (P1)

**Objetivo**: Estabelecer base visual do Liquid Glass

1. Criar `src/lib/config/colors.ts` com paleta D&D
2. Criar `src/lib/config/glass-config.ts` com configurações de glassmorphism
3. Criar `src/lib/config/motion-configs.ts` com variantes Framer Motion
4. Criar componentes UI base:
   - `glass-card.tsx`
   - `glass-modal.tsx`
   - `loading-state.tsx`
   - `empty-state.tsx`
   - `error-state.tsx`
   - `coming-soon-placeholder.tsx`

### Phase 2: Layout e Navegação (P1)

**Objetivo**: Sidebar expansível com persistência

1. Criar `src/components/ui/expandable-sidebar.tsx`
2. Criar hook `useSidebar` com sessionStorage
3. Atualizar `src/app/(dashboard)/layout.tsx` como wrapper
4. Remover "Empresas" do sidebar, renomear "Módulos" para "Cadastros"
5. Adicionar item "Usuários" em Cadastros

### Phase 3: Modelo de Dados e API (P1)

**Objetivo**: Backend para users

1. Criar `src/features/users/models/user.ts` (Mongoose)
2. Criar `src/features/users/api/validation.ts` (Zod)
3. Criar `src/app/api/users/route.ts` (CRUD)
4. Criar `src/app/api/webhooks/clerk/route.ts` (sincronização)
5. Criar `scripts/bootstrap-admin.ts`

### Phase 4: CRUD de Usuários (P2)

**Objetivo**: Interface completa de gerenciamento

1. Criar componentes UI auxiliares:
   - `chip.tsx`
   - `user-chip.tsx`
   - `role-tabs.tsx`
   - `search-input.tsx` (com debounce + progress bar)
   - `confirm-dialog.tsx`
2. Criar hooks de usuários:
   - `useUsers.ts`
   - `useUsersFilters.ts`
3. Criar componentes de feature:
   - `users-table.tsx`
   - `user-form-modal.tsx`
   - `user-delete-dialog.tsx`
   - `user-filters.tsx`
4. Criar página `src/app/(dashboard)/users/page.tsx`

### Phase 5: Sistema de Auditoria (P2-P3)

**Objetivo**: Logging e visualização

1. Estender modelo AuditLog para suportar previousData/newData
2. Criar middleware de auditoria para operações CRUD
3. Criar `diff-view.tsx` para visualização de diferenças
4. Atualizar página de audit-logs com:
   - Chips coloridos por ação
   - User chips com tooltip
   - Modal de detalhes com diff view
   - Server-side pagination

---

## Re-check Constitution (Post-Design)

| Princípio | Status | Verificação |
|-----------|--------|-------------|
| **1. TypeScript Estrito** | ✅ PASS | Todos schemas Zod geram types, models tipados |
| **2. Core Imutável** | ✅ PASS | Componentes em `src/components/ui/`, features em `src/features/` |
| **3. Separação de Responsabilidades** | ✅ PASS | Hooks encapsulam lógica, componentes renderizam |
| **4. Documentação Viva** | ✅ PASS | `aicontext/modules/users.md` criado |
| **5. Qualidade e Testes** | ✅ PASS | Validação client+server, estrutura de testes definida |

---

## Next Steps

1. Execute `/speckit.tasks` para gerar tasks.md com tarefas detalhadas por User Story
2. Inicie implementação seguindo as phases definidas
3. Valide cada phase usando o checklist em quickstart.md

