# AGENTS.md

Guia normativo para qualquer IA que trabalhe neste repositório.

## 1. Ordem obrigatória de leitura

Antes de implementar, leia nesta ordem:

1. `aicontext/README.md`
2. `aicontext/use-sempre-que-desenvolver.md`
3. O guia específico da tarefa:
   - API: `aicontext/use-quando-desenvolver-api.md`
   - UI/tema/componentes: `aicontext/use-para-atualizar-tema-e-componentes-ui.md` e `aicontext/use-componentes-ui.md`
   - Extensão de serviços ou componentes base: `aicontext/use-para-estender-o-core.md`
   - Autenticação: `aicontext/use-para-configurar-clerk.md`
   - Arquitetura e decisões técnicas: `aicontext/use-diretrizes-do-projeto.md`
   - Módulos de negócio: `aicontext/modules/*.md`

## 2. Regras não negociáveis

- Use TypeScript estrito. Evite `any`; não use `@ts-ignore` sem justificativa explícita.
- Mantenha separação de responsabilidades:
  - `src/core`: base compartilhada
  - `src/features`: regras e fluxos de negócio
  - `src/app`: rotas, páginas e handlers do Next.js
- Operações críticas devem preservar auditoria e logging estruturado.
- Mensagens para usuário, erros acionáveis e estados vazios devem estar em pt-BR.
- Ao criar ou expandir um módulo em `src/features`, atualize a documentação correspondente em `aicontext/modules/`.

## 3. Padrões operacionais

### Builds

- Nunca rode `pnpm build` ou qualquer build completo automaticamente. O build é custoso para a máquina e pode travar o ambiente.
- Só execute build quando o usuário pedir explicitamente ou autorizar de forma clara durante a conversa.
- Para verificação autônoma, prefira testes focados, checagens de diagnóstico e validações menores compatíveis com o escopo da mudança.

### APIs

- Rotas ficam em `src/app/api`.
- Valide payloads com Zod.
- Proteja rotas com autenticação Clerk quando necessário, apenas quando necessário.
- Retorne respostas padronizadas compatíveis com `ApiResponse` ou `PaginatedResponse`.
- Em código cliente que usa o axios do projeto, chame endpoints sem prefixar `/api`.

### UI e frontend

- Prefira componentes no estilo "Glass" localizados em `src/components/ui/`. Caso não encontre um componente Glass adequado para a necessidade, utilize os componentes do Shadcn já disponíveis no projeto.
- Não coloque regra de negócio complexa dentro de componentes.
- Extraia lógica para hooks, serviços ou utilitários da feature.
- Mantenha responsividade, loading, erro e confirmação explícita em ações críticas.

### Core e extensões

- Se precisar de comportamento adicional, crie wrappers, composição ou serviços complementares em `src/features`.
- Não contorne a regra do core imutável editando arquivos base.

### Banco, auditoria e integrações

- Conecte ao banco antes de usar Mongoose.
- Registre auditoria em mutações críticas.
- Use os serviços centrais existentes para IA, email, storage, realtime e logging.

## 4. Stack e ferramentas oficiais

- Framework: Next.js 16 + React 19
- Linguagem: TypeScript 5 em modo strict
- UI: Tailwind CSS 4 + Shadcn/ui + Radix
- Auth: Clerk
- Banco: MongoDB + Mongoose
- Estado assíncrono: TanStack Query
- Testes: Vitest + React Testing Library
- Gerenciador de pacotes: Exclusivamente `pnpm` (não use `npm` ou `yarn`).
- Build e execução: scripts de `package.json` usando `pnpm`
- Processo em produção: PM2 via `ecosystem.config.js`

## 5. Padrão de testes

- Escreva testes na pasta `tests/` (respeitando a estrutura atual do projeto, como backend, frontend, scripts e owlbear).
- Foque em comportamento e regra de negócio, não em detalhes de implementação.
- Use `vi`, `describe`, `it`, `expect`, `beforeEach` e helpers locais conforme os testes existentes.
- Faça mock apenas do necessário e preserve independência entre casos.
- Para novos fluxos críticos, cubra happy path, falhas esperadas e casos-limite relevantes.

## 6. Checklist mínimo antes de encerrar

1. Li o contexto certo em `aicontext/`.
2. Não alterei `src/core/` desnecessariamente.
3. Mantive tipos, autenticação, validação e auditoria quando aplicável.
4. Atualizei testes ou confirmei por que não eram necessários.
5. Atualizei a documentação contextual se a mudança alterou comportamento, fluxo ou contrato.
