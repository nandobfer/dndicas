# Módulo: Agente Maddox (Campanhas Maddox)

Épico DND-2 (issue #192): campanhas narradas pela IA, com o **Maddox** como mestre/narrador. Esta
documentação cobre a **entrega 0 (DND-8, #200)**: modelos no MongoDB e a configuração do agente. **Não há
IA de narração nem telas de campanha ainda** (Maddox 1 em diante).

Código: `src/features/maddox/` (`constants`, `schemas`, `types`, `script-draft`, `models/`, `server/`,
`hooks/`, `components/settings/`).

## Configuração (`/integracoes/ia?aba=agente-maddox`, só administradores)

Aba **"Agente Maddox"** da página Provedores de IA, em seções (`?secao=`). Geral, JEV e OpenCode formam
um único formulário (trocar de seção mantém o rascunho; o Salvar de qualquer uma grava tudo). Os
roteiros e as memórias salvam à parte.

| Seção | Conteúdo |
| --- | --- |
| Geral | Ativo; **Avatar** (upload/substituição pelo `GlassImageUploader` ou "Gerar com o Gerador de imagens" a partir da persona — 1:1, do peito para cima; só vale depois de salvar); modelo do **Maddox (narrador)** e do **Entrevistador** ("Mesmo do Maddox" = sem provedor próprio); instruções de cada um com "Restaurar padrão" |
| Entrevista: cenário / Entrevista: personagem | Roteiros versionados (abaixo), cada um com "Salvar nova versão do roteiro" e "Desfazer roteiro" |
| JEV | Uma chave por decisão (`MADDOX_JEV_DECISIONS`): pergunta ou ação do jogador, validade de ação livre, pedir teste, início/fim de combate, conhecimento do mestre, fim da entrevista, gerar imagem na cena. **Ainda sem uso** |
| OpenCode | Política das sessões e lista das sessões ativas com "Excluir" (confirmação) |
| Memórias | Lista `maddox` de `agent_memories` (mesmo card dos demais agentes; API `/api/ai/agents/maddox/memories/**`) |

A configuração fica em `ai_feature_settings` (feature `maddox`) com o schema `maddoxSettingsSchema`:
`enabled`, `main` (provedor, modelo, agente, variante, temperatura, tokens), `interviewer` (provedor,
modelo, agente, variante), `instructions`, `interviewerInstructions`, `avatar { url, persona }`,
`opencode { sessionScope, deleteOnCampaignEnd, directory }`, `jev { [decisão]: boolean }`. Campos novos
recebem o padrão ao carregar (`withMaddoxDefaults`). Salvar normaliza (agente só no OpenCode, amostragem
só onde o provedor aceita), confere modelo/variante/agente no catálogo (`assertCatalog`), audita
(`FeatureIA`) e avisa em tempo real (`ai-feature-updated`). Sem configuração ativa, a disponibilidade
explica o motivo em pt-BR.

**Provedores:** todos os de texto, **inclusive o OpenCode** (com seleção de agente). O OpenCode não aceita
as ferramentas do app: a narração com ferramentas (Maddox 4) precisará de outro mecanismo nesse caso
(ex.: MCP do DnDicas exposto ao agente do OpenCode).

## Roteiros das entrevistas

Sem campos nativos: o Maddox conduz a entrevista **livremente**, como o `~/code/roleplay/bootstrap.md`.
Cada roteiro tem um **guia em Markdown** (até 12.000 caracteres) e uma lista ordenável (arrastar, com
`@dnd-kit`) de **tópicos sugeridos em texto livre** (até 30, cada um até 300 caracteres, ativo/inativo).

Versionamento copiado do roteiro do Agente Entrevistador do Ciliar: coleção `maddox_interview_scripts`
(`{ kind, version }` único, documentos imutáveis); a v0 é o padrão do código; cada gravação cria
`version + 1` com notas; versão desatualizada → **409 `VERSION_CONFLICT`**; histórico com "Ver". A
entrevista (Maddox 2) usa a versão com que começou (`campaign.scriptVersions`, `character.interview.scriptVersion`).

## Sessões do OpenCode

`server/opencode-sessions.ts` (copiado da limpeza de sessões do refinamento do Opex), coleção
`maddox_opencode_sessions`:

- `ensureMaddoxSession` reaproveita a sessão ativa da campanha/finalidade se ela ainda existir no
  OpenCode, senão cria (diretório da política ou o da integração). Com `sessionScope = "campaign"`, as
  entrevistas usam a sessão do narrador; com `campaign-and-interviews`, cada entrevista tem a sua.
- `releaseCampaignSessions` (fim/arquivamento, se `deleteOnCampaignEnd`) e o "Excluir" do painel marcam
  `pending-deletion` e tentam excluir na hora; sessão inexistente conta como excluída.
- Rotina interna **`maddox-opencode-sessions-cleanup`** (a cada 60 min) retoma as exclusões pendentes.
- Cliente: `src/lib/ai/opencode-client.ts` (`@opencode/client`, importado sob demanda).

Nada cria sessões nesta entrega: o primeiro uso é o Maddox narrador (Maddox 4).

## Modelos (`src/features/maddox/models/`)

| Coleção | Conteúdo |
| --- | --- |
| `maddox_campaigns` | nome, dono, `rigor` (`narrativo`, `flexivel`, `equilibrado`, `rigoroso`, `fiel-dnd` — cores de raridade de comum a lendário em `MADDOX_RIGOR_LEVEL_DEFS`), status (`lobby`…`archived`), capa, cenário consolidado, versões dos roteiros, turno (número e fase mestre/jogadores) |
| `maddox_campaign_members` | campanha, usuário, papel (dono/jogador), status (convidado, entrou, saiu, removido), personagem; único por campanha+usuário |
| `maddox_characters` | personagem jogável: perfil narrativo (seções), retrato, ficha (`CharacterSheet`) no modo fiel, situação da entrevista |
| `maddox_npcs` | NPC: descrição pública, notas exclusivas do mestre, visibilidade |
| `maddox_campaign_memories` | memórias da campanha (fato, evento, local, missão, relação), visibilidade jogadores/mestre, índice de texto para a busca |
| `maddox_interview_scripts` | versões dos roteiros |
| `maddox_opencode_sessions` | sessões do OpenCode do Maddox |

As memórias **de campanha** são diferentes das memórias **do agente** (lista `maddox`, escritas pelo admin).

## API (administradores)

- `GET/PUT /api/ai/features/maddox` — configuração, roteiros vigentes e históricos.
- `GET/PUT /api/ai/features/maddox/scripts/[kind]` (`scenario` | `character`; `GET ?version=N`).
- `POST /api/ai/features/maddox/avatar` — `{ persona }` → `{ url }` (Gerador de imagens; indisponível = 409).
- `GET /api/ai/features/maddox/opencode-sessions`, `DELETE …/opencode-sessions/[id]` → `{ deleted }`
  (`false` = ficou pendente para a rotina).

## Testes

`tests/backend/maddox/*` (configuração, roteiros, avatar, sessões, rotas) e
`tests/frontend/maddox/maddox-tab.test.tsx` (happy-dom).
