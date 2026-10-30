# Módulo: IA — provedores, agentes e memórias

Camada de IA copiada do Opex (Vercel AI SDK). Substitui o antigo `src/core/ai/genai.ts`
(`@google/genai`), que foi **removido junto com o fallback `GENAI_*`**: não há mais fallback.

## Provedores (`/integracoes/ia`)

| Id | Integração | Uso no DnDicas |
| --- | --- | --- |
| `opencode` | `ai_opencode` | Texto (modelos e agentes das contas do servidor OpenCode 2.x) |
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

## Agentes (abas de `/integracoes/ia`)

Cada agente é uma configuração em `ai_feature_settings` (provedor, modelo, instruções…). Sem
configuração ativa, o uso responde **409 em pt-BR** com o motivo e a tela mostra o aviso — nunca cai
num provedor fixo.

| Aba | Feature | Onde é usado |
| --- | --- | --- |
| Gerador de imagens | `image-generator` | Botão "Gerar com IA" do `GlassImageUploader` (`POST /api/core/ai/image`, login obrigatório) e imagens da importação do 5etools. Provedor Gemini/OpenAI, modelo de imagem, instruções e proporção padrão |
| Entender com IA | `entity-understanding` | Chat por entidade (`POST /api/entity-understanding/chat`, SSE) com as ferramentas `searchCatalogEntities`/`getCatalogEntity`; o formato HTML com menções é fixo |
| Importador 5etools | `entity-import` | Tradução das entidades importadas (`AiTranslator`, telas de geração e scripts de seed) |
| Agente Opex | `opex-agent` | Ver `opex-agent.md` |
| Agente Maddox | `maddox` | Mestre das Campanhas Maddox (aceita o OpenCode, com sessões próprias). Ver `maddox.md` |
| Resumo de memórias | `memory-summary` | Revisa e resume cada memória antes de salvar |

Servidor: `src/features/ai/server/{settings,image-generator,entity-understanding,entity-import,memory-summary}.ts`.
A rota genérica `/api/core/ai` (sem consumidor) foi removida.

## Memórias

Instruções permanentes por lista (`agent_memories`), injetadas no fim das instruções de cada agente
(`memoriesSection`). Sem limite de quantidade por lista; **3–2.000 caracteres** cada; o texto passa pelo Resumo
de memórias (sem ele, grava como veio). Criar/editar/excluir é auditado e avisa em tempo real.

| Lista | Aplicada em |
| --- | --- |
| `opex-global` | Todo turno do Agente Opex |
| `opex-admin` | Só turnos de administradores |
| `opex-user` | Turnos de usuários e visitantes |
| `image-generator` | Toda imagem gerada |
| `entity-understanding` | Toda resposta do Entender com IA |
| `entity-import` | Toda tradução do Importador 5etools |
| `maddox` | Agente Maddox (narrador e entrevistador), a partir das próximas entregas |

Catálogo das listas: `src/features/ai/agents.ts`. API: `/api/ai/agents/[agentId]/memories/**` (admin).
O Agente Opex gerencia as memórias com ferramentas (só em turnos de administradores).

## Testes

`tests/backend/ai/*`, `tests/backend/core/ai-image-route.test.ts`,
`tests/scripts/seed-data/translation/ai-translator.test.ts`.
