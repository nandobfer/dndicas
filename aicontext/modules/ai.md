# Módulo: IA — provedores, agentes e memórias

Camada de IA copiada do Opex (Vercel AI SDK). Substitui o antigo `src/core/ai/genai.ts`
(`@google/genai`), que foi **removido junto com o fallback `GENAI_*`**: não há mais fallback.

## Provedores (`/integracoes/ia`)

Os cards de provedores, consumo, modelos, agentes e memórias usam a família
`GlassCard` existente. Layout e cor primária seguem o padrão compartilhado descrito
em [Integrações — Interface](./integrations.md#interface-dnd-6), sem containers de largura próprios.

| Id | Integração | Uso no DnDicas |
| --- | --- | --- |
| `opencode` | `ai_opencode` | Texto (modelos e agentes das contas do servidor OpenCode 2.x) |
| `opencode-go` | `ai_opencode_go` | Texto e ferramentas pela API da assinatura OpenCode Go, **sem sessão no servidor OpenCode** (ver abaixo) |
| `gemini` | `ai_gemini` | Texto, ferramentas e **imagem** (`*-image*`, Imagen) |
| `anthropic` | `ai_anthropic` | Texto e ferramentas |
| `openai` | `ai_openai` | Texto, ferramentas e **imagem** (`gpt-image-*`, `dall-e-*`) |
| `deepseek` | `ai_deepseek` | Texto e ferramentas |
| `jev` | `ai_jev` | Só configurável (decisão estruturada); nenhum agente usa ainda |

Código: `src/lib/ai/*` (`providers`, `catalog`, `stream` com `generateAiText`/`prepareModel`,
`consumption`, `image.ts` — extensão do DnDicas com `generateAiImage` e a listagem dos modelos de
imagem). Rotas: `/api/ai/providers/**` (inclui `/[provider]/image-models`), consumo e uso do JEV. `opencode-client.ts` (`@opencode/client`, sob demanda) cria, retoma e exclui
sessões do OpenCode para os agentes de sessão longa (Agente Maddox).

`stream.ts`, `image.ts` e `catalog.ts` carregam a SDK `ai` e os módulos de cada provedor sob demanda
(`await import()` no momento do uso), nunca no topo: quem só lê a configuração (ex.: `ai/server/settings`)
não paga as SDKs. Os testes mockam esses módulos pelo caminho (`vi.mock('@/lib/ai/gemini')`), que vale
também para o import dinâmico.

## OpenCode Go (`opencode-go`, DND-39)

Gateway de inferência da assinatura OpenCode Go do dono. É um provedor direto por API key, separado do `opencode` de
sessão: não abre sessão no `opencode serve` do host e não tem agente.

- **Chave:** `apiKey` (`oc_sk_…`, chave pessoal da assinatura) em Integrações › Provedores de IA › OpenCode Go
  (`/integracoes/ia/opencode-go`). Sem chave: "OpenCode Go sem API key: configure em…".
- **API:** `src/lib/ai/opencode-go.ts`, com `@ai-sdk/openai-compatible` em `https://opencode.ai/inference/go/openai/v1`
  (`POST /chat/completions` em SSE e `GET /models`). A versão da lib fica fixa (`3.0.81`) para usar o mesmo
  `@ai-sdk/provider` da SDK `ai`; com outro, o `LanguageModel` não fecha no tipo. Só o endpoint OpenAI-compatível é usado
  (os endpoints Anthropic/Google do Go estão fora de escopo), e o provedor não gera imagem.
- **Exigências do Go:** header `x-opencode-session` em toda geração (sem ele o Go recusa) e `User-Agent: dndicas/<versão>`
  (o `fetch` próprio troca o nome genérico da SDK). O id da sessão vem de `sessionKey` (campo opcional de
  `AiStreamRequest`/`prepareModel`) como `dndicas-<sha256 truncado>`: é estável por conversa (roteamento e cache de prompt)
  e não expõe ids internos. As chaves usadas são `opex:<sessão>` (Agente Opex), `maddox:<campanha>:narrator`,
  `maddox-interview:<entrevista>` e `entity-understanding:<usuário>:<tipo>:<entidade>`. Sem `sessionKey`, cada geração
  recebe um id novo (lotes do Importador, títulos e curador).
- **Modelos:** a lista é a do `GET /models`. Os `*-free` aparecem com o chip "grátis": o Go só garante esses modelos dentro do
  OpenCode e pode recusá-los aqui. Os modelos não têm variantes, porque o suporte ao `reasoning_effort` não está confirmado.
  O raciocínio do DeepSeek (`reasoning_content`) já é lido pela lib.
- **Erros:** a classificação usa o `statusCode` estruturado (`describeAiError(error, { provider, model })`, inclusive dentro
  de `RetryError.lastError`), nunca o texto. 401 = chave recusada. 403 = modelo recusado (grátis fora do OpenCode ou
  DeepSeek sem a região **Global** habilitada em Settings › Privacy). 429 = limite da assinatura (allowance de 5 h, semanal
  ou mensal). A chave nunca entra na mensagem.
- **Consumo:** o `metadataExtractor` lê do corpo e dos chunks (no stream, `usage.cost` e `usage.opencode`) o `cost`
  cobrado e `opencode.{billing_source, allowance, list_cost}`, e devolve `providerMetadata["opencode-go"]`. No plano Go o
  `cost` vem 0 e o gasto sai do `allowance`. Por isso o `costUsd` registrado em `ai_consumption_logs` é **cobrado +
  allowance**. `stepCostUsd` (`src/lib/ai/step-cost.ts`, puro) soma esse custo, ou o `opencode.cost` da sessão, por passo
  no `streamAi` e nos loops próprios (Agente Opex, narrador e entrevistas do Maddox, Entender com IA). O allowance e o
  preço de lista só vão para o log de debug. O provedor tem a aba **Consumo** (`OpencodeUsageCard provider="opencode-go"`,
  `GET /api/ai/providers/opencode-go/usage`, permissão `integrations.ai.view`).
- **Debug:** a listagem de modelos usa `debugFetch` (chave mascarada). A geração não passa por ele, porque o corpo traz o
  conteúdo do usuário.
- **Atenção:** o Go monitora o tráfego e espera uso compatível com agente de código. Gerações em lote (tradução do
  Importador 5etools) contam no allowance e podem chamar atenção.

## Agentes (abas de `/integracoes/ia`)

Cada agente é uma configuração em `ai_feature_settings` (provedor, modelo, instruções…). Sem
configuração ativa, o uso responde **409 em pt-BR** com o motivo e a tela mostra o aviso — nunca cai
num provedor fixo.

| Aba | Feature | Onde é usado |
| --- | --- | --- |
| Gerador de imagens | `image-generator` | Botão "Gerar com IA" do `GlassImageUploader` (`POST /api/core/ai/image`, login obrigatório), imagens da importação do 5etools, avatar do Maddox e as imagens nas cenas das Campanhas Maddox (Maddox 10: `generateAndStoreDndImage` aceita imagens de referência — só nos modelos Gemini `*-image*` e OpenAI `gpt-image-*` —, chave do storage, origem do consumo e sinal de cancelamento). Provedor Gemini/OpenAI, modelo de imagem, instruções e proporção padrão |
| Entender com IA | `entity-understanding` | Chat por entidade (`POST /api/entity-understanding/chat`, SSE) com as ferramentas `searchCatalogEntities`/`getCatalogEntity`; o formato HTML com menções é fixo |
| Importador 5etools | `entity-import` | Tradução das entidades importadas (`AiTranslator`, telas de geração e scripts de seed) |
| Agente Opex | `opex-agent` | Ver `opex-agent.md` |
| Agente Maddox | `maddox` | Mestre das Campanhas Maddox (aceita o OpenCode, com sessões próprias). Ver `maddox.md` |

Servidor: `src/features/ai/server/{settings,image-generator,entity-understanding,entity-import,memory-block}.ts`.
A rota genérica `/api/core/ai` (sem consumidor) foi removida.

## Memórias

Desde a DND-21 as memórias dos agentes ficam no **Engramind** (ver `engramind.md`). Cada lista antiga de
`agent_memories` virou um canal fixo, e cada consumidor recebe o bloco de contexto pronto do Engramind no fim
das instruções (`memoriesSection(block)`, `src/features/ai/memories-prompt.ts`), pelo token do próprio agente:

| Lista (antiga) | Canal | Aplicada em |
| --- | --- | --- |
| `opex-global` | `dndicas/opex/global` | Todo turno do Agente Opex |
| `opex-admin` | `dndicas/opex/admin` | Só turnos de administradores |
| `opex-user` | `dndicas/opex/user` | Turnos de usuários e visitantes |
| `image-generator` | `dndicas/image-generator` | Toda imagem gerada |
| `entity-understanding` | `dndicas/entity-understanding` | Toda resposta do Entender com IA |
| `entity-import` | `dndicas/entity-import` | Toda tradução do Importador 5etools |
| `maddox` | `dndicas/maddox` | Agente Maddox (narrador e entrevistador) |

Mapa lista → agente/canal: `src/features/ai/agents.ts` (`contextChannelsFor`). O bloco vem de
`memoryBlock(identity, role?)` (`src/features/ai/server/memory-block.ts`, import sob demanda), que nunca lança:
com o Engramind fora do ar o turno usa o último bloco em cache ou segue sem memórias. As abas dos agentes em
`/integracoes/ia` só mostram o link "As memórias deste agente ficam em Memórias" (`/memorias`). O "Resumo de
memórias" (feature `memory-summary`) foi removido; o documento antigo em `ai_feature_settings` e a coleção
`agent_memories` ficam intactos (só o backup da migração lê a coleção).

## Testes

`tests/backend/ai/*` (OpenCode Go: `opencode-go.test.ts`, `opencode-go-tester.test.ts`, `measured-usage.test.ts` e o bloco
do Go em `stream-lazy-providers.test.ts`), `tests/frontend/ai/measured-usage-card.test.tsx`, `tests/backend/core/ai-image-route.test.ts`,
`tests/scripts/seed-data/translation/ai-translator.test.ts`.
