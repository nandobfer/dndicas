# Módulo: Agente Maddox (Campanhas Maddox)

Épico DND-2 (issue #192): campanhas narradas pela IA, com o **Maddox** como mestre/narrador. Esta
documentação cobre a **entrega 0 (DND-8, #200)** — modelos no MongoDB e a configuração do agente — e a
**entrega 1 (DND-18, #209)** — lista, criação com rigor, lobby e convite por link (seção "Campanhas").
**Ainda não há IA de narração nem entrevistas** (Maddox 2 em diante).

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
| Memórias | Lista `maddox` de `agent_memories` (mesmo card dos demais agentes, sem limite de quantidade; API `/api/ai/agents/maddox/memories/**`) |

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
  Só uma sessão **comprovadamente inexistente** no OpenCode é substituída: outras falhas (timeout, 401,
  rede) respondem 502 sem tocar no registro. A nova sessão é criada antes de trocar o registro, e o
  índice único parcial (uma `active` por campanha/finalidade/membro) resolve chamadas concorrentes — a
  sessão criada pela chamada perdedora é excluída.
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

Os índices (inclusive os únicos que sustentam regras: `{ kind, version }` dos roteiros, uma sessão `active`
por campanha/finalidade/membro, `sessionId`, `{ campaignId, userId }` dos membros) são garantidos pela migração
**`ensure-maddox-indexes`** (`src/lib/db/migrations/`), já que o autoIndex não roda em models compilados antes
da conexão.

As memórias **de campanha** são diferentes das memórias **do agente** (lista `maddox`, escritas pelo admin).

## API (administradores)

- `GET/PUT /api/ai/features/maddox` — configuração, roteiros vigentes e históricos.
- `GET/PUT /api/ai/features/maddox/scripts/[kind]` (`scenario` | `character`; `GET ?version=N`).
- `POST /api/ai/features/maddox/avatar` — `{ persona }` → `{ url }` (Gerador de imagens; indisponível = 409).
- `GET /api/ai/features/maddox/opencode-sessions`, `DELETE …/opencode-sessions/[id]` → `{ deleted }`
  (`false` = ficou pendente para a rotina).

## Campanhas (Maddox 1)

Permissão Perfix **`maddox.play`** ("Campanhas Maddox › Criar e participar de campanhas"): item
"Campanhas Maddox" do sidebar (`NAV_PERMISSIONS["/campanhas"]`), páginas (`pageAccess`) e todas as rotas
abaixo. A migração **`grant-maddox-play`** concede a chave ao perfil `user` e ao perfil padrão **uma única
vez** (marca em `migration_marks`): se um administrador a retirar depois, ela não volta no boot.

Telas (`src/features/maddox/components/campaigns/`, rotas pt-BR):

| Rota | Conteúdo |
| --- | --- |
| `/campanhas` | Campanhas em que sou **dono ou membro ativo** (`joined`), da mais recente; um card largo por linha (capa ou gradiente na cor do rigor, chips de rigor/status/papel em cores de raridade, meu personagem, avatares dos membros, "atualizada há…"). Clicar abre a campanha. "Nova campanha" abre a criação |
| `/campanhas/[id]` | Cabeçalho, lobby (participantes e personagens), "Criar/Editar personagem", "Editar" (dono), "Sair da campanha" (jogador), "Remover" (dono, com confirmação) e o painel "Convidar jogadores" (dono) |
| `/campanhas/convite/[token]` | Resumo da campanha do link e "Entrar na campanha". Sem login vai ao login e volta; sem a permissão mostra "Acesso restrito" |

**Criação:** nome (3–80) e **slider de rigor** (`RigorCard`), cópia do card de criticidade do agente
adversário do Opex com o `Slider` copiado em `src/components/ui/opex/slider.tsx` (Radix, prop `color` para a
cor de raridade do nível). Abaixo do slider, duas colunas por nível: "Pelas regras do D&D" (`rules`) e
"Livre, na narrativa" (`free`), de `MADDOX_RIGOR_LEVEL_DEFS`. Passo 1 = Narrativo, último = Fiel ao D&D.
Com o Agente Maddox indisponível (`maddoxAvailability`), a criação responde **409 `MADDOX_UNAVAILABLE`** com o
motivo, mostrado no diálogo. A campanha nasce no `lobby` com o criador como membro `owner`; se o membro não
puder ser gravado, a campanha é apagada (sem transação). O dono renomeia a qualquer momento; o **rigor só muda
no lobby** (409 `RIGOR_LOCKED`).

**Convite (só por link):** `invite.token` (32 bytes base64url, `select: false`, índice único parcial) nasce com
a campanha; só o dono o lê (`GET …/invite`) e pode **gerar outro** (`POST …/invite`, com confirmação): o
anterior deixa de valer. Entrar pelo link (`POST /invites/[token]`):

- é idempotente para quem já é membro; quem **saiu** volta; quem foi **removido** recebe 403 `MEMBER_REMOVED`;
- é aceito em qualquer fase, menos `ended`/`archived` (409 `INVITE_CLOSED`) — quem entra depois do início faz
  a entrevista de personagem (Maddox 2) e é apresentado em seguida;
- entradas simultâneas são resolvidas pelo índice único `{ campaignId, userId }`.

**Membros:** quem não é membro recebe **404** (a campanha não é revelada). O dono não sai nem é removido
(409); só o dono remove jogadores (403 para os demais).

**Personagem (esboço):** cada membro cria/edita o próprio personagem com nome (2–60) e retrato opcional
(`GlassImageUploader`, sem geração por IA). Um personagem por membro (`member.characterId`, gravação
condicional resolve corridas), entrevista `pending`; o Maddox 2 completa o perfil pela entrevista. Bloqueado
em campanha encerrada/arquivada.

**Tempo real:** canal privado por usuário **`private-maddox-u-{userId}`** (autorizado em `channel-auth.ts` só
para o próprio usuário). Cada mudança (criação, entrada, saída, remoção, personagem, edição) publica
`maddox.campaign.changed { campaignId }` para todos os membros ativos (e para o removido); a lista e a campanha
recarregam (`useMaddoxCampaignsRealtime`). Sem Pusher, a tela funciona por recarga.

**Auditoria:** entidade `CampanhaMaddox` (criação, edição, novo link, entrada, saída/remoção, personagem).

API (`src/app/api/maddox/campaigns/**`, todas com `maddox.play`, usuário efetivo do "Visualizar como"):

- `GET/POST /api/maddox/campaigns` — minhas campanhas / criar (`{ name, rigor }`).
- `GET/PATCH /api/maddox/campaigns/[id]` — detalhe (membros) / editar (dono).
- `GET/POST /api/maddox/campaigns/[id]/invite` — link atual / gerar outro (dono).
- `DELETE /api/maddox/campaigns/[id]/members/[memberId]` — sair (o próprio) ou remover (dono).
- `PUT /api/maddox/campaigns/[id]/character` — esboço do meu personagem (`{ name, portraitUrl? }`).
- `GET/POST /api/maddox/campaigns/invites/[token]` — resumo do convite / entrar.

Serviço: `server/campaigns.ts`; schemas `campaign-schemas.ts`; DTOs `campaign-types.ts`; hooks
`hooks/useMaddoxCampaigns.ts`.

## Testes

`tests/backend/maddox/*` (configuração, roteiros, avatar, sessões, rotas, `campaigns.test.ts` com MongoDB em
memória, `campaign-routes.test.ts`, `grant-maddox-play.test.ts`) e `tests/frontend/maddox/*`
(`maddox-tab.test.tsx`, `maddox-campaigns.test.tsx`; happy-dom).
