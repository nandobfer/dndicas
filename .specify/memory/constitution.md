<!--
Sync Impact Report

- Version: n/a → 1.0.0
- Modified principles:
  - Core principles definidos para o Dungeons & Dicas
- Added sections:
  - Requisitos Técnicos e Stack Oficial
  - Fluxo de Desenvolvimento, Revisão e Qualidade
- Removed sections:
  - Nenhuma
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check alinhado com esta constituição)
  - ✅ .specify/templates/spec-template.md (já compatível, nenhuma mudança estrutural necessária)
  - ✅ .specify/templates/tasks-template.md (já compatível, nenhuma mudança estrutural necessária)
  - ⚠ .specify/templates/commands/*.md (nenhum arquivo encontrado; revisar se forem adicionados no futuro)
- Follow-up TODOs:
  - Nenhum
-->

# Constituição de Desenvolvimento do Dungeons & Dicas

## Core Principles

### 1. TypeScript Estrito e Código Seguro

- Todo código de aplicação e de features DEVE ser escrito em TypeScript com `strict`
  habilitado, seguindo as regras de `docs/regras_gerais.md`.
- É PROIBIDO usar `any` e `@ts-ignore`, exceto quando aprovado em code review e
  acompanhado de justificativa explícita e rastreável no PR e na documentação
  da feature.
- Todas as funções DEVEM ter parâmetros e tipos de retorno explícitos, e todos os
  componentes React DEVEM ter props tipadas via interfaces ou types nomeados.
- Nomes de variáveis e funções DEVEM seguir camelCase, componentes DEVEM seguir
  PascalCase e arquivos DEVEM seguir os padrões definidos (ex.: `spell-card.tsx`,
  `use-character-stats.ts`, `character.types.ts`).
- O código DEVE ser autoexplicativo; comentários são reservados para explicar o
  “porquê” de decisões e fórmulas (especialmente regras de D&D), nunca o óbvio.

**Racional**: Tipagem estrita e padrões claros reduzem bugs, facilitam refatorações
e permitem que humanos e IAs trabalhem com segurança sobre a base de código.

### 2. Core Imutável e Extensão por Features

- O diretório `src/core/` é considerado **core imutável** e NÃO PODE ser modificado
  diretamente neste projeto. Atualizações do core vêm do repositório template,
  via `git remote add template` e `git merge` conforme descrito no `README.md`.
- Toda lógica específica do Dungeons & Dicas (domínio, telas, integrações próprias)
  DEVE viver em `src/features/` e `src/app/`, nunca em `src/core/`.
- Extensões do core DEVEM ser feitas por composição e wrappers, conforme
  documentado em `aicontext/use-para-estender-o-core.md` (por exemplo, criando
  componentes que embrulham componentes de `@/core/ui`).
- Qualquer mudança excepcional em `src/core/` (por manutenção do template) DEVE
  seguir as diretrizes de `aicontext/use-quando-desenvolver-no-modulo-core.md`
  e ser cuidadosamente revisada.

**Racional**: Manter o core imutável permite evoluir o template base e receber
correções e melhorias globais sem quebrar as features específicas do projeto.

### 3. Separação de Responsabilidades e Hooks de Negócio

- Componentes React DEVEM focar em renderização, composição de UI e orquestração
  simples; regras de negócio, cálculos e acesso a dados NÃO DEVEM ficar em
  componentes.
- Lógica de negócio e de UI complexa DEVE ser extraída para custom hooks
  (`use*`) localizados em `hooks/` dentro do feature ou em `src/hooks/` para
  hooks globais, seguindo a estrutura descrita em `docs/regras_gerais.md`.
- Estado de servidor (dados vindos de API/DB) DEVE ser gerenciado preferencialmente
  com TanStack React Query, usando o padrão de hidratação mostrado em
  `docs/stack_tecnica.md`. Estado local usa `useState`/`useReducer` e contextos
  somente quando realmente globais.
- Estrutura de pastas DEVEseguir o modelo orientado a features (`src/features/*`,
  com `components/`, `hooks/`, `types/`, `api/` etc.), mantendo UI, hooks,
  tipos e testes co-localizados sempre que possível.

**Racional**: Separar renderização, lógica e dados aumenta reuso, testabilidade,
clareza arquitetural e facilita a navegação do código.

### 4. Desenvolvimento Orientado a Contexto e Documentação Viva

- Antes de iniciar ou automatizar desenvolvimento significativo, humanos e IAs
  DEVEM carregar e seguir pelo menos:
  - `docs/regras_gerais.md`
  - `docs/stack_tecnica.md`
  - `aicontext/use-sempre-que-desenvolver.md`
- Cada novo módulo em `src/features/` DEVE ter documentação correspondente em
  `aicontext/modules/[nome-modulo].md`, descrevendo objetivo, estrutura, schemas,
  APIs e exemplos de uso.
- A documentação `aicontext/use-*` é considerada **guia de execução em tempo de
  desenvolvimento** e DEVE ser mantida alinhada com esta constituição quando
  novos padrões forem criados.
- Sempre que um novo padrão ou convenção global for adotado (por exemplo,
  novos tipos de resposta de API, novas integrações externas), a documentação
  relevante em `aicontext/` e em `docs/` DEVE ser atualizada como parte da
  mesma mudança.

**Racional**: O projeto é projetado para desenvolvimento assistido por IA; o
contexto correto, atualizado e localizado garante consistência e reduz decisões
ad-hoc espalhadas.

### 5. Qualidade, Testes, Segurança e Observabilidade

- Funcionalidades de negócio e APIs críticas DEVEM possuir testes automatizados
  (Jest + React Testing Library), seguindo a estrutura de `__tests__/` e as
  metas de cobertura definidas em `__tests__/README.md`.
- Erros DEVEM ser tratados com componentes de erro do Next.js (`error.tsx`,
  `not-found.tsx`), estados de loading e empty states amigáveis, sempre em
  português para o usuário final.
- Nenhum segredo (chaves de API, tokens, senhas) PODE ser commitado; toda
  configuração sensível DEVE vir de variáveis de ambiente (`.env.local`),
  alinhadas com `README.md` e `docs/stack_tecnica.md`.
- Segurança DEVE incluir validação de input no cliente e no servidor, sanitização
  de dados renderizados, autenticação via Clerk e autorização baseada em roles
  no banco (`User.role`), conforme definido na stack técnica.
- Commits DEVEM seguir o padrão de conventional commits em português
  (ex.: `feat:`, `fix:`, `docs:`, `refactor:`) e descrever claramente o impacto.

**Racional**: Qualidade e segurança são essenciais em uma plataforma colaborativa
de regras e conteúdo de D&D; testes, validação e observabilidade reduzem risco
e garantem experiência consistente.

## Requisitos Técnicos e Stack Oficial

- O projeto DEVE usar Next.js 15+ (ou superior compatível, hoje Next.js 16+)
  com App Router, React 18+ e Node.js 20+ LTS.
- O modo estrito de TypeScript DEVE permanecer habilitado, com as flags de
  qualidade descritas em `docs/stack_tecnica.md` (`noImplicitAny`,
  `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters` etc.).
- A camada de apresentação DEVE utilizar Tailwind CSS, Shadcn/ui e Framer Motion
  para composição de UI moderna no estilo “Liquid Glass + D&D vintage”, seguindo
  as referências visuais definidas na stack técnica.
- Autenticação DEVE ser feita via Clerk, com vínculo `clerkId` persistido no
  MongoDB; autorizações e perfis (admin, usuário comum) DEVEM ser gerenciados
  localmente no modelo `User`.
- O banco de dados DEVE ser MongoDB (idealmente Atlas) com Mongoose, com modelos
  para entidades de D&D chave (`User`, `Character`, `Class`, `Race`, `Background`,
  `Feat`, `Spell`, `Item`), conforme estrutura indicada em `docs/stack_tecnica.md`.
- Estado de servidor DEVE seguir o padrão híbrido:
  - Fetch inicial no servidor (Server Components) com hidratação via
    `HydrationBoundary` + TanStack Query.
  - Requisições subsequentes e interações complexas gerenciadas no cliente com
    TanStack Query.
- Formulários DEVEM usar React Hook Form com validação por Zod, com mensagens
  de erro em português e acessibilidade (ARIA) adequada.
- Configurações centrais DEVERÃO ser centralizadas em `lib/config/` (cores,
  animações, constantes de D&D, endpoints de API, metadados de site).
- Convenções específicas de D&D (nomes de atributos, tipos de dano, níveis de
  magia, etc.) DEVEM ser modeladas nas constantes de `lib/config/dnd-constants.ts`
  e tipos em `src/types/`.
- Integrações externas aprovadas (como Owlbear Rodeo SDK) DEVEM seguir as
  diretrizes e documentação oficiais, e sua configuração DEVE ser refletida na
  documentação de módulos em `aicontext/modules/`.

Qualquer desvio intencional destes requisitos (por exemplo, troca de tecnologia
ou alteração significativa de arquitetura) DEVE ser explicitamente justificado
no `spec.md` e `plan.md` da feature, com trade-offs documentados.

## Fluxo de Desenvolvimento, Revisão e Qualidade

- Todo trabalho relevante DEVE começar com uma especificação clara:
  - `specs/[###-feature-name]/spec.md` com histórias de usuário, requisitos e
    critérios de sucesso.
  - `specs/[###-feature-name]/plan.md` com plano técnico, contexto e estrutura
    de pastas, incluindo a seção **Constitution Check**.
  - `specs/[###-feature-name]/tasks.md` com tasks organizadas por história de
    usuário, permitindo entregas independentes.
- A seção **Constitution Check** em `plan.md` DEVE listar, de forma objetiva,
  se a feature respeita ou viola cada princípio desta constituição (tipagem
  estrita, core imutável, separação de responsabilidades, documentação de
  contexto e qualidade/testes/segurança).
- Toda violação intencional (por exemplo, necessidade temporária de editar
  algo em `src/core/` ou uso de padrão fora da stack oficial) DEVE ser
  registrada na tabela de “Complexity Tracking” do `plan.md`, com justificativa
  e alternativa mais simples rejeitada.
- PRs DEVERÃO:
  - Referenciar os arquivos `spec.md` e `plan.md` relevantes.
  - Indicar se todas as tasks planejadas em `tasks.md` foram concluídas ou
    quais ficaram de fora do escopo.
  - Demonstrar execução de testes (`npm test`, `npm run lint`, `npm run type-check`)
    quando aplicável.
- Code reviews DEVEM checar explicitamente:
  - Conformidade com esta constituição e com `docs/regras_gerais.md`.
  - Adesão à stack e arquitetura de `docs/stack_tecnica.md`.
  - Uso correto dos arquivos de contexto de IA em `aicontext/`.

Esse fluxo é obrigatório para novas features e refactors significativos; pequenos
ajustes e correções pontuais podem ter versões simplificadas dos artefatos, mas
sem ignorar os princípios desta constituição.

## Governance

- Esta constituição é a fonte de verdade para decisões de arquitetura, stack e
  fluxo de desenvolvimento do Dungeons & DIcas. Em caso de conflito, ela prevalece
  sobre outros documentos, exceto quando uma decisão explícita a altera em uma
  nova versão.
- Os documentos `docs/regras_gerais.md`, `docs/stack_tecnica.md` e os arquivos
  `aicontext/use-*` são extensões desta constituição, detalhando padrões para
  contextos específicos. Eles NÃO PODEM contradizer esta constituição; em caso
  de divergência, esta constituição deve ser atualizada ou esses documentos
  devem ser corrigidos.
- Qualquer exceção a estas regras (por exemplo, uso pontual de `any`, mudança
  na stack principal, alteração em `src/core/`) DEVE:
  - Ser documentada em `spec.md` e `plan.md` (incluindo a tabela de
    “Complexity Tracking”).
  - Ser mencionada explicitamente na descrição do PR.
  - Ter uma estratégia clara de reversão ou mitigação.
- Emendas à constituição:
  - DEVEM ser feitas via PR que atualiza este arquivo e quaisquer templates
    afetados (`.specify/templates/*`), incluindo um novo Sync Impact Report.
  - DEVEM incluir justificativa clara da mudança (por exemplo, nova tecnologia,
    lições aprendidas, necessidades de produto).
  - DEVEM atualizar o número de versão seguindo semantic versioning:
    - **MAJOR**: mudanças incompatíveis ou remoção/redefinição de princípios.
    - **MINOR**: inclusão de novos princípios ou seções, ou expansão material
      de orientação existente.
    - **PATCH**: ajustes redacionais, correções e esclarecimentos sem impacto
      semântico.
  - DEVEM ser aprovadas por pelo menos um mantenedor do projeto.
- Conformidade:
  - Revisores DEVEM verificar, em cada PR relevante, se o trabalho segue esta
    constituição e se o `plan.md` passou no **Constitution Check**.
  - Ferramentas e agentes de IA que operem no repositório DEVEM carregar esta
    constituição e os arquivos de contexto antes de gerar código.

**Version**: 1.0.0 | **Ratified**: 2026-02-18 | **Last Amended**: 2026-02-18

