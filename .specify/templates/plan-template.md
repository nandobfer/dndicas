# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Use esta seção para registrar verificações objetivas de aderência à constituição
do Dungeons & Dicas. Para cada item abaixo, marque se a feature **cumpre**, **viola**
ou **não se aplica**, e registre justificativas em caso de violação.

- [ ] **TypeScript estrito e tipagem correta**
  - Todo código novo está em TypeScript com `strict` habilitado.
  - Nenhum `any` ou `@ts-ignore` foi introduzido sem justificativa explícita.
  - Props de componentes, parâmetros e retornos de funções estão tipados.

- [ ] **Core imutável e extensão por features**
  - Nenhum arquivo em `src/core/` foi modificado para implementar esta feature.
  - Toda lógica específica do Dungeons & Dicas está em `src/features/` ou `src/app/`.
  - Extensões do core, se existirem, usam wrappers/composição conforme
    `aicontext/use-para-estender-o-core.md`.

- [ ] **Separação de responsabilidades e uso de hooks**
  - Componentes React estão focados em renderização/composição, sem regras de
    negócio ou acesso direto a infra.
  - Lógica de negócio e de UI complexa foi extraída para custom hooks (`use*`)
    em `hooks/` do feature ou em `src/hooks/`.
  - Estado de servidor usa TanStack Query quando aplicável; estado local usa
    `useState`/`useReducer` e contextos apenas quando necessário.

- [ ] **Documentação de contexto e alinhamento com aicontext/**
  - A feature possui documentação em `aicontext/modules/[nome-modulo].md`
    (ou foi explicitamente avaliado que não se aplica).
  - Regras específicas adotadas aqui estão refletidas em `docs/` e/ou
    `aicontext/use-*` quando forem padrões reutilizáveis.
  - Humanos e IAs usaram `docs/regras_gerais.md`, `docs/stack_tecnica.md` e
    `aicontext/use-sempre-que-desenvolver.md` como contexto para este plano.

- [ ] **Qualidade, testes, segurança e observabilidade**
  - Existem testes automatizados planejados para a lógica crítica (e.g. Jest +
    React Testing Library), conforme `__tests__/README.md`.
  - Inputs são validados (cliente e servidor) e dados renderizados são
    sanitizados quando necessário.
  - Uso de Clerk, roles e acesso a dados segue as diretrizes de segurança da
    stack técnica.
  - Não há segredos commitados; variáveis de ambiente são usadas corretamente.

Qualquer violação destas verificações DEVE ser refletida na tabela de
“Complexity Tracking” deste plano, com justificativas e alternativas mais
simples consideradas e rejeitadas.

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
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
