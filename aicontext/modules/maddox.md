# Módulo: Agente Maddox (Campanhas Maddox)

Épico DND-2 (issue #192): campanhas narradas pela IA, com o **Maddox** como mestre/narrador. Esta
documentação cobre a **entrega 0 (DND-8, #200)** — modelos no MongoDB e a configuração do agente — e a
**entrega 1 (DND-18, #209)** — lista, criação com rigor, lobby e convite por link (seção "Campanhas").
A **entrega 2 (DND-12, #206)** — entrevistas de cenário e de personagem — está na seção "Entrevistas
(Maddox 2)". A **entrega 3 (DND-11, #202)** — motor de turnos e tempo real — está em "Mesa e turnos (Maddox 3)".
**Ainda não há IA de narração** (Maddox 4): o mestre da mesa responde com texto simulado.

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
| JEV | Uma chave por decisão (`MADDOX_JEV_DECISIONS`): pergunta ou ação do jogador, validade de ação livre, pedir teste, início/fim de combate, conhecimento do mestre, fim da entrevista, gerar imagem na cena. Em uso: **"Fim da entrevista"** (Maddox 2); as demais ainda sem uso |
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
  OpenCode, senão cria (diretório da política ou o da integração). Com `sessionScope = "campaign"`, a
  entrevista de cenário usa a sessão do narrador; a entrevista de **personagem tem sempre sessão própria por
  membro** (respostas privadas e entrevistas simultâneas não podem dividir o histórico do OpenCode); com
  `campaign-and-interviews`, cada entrevista tem a sua.
  Só uma sessão **comprovadamente inexistente** no OpenCode é substituída: outras falhas (timeout, 401,
  rede) respondem 502 sem tocar no registro. A nova sessão é criada antes de trocar o registro, e o
  índice único parcial (uma `active` por campanha/finalidade/membro) resolve chamadas concorrentes — a
  sessão criada pela chamada perdedora é excluída.
- `releaseCampaignSessions` (fim/arquivamento, se `deleteOnCampaignEnd`) e o "Excluir" do painel marcam
  `pending-deletion` e tentam excluir na hora; sessão inexistente conta como excluída.
- Rotina interna **`maddox-opencode-sessions-cleanup`** (a cada 60 min) retoma as exclusões pendentes.
- Cliente: `src/lib/ai/opencode-client.ts` (`@opencode/client`, importado sob demanda).

As entrevistas (Maddox 2) são o primeiro uso: com o OpenCode como provedor do entrevistador, cada turno fixa
a sessão gerenciada (`sessionId`, modo `existing` no `ai-sdk-provider-opencode-sdk`; o OpenCode guarda o
histórico e só a última fala é enviada). `ensureMaddoxSession` recebe o `agent` (no OpenCode 2 o agente é
estado da sessão). Ao concluir, `releaseInterviewSession` libera a sessão própria da entrevista; com "uma
sessão por campanha", a entrevista usou a do narrador, que continua.

## Modelos (`src/features/maddox/models/`)

| Coleção | Conteúdo |
| --- | --- |
| `maddox_campaigns` | nome, dono, `rigor` (`narrativo`, `flexivel`, `equilibrado`, `rigoroso`, `fiel-dnd` — cores de raridade de comum a lendário em `MADDOX_RIGOR_LEVEL_DEFS`), status (`lobby`…`archived`), capa, cenário consolidado, versões dos roteiros, turno (número e fase mestre/jogadores) |
| `maddox_campaign_members` | campanha, usuário, papel (dono/jogador), status (convidado, entrou, saiu, removido), personagem; único por campanha+usuário |
| `maddox_characters` | personagem jogável: perfil narrativo (seções), retrato, ficha (`CharacterSheet`) no modo fiel, situação da entrevista |
| `maddox_npcs` | NPC: descrição pública, notas exclusivas do mestre, visibilidade |
| `maddox_campaign_memories` | memórias da campanha (fato, evento, local, missão, relação), visibilidade jogadores/mestre, índice de texto para a busca |
| `maddox_interview_scripts` | versões dos roteiros |
| `maddox_interviews` | entrevistas (Maddox 2): conversa (`messages`), versão do roteiro, status, trava `generating`, resultado consolidado; única por `{ campaignId, kind, memberId }` |
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

## Entrevistas (Maddox 2)

Código: `server/interviews.ts` (início, mensagens, nova tentativa, trava, JEV, OpenCode),
`server/interview-consolidation.ts` (conclusão), `server/interview-prompt.ts` (módulo puro: instruções,
marcador, JSON), `server/interview-stream.ts` (NDJSON), `interview-schemas.ts`, `interview-types.ts`,
`hooks/useMaddoxInterview.ts`, `components/interviews/`.

**Fluxo e status.** Criar a campanha leva o dono a `/campanhas/[id]/entrevista/cenario`. "Começar entrevista"
grava a versão vigente do roteiro (`campaign.scriptVersions.scenario`), muda a campanha para **`interview`**
("Em entrevista") e `scenarioInterview.status` para `in-progress`, e **trava o rigor** (409 `RIGOR_LOCKED` daí em
diante, mesmo de volta ao lobby). Concluir grava o cenário e volta a campanha a **`lobby`**, com
`scenarioInterview.status = "done"`. Convites continuam abertos durante a entrevista. O "Iniciar campanha" e o
status `active` são do Maddox 3 (seção abaixo).

| Regra | Comportamento |
| --- | --- |
| Cenário | Só o dono (403 para jogadores; 404 para quem não participa) |
| Personagem | Cada membro, depois do cenário `done` (409 `SCENARIO_PENDING`) e com o esboço criado (409 `CHARACTER_DRAFT_REQUIRED`; a tela abre o diálogo de nome/retrato). Grava `character.interview.scriptVersion` e, se vazio, `campaign.scriptVersions.character` |
| Campanha encerrada/arquivada | 409 `CAMPAIGN_CLOSED` |
| Uma geração por vez | Trava `generating` condicional; ocupada = 409 `INTERVIEW_BUSY`; trava com mais de 5 min é retomada |
| Limite | 200 mensagens (409 `INTERVIEW_TOO_LONG`); cada resposta até 4.000 caracteres (Zod) |
| Concluída | Não reabre (409 `INTERVIEW_DONE`); nome e retrato seguem editáveis |
| Pronto para jogar | `isMemberReadyToPlay` (entrevista `done`) → `member.ready` no DTO; `assertMemberCanPlay` responde 409 `INTERVIEW_REQUIRED`. **Toda ação de jogo chama `assertMemberCanPlay` no servidor** (iniciar a campanha, declarar, passar, perguntar, pular jogador — `server/game.ts`); o selo e os botões da tela não bastam |
| Nome e retrato depois da entrevista | Continuam editáveis no lobby; a mudança é propagada à ficha D&D ligada (`name` e, se houver retrato, `photo`). O `result` gravado na entrevista é o registro histórico e não muda |
| Visibilidade | A conversa é só de quem é entrevistado; cenário, situação inicial e perfis ficam visíveis a todos os membros; o link da ficha só para o dono do personagem |

**Instruções** (`buildInterviewInstructions`): instruções do entrevistador + entrevista atual + rigor (colunas
`rules`/`free`) + no personagem o cenário, a situação inicial e os outros personagens (e, a partir de Equilibrado, o
pedido de raça/classe/origem/atributos) + o guia da **versão gravada** + os **tópicos ativos numerados na ordem
do roteiro** + o protocolo de conclusão. Modelo: o do entrevistador ou, sem provedor próprio, o do Maddox (com
temperatura e tokens). Indisponível = 409 `MADDOX_UNAVAILABLE`. Consumo medido na origem `maddox-interview`.

**Conversa.** Os provedores sem sessão recebem o histórico gravado (`messages`, abertura como primeira fala do
usuário). A geração **não depende da conexão**: se o navegador fechar, a resposta é gravada mesmo assim; outras
abas recarregam pelo evento `maddox.interview.changed { campaignId, kind }` no canal do próprio usuário. Falha
do provedor grava a mensagem com `error` e a tela oferece "Tentar de novo".

**Conclusão.** Com base suficiente, o Maddox apresenta a síntese e termina com a linha
`[[MADDOX_PROPOSTA_DE_CONCLUSAO]]`. O servidor a remove (o filtro do stream segura o marcador mesmo partido entre
deltas), grava `proposal: true` e o status `proposed`, e a tela mostra **"Confirmar e concluir"**. Uma nova
resposta (pedido de ajuste) desfaz a proposta. Com a chave JEV **"Fim da entrevista"** ligada, o JEV (`jev-latest`,
pergunta `noul`) avalia após cada resposta se já há base suficiente e, se sim, o turno ganha a orientação de
propor a síntese; falha do JEV é ignorada.

Ao confirmar, uma geração **efêmera** (não suja a sessão do narrador) consolida a conversa em JSON validado por Zod,
com uma nova tentativa; inválido duas vezes = 502 `CONSOLIDATION_FAILED` sem gravar nada. Os textos gerados
**não têm teto de tamanho** no schema (um campo longo nunca invalida a consolidação); só raça/classe/subclasse/
origem são cortadas em 2.000 caracteres ao gravar na ficha (`maxlength` dela) e o nome fora de 2..60 é ignorado.
A conclusão revalida `proposed` depois de pegar a trava (`NO_PROPOSAL` se outra aba enviou um ajuste) e grava o
cenário/perfil **antes** de marcar a entrevista como `done`: uma falha no meio deixa `proposed` e confirmar de
novo reaplica. Uma nova resposta só é gravada depois de o turno ser preparado (entrevistador, roteiro, sessão do
OpenCode): falha na preparação não deixa mensagem órfã.

- **Cenário:** `campaign.setting` (Markdown nas seções de `MADDOX_SETTING_SECTIONS`: universo, cânone, contexto,
  regras internas, tom), `campaign.openingSituation` e, se um nome foi combinado, a campanha é renomeada (auditado).
- **Personagem:** `character.profile` nas seções de `MADDOX_PROFILE_SECTIONS` (identidade, origem,
  personalidade, capacidades, equipamentos, relações, condição; vazias = "a definir durante a história") e o nome
  combinado. A partir do rigor **Equilibrado** (`MADDOX_SHEET_RIGORS`) cria também a **ficha D&D**
  (`createBlankSheet` + raça, classe, subclasse, origem, aparência e medidas, retrato, nível 1 e atributos de 1 a
  30 — fora disso é descartado). `raceRef`/`classRef`/`originRef` por nome exato no catálogo (sem acento e sem
  caixa); sem correspondência fica só o texto. A ficha é ligada ao personagem logo ao ser criada (nova tentativa
  reaproveita). Ela aparece também em "Minhas fichas" do jogador.

Auditoria (`CampanhaMaddox`): início e conclusão de cada entrevista (versão do roteiro, rigor, ficha criada) e
a renomeação. O conteúdo das mensagens não é auditado.

API (todas com `maddox.play`, usuário efetivo; `[kind]` = `scenario` | `character`, outro valor = 404):

- `GET /api/maddox/campaigns/[id]/interviews/[kind]` — `{ interview | null, maddoxAvatarUrl }`.
- `POST …/interviews/[kind]` — começa e transmite a abertura em **NDJSON**; já começada devolve JSON.
- `POST …/interviews/[kind]/messages` — `{ content }`: grava e transmite a resposta do Maddox.
- `POST …/interviews/[kind]/retry` — gera de novo a última resposta que falhou.
- `POST …/interviews/[kind]/complete` — consolida e devolve o detalhe da campanha.

Linhas do NDJSON: `user`, `delta`, `done { message, interview }`, `error { message, interview? }`, `ping`.

Telas: `/campanhas/[id]/entrevista/cenario` e `/campanhas/[id]/entrevista/personagem` (`pageAccess`). No lobby, o
card **"Cenário"** (começar/continuar para o dono, espera para os jogadores, cenário salvo recolhível), chips da
entrevista por participante, "Entrevista do personagem" (desabilitada até o cenário), selo "Pronto para jogar",
"Ver perfil" e "X de N prontos para jogar".

`src/lib/ai/stream.ts` ganhou `messages` (conversa) e `opencodeSessionId` (sessão fixa) no `AiStreamRequest`.

**Formato e menções do catálogo.** As instruções do entrevistador têm uma seção fixa "Formato da resposta"
(`MADDOX_RESPONSE_FORMAT`, no código, independente da aba): Markdown em blocos curtos, `###` por assunto, listas,
citação para ambientação e **negrito** para nomes próprios do mundo e ênfase. **Negrito nunca vira menção.** Para
citar uma entidade do catálogo, o modelo escreve a marcação explícita com o tipo `{{Tipo:Nome oficial}}` (ex.:
`{{Raça:Elfo}}`, `{{Magia:Bola de Fogo}}`; tipos = `catalogEntityTypes`), e é proibido usá-la para personagens,
jogadores, lugares ou o que foi criado na campanha. O módulo puro `catalog-markup.ts` define a marcação; o servidor
(`server/catalog-mentions.ts`) busca cada citação **só no tipo declarado** (o mesmo `searchCatalogEntities` do
`search_catalog` do Opex, só ativas) e troca o que bate exatamente — sem acento e sem caixa, pelo nome ou nome
original — por `[Nome](#mention:Tipo:id)`, que o `Markdown` mostra como o badge clicável do DnDicas.

- **Nomes reservados** (`campaignReservedNames`): nome da campanha, personagens da mesa e nome/usuário dos jogadores
  (inteiros e cada palavra de 3+ letras) nunca viram menção, mesmo com a marcação. Ex.: a personagem "Lyra
  Ventobravo" não vira o monstro "Lyra".
- Tipo inválido, sem correspondência, nome reservado ou falha da busca (aviso no log): vira `**Nome**`. A marcação
  nunca aparece crua: o stream passa por `createMarkupFilter` (segura uma marcação partida entre pedaços) e a tela
  aplica `liveMarkupToBold` ao texto ao vivo.
- O histórico enviado ao modelo e a transcrição da consolidação voltam as menções para a marcação
  (`mentionsToMarkup`). A consolidação pede a mesma marcação; cenário, situação inicial e perfil passam pela mesma
  resolução com os nomes reservados. Até 25 citações por texto.

**Tela da entrevista.** Largura total (sem `mx-auto`/`max-w-*`), painel de altura própria no padrão do chat do
Opex (conversa com rolagem interna e "Ir para o fim", proposta e campo de resposta no rodapé), fala do Maddox
numa bolha neutra (`rounded-2xl`, borda sutil na cor do rigor) com o nome na cor do rigor, pontinhos e cursor dentro
dela; avatar de tamanho fixo alinhado ao topo (`h-7 w-7 self-start shrink-0`), que não estica com a fala. No lobby, o link
de convite fica numa linha e "Copiar link"/"Gerar novo link" abaixo.

## Mesa e turnos (Maddox 3)

Código: `server/game.ts` (motor), `server/game-presence.ts` (presença), `server/game-master.ts` (interface do
mestre) e `server/game-mock.ts` (mestre simulado), `game-schemas.ts`, `game-types.ts`, `game-view.ts` (regras puras da
tela), `hooks/useMaddoxGame.ts`, `components/game/`, coleção `maddox_campaign_messages`.

**Iniciar.** O dono clica **"Iniciar campanha"** no lobby (com confirmação). Exige o cenário `done` (409
`SCENARIO_PENDING`), a **própria entrevista de personagem concluída** (`assertMemberCanPlay`, 409 `INTERVIEW_REQUIRED`) e a
campanha no `lobby` (outra fase = 409 `CAMPAIGN_ALREADY_STARTED`; a troca `lobby → active` é condicional, então dois
cliques não iniciam duas vezes). Só o dono (403). Auditado (`CampanhaMaddox`, `status: active, turn: 1`). Com a campanha
em andamento, o lobby mostra "Em andamento · Turno N · fase" e **"Entrar na mesa"** para todos.

**Turnos** (estado em `campaign.turn`: `number`, `phase`, `startedAt`, `eligibleMemberIds`, `declaredMemberIds`, `generating`):

| Regra | Comportamento |
| --- | --- |
| Numeração | `number` sobe a cada turno do mestre (1 = abertura); o turno dos jogadores seguinte tem o mesmo número |
| Turno do mestre | Pega a trava `generating { token }`, narra (mock) as declarações do turno anterior, grava a narração e abre o turno dos jogadores. Trava com mais de 2 min (`MADDOX_MASTER_LOCK_STALE_MS`) é retomada no `GET …/game` ou no `check`. Falha do mestre libera a trava, grava `turn.failedAt` e **não avisa a mesa**; a nova tentativa só acontece depois de 30 s (`MADDOX_MASTER_RETRY_MS`), no `GET`/`check` (a tela recarrega nesse intervalo enquanto o mestre está sem geração), sem laço de retomadas. A narração já gravada do turno é reaproveitada (sem duplicar) |
| Elegíveis | Fixados ao abrir o turno dos jogadores: membros `joined` com a entrevista concluída. **Quem entra ou conclui a entrevista no meio do turno joga a partir do próximo** (409 `NEXT_TURN`). Se a lista ficar vazia (todos saíram), quem estiver pronto entra no turno atual |
| Presentes | Jogadores com a **mesa aberta** (canal de presença do Pusher). O turno fecha quando **todos os elegíveis presentes** declararam ou passaram **e** há ao menos uma declaração no turno (mesa toda offline não avança sozinha). Elegível offline não trava; se voltar, passa a contar |
| Presença desconhecida | Pusher sem configuração ou falha na consulta = **todos os elegíveis** contam (nunca fecha antes da hora), com log. A tela avisa "Sem tempo real…" e recarrega a cada 5 s |
| Declarar / "Não fazer nada" | Uma por membro e turno (índice único parcial `{ campaignId, turnNumber, memberId }` com `turnAction: true`; repetir = 409 `ALREADY_DECLARED`). Grava a mensagem e conta em `declaredMemberIds` por update condicional; se o turno fechou no meio, apaga a mensagem e responde 409 `TURN_CLOSED`. A declaração é final |
| Pergunta ao mestre | Escolha explícita ("Perguntar ao mestre"). Só no turno dos jogadores e para elegíveis, mesmo depois de declarar; o mestre responde (mock) na hora, ligado à pergunta (`replyToId`), **sem mudar o turno** |
| Turno do mestre em curso | Ações = 409 `MASTER_TURN` |
| Fechamento | Update condicional (`number`, `phase: players`): só uma chamada vence e roda o mestre — declarações simultâneas e vários `check` geram uma única narração |
| Pular jogador | Só o dono (403), que também precisa estar pronto para jogar; registra "não fez nada" no lugar de um elegível que ainda não declarou (`skippedBy`), só no turno atual, com confirmação e auditoria |
| Saída/remoção | `removeMember` grava, audita e avisa a saída e só depois chama `onMemberLeftGame` (o membro sai dos elegíveis e o turno é reavaliado); falha nessa reavaliação é logada e não desfaz a saída |
| Campanha fora de `active` | Ações = 409 `CAMPAIGN_NOT_ACTIVE` |

Ainda fora do escopo: pausar/encerrar a campanha, editar uma declaração enviada, IA e streaming da narração (Maddox 4).

**Mestre simulado.** `getMaddoxMaster()` devolve `mockMaddoxMaster` (interface `MaddoxMaster { narrate, answer }`). A
abertura usa a situação inicial do cenário; os turnos seguintes resumem cada personagem ("**Lyra** — “…”", "preferiu
esperar") e terminam com "O que vocês fazem?". Todo texto leva o aviso de narração/resposta simulada. O Maddox 4 troca a
implementação.

**Presença.** Canal **`presence-maddox-c-{campaignId}`** (`maddoxCampaignPresenceChannel`), assinado só pela tela da mesa.
`/api/pusher/auth` exige `maddox.play` e confere no banco que o usuário é **membro `joined`** (`isActiveCampaignMember`);
`user_id` = usuário efetivo (várias abas contam uma vez). O servidor consulta quem está online pela API HTTP do Pusher
(`GET /channels/{canal}/users`, aceita pelo Soketi), nunca pelo cliente. Quando alguém sai (`pusher:member_removed`), os
outros clientes chamam `POST …/game/check` (debounce de 1,5 s), que reavalia o turno — qualquer membro pode chamá-lo, mesmo
quem só assiste, porque não grava nada em nome de ninguém.

**Tempo real dos dados.** Cada mudança publica **`maddox.game.changed { campaignId, turnNumber, phase }`** no canal de
cada membro ativo (`private-maddox-u-{userId}`); mesa e lobby recarregam. Todos recebem os mesmos dados (as declarações
aparecem para todos na hora); só `me` muda por usuário.

**Tela `/campanhas/[id]/mesa`** (`pageAccess`): cabeçalho com rigor, "Turno N" e a faixa da fase ("Turno dos jogadores — X
de N jogador(es) online já declararam" / "Turno do mestre — o Maddox está narrando…"); conversa no padrão do chat do Opex
(divisor por turno, Maddox com avatar e cor do rigor, declarações com o retrato do personagem — as minhas à direita —,
pergunta e resposta ligadas, "Fulano não fez nada (pulado por …)", "Carregar anteriores" com cursor); campo com
**Declarar** (Ctrl/⌘+Enter; Enter sozinho só quebra linha), **Perguntar ao mestre** e **Não fazer nada**, bloqueado com o
motivo em pt-BR (turno do mestre, próximo turno, entrevista pendente com link); painel "Na mesa" com presença (ponto
online/offline) e a situação em cores de raridade (Declarou, Aguardando, Offline (não conta), Entra no próximo turno,
Preparando personagem) e **"Pular"** para o dono.

API (todas com `maddox.play`, usuário efetivo; quem não participa = 404):

- `POST /api/maddox/campaigns/[id]/start` — inicia (dono).
- `GET /api/maddox/campaigns/[id]/game` — estado da mesa (até 100 mensagens mais recentes, `hasMore`).
- `GET …/game/messages?before=<id>` — mensagens anteriores (cursor inválido = 400).
- `POST …/game/actions` — `{ kind: "declaration" | "question", content (1..4.000) }` ou `{ kind: "pass" }`.
- `POST …/game/skip` — `{ memberId }` (dono).
- `POST …/game/check` — reavalia o turno.

## Testes

`tests/backend/maddox/*` (configuração, roteiros, avatar, sessões, rotas, `campaigns.test.ts` com MongoDB em
memória, `campaign-routes.test.ts`, `grant-maddox-play.test.ts`) e `tests/frontend/maddox/*`
(`maddox-tab.test.tsx`, `maddox-campaigns.test.tsx`, `maddox-campaigns-realtime.test.tsx`; happy-dom).
Maddox 2: `interview-prompt.test.ts`, `interviews.test.ts` (MongoDB em memória, IA/JEV/OpenCode mockados),
`interview-routes.test.ts`, `catalog-mentions.test.ts`, `catalog-markup.test.ts` e `tests/frontend/maddox/maddox-interview.test.tsx`.
Maddox 3: `game.test.ts` (MongoDB em memória, presença mockada: 1/2/5 jogadores, "Não fazer nada", pergunta, entrada no
meio, presença, pular, saída, concorrência, trava do mestre, paginação), `game-routes.test.ts`, `game-presence-auth.test.ts`
(API de presença e `/api/pusher/auth`), `tests/backend/integrations/channel-auth.test.ts` e
`tests/frontend/maddox/maddox-game.test.tsx` (mesa, happy-dom); o lobby com "Iniciar campanha"/"Entrar na mesa" em
`maddox-campaigns.test.tsx`.
