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
- Abas usam a cor primária na aba ativa: `IntegrationTabs` (`src/features/integrations/components/tabs/IntegrationTabs.tsx`), `GlassSelector` ou `OptionTabs`. Nunca `@/core/ui/tabs`, cuja aba ativa fica preta no tema escuro.
- Nunca use `<select>` ou `<input type="checkbox">` nativos: use o `Select` Glass de `@/core/ui/select`, `GlassSelector`/`StatusChips` para poucas opções fixas e o `Checkbox` de `@/core/ui/checkbox`. Veja "Abas e seletores" em `aicontext/use-componentes-ui.md`.
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
- Testes: Vitest 5 + React Testing Library, DOM com happy-dom por arquivo (jsdom só como exceção); CI
  com 4 shards paralelos (`.github/workflows/ci-cd.yml`) e `maxWorkers: "100%"`
- Gerenciador de pacotes: Exclusivamente `pnpm` (não use `npm` ou `yarn`).
- Build e execução: scripts de `package.json` usando `pnpm`
- Processo em produção: PM2 via `ecosystem.config.js`

## 5. Padrão de testes

- Escreva testes na pasta `tests/` (respeitando a estrutura atual do projeto, como backend, frontend, scripts e owlbear).
- Foque em comportamento e regra de negócio, não em detalhes de implementação.
- Use `vi`, `describe`, `it`, `expect`, `beforeEach` e helpers locais conforme os testes existentes.
- Faça mock apenas do necessário e preserve independência entre casos.
- Para novos fluxos críticos, cubra happy path, falhas esperadas e casos-limite relevantes.
- Chamadas a serviços externos (provedores de IA, Owlbear, S3, Pusher) são sempre mockadas nos
  testes (nunca rede real). Nenhum teste de UI depende de rede: hooks que chamam a API são mockados.
- Config única (`vitest.config.ts`, ambiente `node`) e setup único (`tests/setup.ts`): não recrie
  `projects` nem setups por pasta.

### Ambiente dos testes de UI

- **Teste de componente/hook declara `/** @vitest-environment happy-dom */`** na primeira linha
  (também quem usa `window`, `document` ou `self`). Sem o docblock o arquivo roda em `node`, que não
  paga o custo de montar um DOM. O happy-dom monta em ~metade do tempo do jsdom.
- **`jsdom` é exceção, não padrão.** Hoje nenhum arquivo precisa dele. Ao criar um teste de UI,
  comece com happy-dom e só troque se a semântica faltante for necessária de fato — e registre o
  motivo no docblock e nesta lista.
- **Diferenças conhecidas do happy-dom**, contornadas no próprio teste:
  - `navigator.clipboard` é só getter: use `Object.defineProperty(navigator, 'clipboard', …)`,
    nunca `Object.assign`;
  - `:not()` com seletor complexo (`:not(.a b)`) não funciona: filtre em JS (`closest`);
  - a posição inicial do cursor de um `<textarea>` difere do jsdom: fixe-a com `setSelectionRange`;
  - `<iframe>` não carrega página (o happy-dom loga `Iframe page loading is disabled`): assertivas
    olham os atributos (`src`, `title`), não o conteúdo.
- **Não conte com animação real.** O setup de DOM liga `MotionGlobalConfig.skipAnimations` e remove
  `Element.prototype.animate` (o Framer Motion cai na animação em JS): com o happy-dom, cancelar uma
  animação nativa no desmonte rejeita uma promise fora do teste (`AbortError`) e derruba o run
  inteiro mesmo com todos os testes verdes. Assertivas olham o estado final, não a transição.
- **Mock de construtor é `function`, não seta.** No Vitest 5, `vi.fn(() => …)` chamado com `new`
  lança "is not a constructor": use `vi.fn(function () { return … })`.
- **Não ligue `isolate: false`.** Reusa o worker entre arquivos, mas o estado de módulo vaza (mocks,
  DOM acumulado, singletons como o do Pusher e `process.env`). O motivo também está em comentário
  no `vitest.config.ts`.
- **Imports pesados entram sob demanda.** `src/lib/ai/stream.ts`, `src/lib/ai/image.ts` e
  `src/lib/ai/catalog.ts` importam a SDK `ai` e os clientes dos provedores com `await import()` só
  quando são usados: no topo, eles custam centenas de ms de carga em todo arquivo de teste que
  alcança esses módulos. Mantenha esse padrão nesses pontos de entrada e em módulos pesados novos
  ligados a fluxos centrais (rotas de geração de entidades, tradutores do seed).

### Paralelismo e CI

- `vitest.config.ts` fixa `maxWorkers: "100%"`: o default (`numCPUs - 1`) virava 1 worker no runner
  de 2 vCPU do GitHub e a suíte rodava em série. Na máquina local (pouca RAM, sem swap), passe
  `--maxWorkers=50%` se a suíte completa pressionar a memória.
- O CI roda a suíte em **4 shards paralelos** (`pnpm test --shard=i/4`, matriz em
  `.github/workflows/ci-cd.yml`) e o `tsc --noEmit` em job próprio; o grupo de `concurrency` inclui o
  shard para um não cancelar o outro, e o build/deploy (`needs: [vitest, typecheck]`) espera todos.
  Para mudar a quantidade, edite só a lista `matrix.shard`. Os checks aparecem como
  "Vitest (1/4)"…"Vitest (4/4)" e "TypeScript": a proteção da `main` deve exigir esses nomes.

### Rodando os testes

- **Nunca rode a suíte completa** (`pnpm test`, `pnpm exec vitest run` sem arquivos) sem pedido
  explícito do usuário: ela roda no CI do GitHub em todo pull request e push na `main`.
- Rode só o que as mudanças afetam:
  - testes criados ou alterados: `pnpm exec vitest run <arquivos de teste>`;
  - testes que dependem do código alterado: `pnpm exec vitest related --run <arquivos de src>`;
  - pelo grafo de imports dos arquivos modificados no git: `pnpm exec vitest run --changed` (ou
    `--changed origin/main`). O `vitest.config.ts` tira o `package.json` dos `forceRerunTriggers`
    para que o bump de versão não dispare a suíte inteira; alterar o próprio `vitest.config.ts`
    ainda dispara, então nesse caso rode os arquivos de teste pelo caminho.
- Se um teste afetado falhar por causa da mudança, corrija antes de encerrar.

## 6. Checklist mínimo antes de encerrar

1. Li o contexto certo em `aicontext/`.
2. Não alterei `src/core/` desnecessariamente.
3. Mantive tipos, autenticação, validação e auditoria quando aplicável.
4. Atualizei testes ou confirmei por que não eram necessários. Rodei só os testes afetados
   (`vitest run <arquivos>`, `related` ou `--changed`), com testes de UI em happy-dom; a suíte
   completa só se o usuário pediu.
5. Atualizei a documentação contextual se a mudança alterou comportamento, fluxo ou contrato.

## 7. Versionamento em cada commit

- **Sempre que for fazer um `git commit`, incremente a versão em `src/lib/config/version.ts`** seguindo versionamento semântico (`major.minor.patch`):
  - **major** (`X.0.0`): mudanças incompatíveis / breaking changes.
  - **minor** (`x.Y.0`): nova funcionalidade compatível com versões anteriores.
  - **hotfix/patch** (`x.y.Z`): correção de bug compatível com versões anteriores.
- Faça o bump da versão no mesmo commit da alteração correspondente.

