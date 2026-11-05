# Módulo: Agente Maddox (Campanhas Maddox)

Épico DND-2 (issue #192): campanhas narradas pela IA, com o **Maddox** como mestre/narrador. Esta
documentação cobre a **entrega 0 (DND-8, #200)** — modelos no MongoDB e a configuração do agente — e a
**entrega 1 (DND-18, #209)** — lista, criação com rigor, lobby e convite por link (seção "Campanhas").
A **entrega 2 (DND-12, #206)** — entrevistas de cenário e de personagem — está na seção "Entrevistas
(Maddox 2)". A **entrega 3 (DND-11, #202)** — motor de turnos e tempo real — está em "Mesa e turnos (Maddox 3)".
A **entrega 4 (DND-9, #201)** — o Maddox narrador com ferramentas e streaming — está em "Narrador (Maddox 4)".
A **entrega 5 (DND-16, #208)** — fichas e testes de atributo/perícia/resistência pedidos pelo Maddox — está em "Fichas e testes (Maddox 5)".
A **entrega 6 (DND-13, #205)** — combate narrativo (cinemático, sem iniciativa) — está em "Combate narrativo (Maddox 6)".
A **entrega 8 (DND-14, #204)** — modo fiel ao D&D: mundo, povos e classes restritos ao catálogo — está em "Modo fiel ao D&D (Maddox 8)".
A **entrega 10 (DND-10, #203)** — imagens nas cenas (situações e frequência configuráveis, pedido manual do dono e retrato de NPC) — está
em "Imagens nas cenas (Maddox 10)". A **DND-22 (#230)** — densidade das narrações e a aba Imagens no diário — está em "Densidade
das narrações e imagens no diário (DND-22)".

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
| Imagens | Imagens nas cenas (Maddox 10): chave geral, situações fixas e personalizadas, intervalo, teto diário, proporção e estilo (seção "Imagens nas cenas (Maddox 10)") |
| JEV | Uma chave por decisão (`MADDOX_JEV_DECISIONS`): pergunta ou ação do jogador, validade de ação livre, pedir teste, início/fim de combate, conhecimento do mestre, fim da entrevista, gerar imagem na cena. Em uso: **"Fim da entrevista"** (Maddox 2), **"Validade de ação livre"** (Maddox 4, só Rigoroso e Fiel ao D&D), **"Pedir teste"** (Maddox 5, orientação ao narrador nos graus com testes) e **"Início ou fim de combate"** (Maddox 6, orientação ao narrador nos graus com combate narrativo), **"Custo de ação no combate"** (Maddox 7) e **"Gerar imagem na cena"** (Maddox 10, filtro da imagem pedida pelo narrador); as demais ainda sem uso |
| OpenCode | Política das sessões e lista das sessões ativas com "Excluir" (confirmação) |

A configuração fica em `ai_feature_settings` (feature `maddox`) com o schema `maddoxSettingsSchema`:
`enabled`, `main` (provedor, modelo, agente, variante, temperatura, tokens), `interviewer` (provedor,
modelo, agente, variante), `instructions`, `interviewerInstructions`, `avatar { url, persona }`,
`opencode { deleteOnCampaignEnd, directory, mcpUrl }`, `jev { [decisão]: boolean }`. Campos novos
recebem o padrão ao carregar (`withMaddoxDefaults`). Salvar normaliza (agente só no OpenCode, amostragem
só onde o provedor aceita), confere modelo/variante/agente no catálogo (`assertCatalog`), audita
(`FeatureIA`) e avisa em tempo real (`ai-feature-updated`). Sem configuração ativa, a disponibilidade
explica o motivo em pt-BR.

**Provedores:** todos os de texto, **inclusive o OpenCode** (com seleção de agente). O OpenCode não aceita
as ferramentas do app pela AI SDK: no narrador (Maddox 4) elas chegam ao agente pelo **MCP do Maddox**
(`/api/maddox/mcp`, seção "Narrador (Maddox 4)"). A seção OpenCode ganhou a **URL do MCP do Maddox** (`opencode.mcpUrl`,
vazia = `NEXT_PUBLIC_APP_URL`/`AUTH_URL` + `/api/maddox/mcp`) e o card **"MCP do Maddox"** (situação no OpenCode,
"Registrar no OpenCode" e o trecho do `opencode.json` para configurar à mão).

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

- **Sessões nunca compartilhadas** (DND-24): o narrador tem uma por campanha, a entrevista de cenário uma por
  campanha e a de **personagem uma por membro** (respostas privadas e entrevistas simultâneas não podem dividir o
  histórico do OpenCode). Não há política de escopo (o antigo `sessionScope` é descartado ao carregar).
- `ensureMaddoxSession` reaproveita a sessão ativa da campanha/finalidade se ela ainda existir no
  OpenCode, senão cria (diretório da política ou o da integração). A sessão do narrador nunca é excluída por uma
  entrevista; se sumir do OpenCode, é recriada no próximo turno.
  Só uma sessão **comprovadamente inexistente** no OpenCode é substituída: outras falhas (timeout, 401,
  rede) respondem 502 sem tocar no registro. A nova sessão é criada antes de trocar o registro, e o
  índice único parcial (uma `active` por campanha/finalidade/membro) resolve chamadas concorrentes — a
  sessão criada pela chamada perdedora é excluída.
- **Modelo, variante e agente são estado da sessão** no OpenCode 2, e o `ai-sdk-provider-opencode-sdk` não os
  reenvia no modo `existing`: sem eles, a sessão gera com o modelo padrão do servidor (causa do DND-24, em que o
  gateway recusava um modelo que ninguém configurou). `ensureMaddoxSession` recebe `model`/`variant`/`agent`, envia
  `model: { providerID, id, variant? }` (`opencodeModelRef`, divide na primeira `/`) no `session.create` e, na
  reutilização, compara o `model`/`agent` do `session.get` e chama `session.switchModel`/`switchAgent` quando
  diferem (agente vazio na configuração não troca). Falha na troca = 502 `OPENCODE_SESSION_UNAVAILABLE` com o modelo
  na mensagem, sem gerar.
- `releaseCampaignSessions` e o "Excluir" do painel marcam `pending-deletion` e tentam excluir na hora; sessão
  inexistente conta como excluída.
- Rotina interna **`maddox-opencode-sessions-cleanup`** (a cada 60 min): com `deleteOnCampaignEnd`, põe na fila as
  sessões ativas de campanhas `ended`/`archived` ou que já não existem; depois retoma as exclusões pendentes.
- **Agente `maddox` no servidor OpenCode** (recomendado nos dois cards de modelo): `~/.config/opencode/agents/maddox.md`
  na máquina do OpenCode, `mode: primary`, permissões negando tudo e liberando só as ferramentas do MCP
  `dndicas-maddox`. Sem agente, a sessão usa o padrão do servidor (`build`, com bash e edição de arquivos).
- Cliente: `src/lib/ai/opencode-client.ts` (`@opencode/client`, importado sob demanda).

As entrevistas (Maddox 2) são o primeiro uso: com o OpenCode como provedor do entrevistador, cada turno fixa
a sessão gerenciada (`sessionId`, modo `existing` no `ai-sdk-provider-opencode-sdk`; o OpenCode guarda o
histórico e só a última fala é enviada). `ensureMaddoxSession` recebe o `agent` (no OpenCode 2 o agente é
estado da sessão). Ao concluir, `releaseInterviewSession` exclui a sessão própria da entrevista; a do narrador
continua.

## Modelos (`src/features/maddox/models/`)

| Coleção | Conteúdo |
| --- | --- |
| `maddox_campaigns` | nome, dono, `rigor` (`narrativo`, `flexivel`, `equilibrado`, `rigoroso`, `fiel-dnd` — cores de raridade de comum a lendário em `MADDOX_RIGOR_LEVEL_DEFS`), status (`lobby`…`archived`), capa, cenário consolidado, `worldCatalog` (povos e classes do mundo no Fiel ao D&D, Maddox 8), versões dos roteiros, turno (número e fase mestre/jogadores) |
| `maddox_campaign_members` | campanha, usuário, papel (dono/jogador), status (convidado, entrou, saiu, removido), personagem; único por campanha+usuário |
| `maddox_characters` | personagem jogável: perfil narrativo (seções), retrato, ficha (`CharacterSheet`) no modo fiel, situação da entrevista |
| `maddox_npcs` | NPC: descrição pública, notas exclusivas do mestre, visibilidade |
| `maddox_campaign_memories` | memórias da campanha (fato, evento, local, missão, relação), visibilidade jogadores/mestre; listadas e buscadas no Diário da campanha (Maddox 9) |
| `maddox_interview_scripts` | versões dos roteiros |
| `maddox_interviews` | entrevistas (Maddox 2): conversa (`messages`), versão do roteiro, status, trava `generating`, resultado consolidado, `build` (ficha) e `world` (povos e classes do cenário no Fiel); única por `{ campaignId, kind, memberId }` |
| `maddox_opencode_sessions` | sessões do OpenCode do Maddox |
| `maddox_scene_images` | imagens nas cenas (Maddox 10): origem, vaga (`auto`/`manual`/`portrait`), situação, descrição (só servidor), legenda, referências, situação da geração, `counts` (ocupa a cota), URL; uma automática por turno (índice único parcial) |

Os índices (inclusive os únicos que sustentam regras: `{ kind, version }` dos roteiros, uma sessão `active`
por campanha/finalidade/membro, `sessionId`, `{ campaignId, userId }` dos membros) são garantidos pela migração
**`ensure-maddox-indexes`** (`src/lib/db/migrations/`), já que o autoIndex não roda em models compilados antes
da conexão.

As memórias **de campanha** são diferentes das memórias **do agente** (canal `dndicas/maddox` no Engramind, lido
pelo narrador e pelo entrevistador; a aba mostra só o link para `/memorias`).

### Memórias de campanha no Engramind (DND-21)

O MongoDB continua sendo a fonte do jogo e do Diário; cada memória de campanha tem um **espelho em mão dupla**
no Engramind (`src/features/engramind/server/campaign-mirror.ts`, detalhes em `engramind.md`):

- canais `dndicas/maddox/campanhas/<campaignId>/jogadores` e `…/mestre` (`visibility`), criados **na criação
  da campanha** junto com as categorias `FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO` e `OUTRO` (`kind`);
- campos novos: `engramindMemoryId`, `engramindVersion` (anti-laço), `hiddenAt` (arquivada na rede: fora do
  Diário, do contexto e da busca do narrador), `engramindSyncPending` e `engramindSyncError` (o cron reenvia);
- `save_memory` espelha sem esperar e reexibe uma escondida com o mesmo tipo + título; o marco do combate
  também espelha; `search_memories` busca no Engramind (os dois canais) e cai para a busca do Mongo;
- campanha `archived` arquiva os dois canais; saindo de `archived`, restaura.


## API (administradores)

- `GET/PUT /api/ai/features/maddox` — configuração, roteiros vigentes e históricos.
- `GET/PUT /api/ai/features/maddox/scripts/[kind]` (`scenario` | `character`; `GET ?version=N`).
- `POST /api/ai/features/maddox/avatar` — `{ persona }` → `{ url }` (Gerador de imagens; indisponível = 409).
- `GET /api/ai/features/maddox/opencode-sessions`, `DELETE …/opencode-sessions/[id]` → `{ deleted }`
  (`false` = ficou pendente para a rotina).
- `GET /api/ai/features/maddox/opencode-mcp` — situação do MCP do Maddox no OpenCode; `POST` adiciona e conecta se faltar
  (Maddox 4).

## Campanhas (Maddox 1)

Permissão Perfix **`maddox.play`** ("Campanhas Maddox › Criar e participar de campanhas"): item
"Campanhas Maddox" da categoria **Campanhas** do header (`NAV_PERMISSIONS["/campanhas"]`; sem a permissão, a categoria não aparece), páginas (`pageAccess`) e todas as rotas
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

**Chat em tela inteira (entrevista e mesa).** A tela do chat é uma coluna com a altura da área útil
(`lg:h-[calc(100dvh_-_7rem_-_var(--view-as-banner-height,0px))] lg:min-h-[640px]`; no celular, a entrevista usa 6rem e
`min-h-[480px]`; a faixa "Visualizar como", só durante a simulação, publica a altura real em `--view-as-banner-height`) com o
**cabeçalho compacto e fixo** `CampaignChatHeader` (`components/CampaignChatHeader.tsx`: `sticky top-16 z-20`, quase opaco,
seta "Voltar à campanha", título, subtítulo, chips, ações à direita com `ml-auto` e, na mesa, a faixa do turno
`turn-banner` na segunda linha) e o chat em `min-h-0 flex-1`. Na mesa, a grade chat + ferramentas é `lg:flex-1`; o painel
do chat é `h-[80dvh] min-h-[480px] lg:h-full` e a coluna lateral ("Na mesa", "NPCs conhecidos") rola sozinha
(`lg:overflow-y-auto`). A entrada só esmaece (sem deslocamento vertical). As telas sem chat (antes de começar,
aguardando, sem personagem, concluída, mesa fora de jogo) mantêm o cabeçalho grande e o link "Voltar à campanha".

**Tela da entrevista.** Largura total (sem `mx-auto`/`max-w-*`), painel de altura própria no padrão do chat do
Opex (conversa com rolagem interna e "Ir para o fim", proposta e campo de resposta no rodapé), fala do Maddox
numa bolha neutra (`rounded-2xl`, borda sutil na cor do rigor) com o nome na cor do rigor, pontinhos e cursor dentro
dela; avatar de tamanho fixo alinhado ao topo (`h-7 w-7 self-start shrink-0`), que não estica com a fala. No lobby, o link
de convite fica numa linha e "Copiar link"/"Gerar novo link" abaixo.

## Mesa e turnos (Maddox 3)

Código: `server/game.ts` (motor), `server/game-presence.ts` (presença), `server/game-master.ts` (interface do
mestre; desde o Maddox 4 o narrador com IA de `server/narrator.ts`), `game-schemas.ts`, `game-types.ts`, `game-view.ts` (regras puras da
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
| Turno do mestre | Pega a trava `generating { token }`, narra (narrador com IA, em segundo plano) as declarações do turno anterior, grava a narração e abre o turno dos jogadores. Trava com mais de 2 min (`MADDOX_MASTER_LOCK_STALE_MS`) é retomada no `GET …/game` ou no `check`. Falha do mestre libera a trava, grava `turn.failedAt` e **não avisa a mesa**; a nova tentativa só acontece depois de 30 s (`MADDOX_MASTER_RETRY_MS`), no `GET`/`check` (a tela recarrega nesse intervalo enquanto o mestre está sem geração), sem laço de retomadas. A narração já gravada do turno é reaproveitada (sem duplicar) |
| Elegíveis | Fixados ao abrir o turno dos jogadores: membros `joined` com a entrevista concluída. **Quem entra ou conclui a entrevista no meio do turno joga a partir do próximo** (409 `NEXT_TURN`). Se a lista ficar vazia (todos saíram), quem estiver pronto entra no turno atual |
| Presentes | Jogadores com a **mesa aberta** (canal de presença do Pusher). O turno fecha quando **todos os elegíveis presentes** declararam ou passaram **e** há ao menos uma declaração no turno (mesa toda offline não avança sozinha). Elegível offline não trava; se voltar, passa a contar |
| Presença desconhecida | Pusher sem configuração ou falha na consulta = **todos os elegíveis** contam (nunca fecha antes da hora), com log. A tela avisa "Sem tempo real…" e recarrega a cada 5 s |
| Declarar / "Não fazer nada" | Uma por membro e turno (índice único parcial `{ campaignId, turnNumber, memberId }` com `turnAction: true`; repetir = 409 `ALREADY_DECLARED`). Grava a mensagem e conta em `declaredMemberIds` por update condicional; se o turno fechou no meio, apaga a mensagem e responde 409 `TURN_CLOSED`. A declaração é final |
| Pergunta ao mestre | Escolha explícita ("Perguntar ao mestre"). Só no turno dos jogadores e para elegíveis, mesmo depois de declarar; o mestre responde em segundo plano (streaming para todos), ligado à pergunta (`replyToId`), **sem mudar o turno** |
| Turno do mestre em curso | Ações = 409 `MASTER_TURN` |
| Fechamento | Update condicional (`number`, `phase: players`): só uma chamada vence e roda o mestre — declarações simultâneas e vários `check` geram uma única narração |
| Pular jogador | Só o dono (403), que também precisa estar pronto para jogar; registra "não fez nada" no lugar de um elegível que ainda não declarou (`skippedBy`), só no turno atual, com confirmação e auditoria |
| Saída/remoção | `removeMember` grava, audita e avisa a saída e só depois chama `onMemberLeftGame` (o membro sai dos elegíveis e o turno é reavaliado); falha nessa reavaliação é logada e não desfaz a saída |
| Campanha fora de `active` | Ações = 409 `CAMPAIGN_NOT_ACTIVE` |

Ainda fora do escopo: pausar/encerrar a campanha, editar uma declaração enviada.

**Mestre.** `getMaddoxMaster()` devolve o narrador com IA (`aiMaddoxMaster`, interface `MaddoxMaster { narrate, answer }`
com um `sink` para o texto ao vivo). O mestre simulado do Maddox 3 foi removido.

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
pergunta e resposta ligadas, "Fulano não fez nada (pulado por …)", "Carregar anteriores" com cursor); campo no desenho do
campo da entrevista (`GameComposer`: caixa única `flex items-end`, texto `flex-1`, três botões de ícone redondos `h-8 w-8` à direita,
na ordem **Perguntar ao mestre**, **Não fazer nada** e **Declarar** (enviar); Enter declara, também Ctrl/⌘+Enter, Shift+Enter quebra
linha; estado/motivo e contador abaixo da caixa), bloqueado com o
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
- `GET …/game/stream` — NDJSON das gerações do Maddox ao vivo (Maddox 4).

## Narrador (Maddox 4)

Código: `server/narrator.ts` (geração), `server/narrator-prompt.ts` (módulo puro: regras, estado, tarefa, transcrição),
`server/master-tools.ts` (ferramentas), `server/game-live.ts` (barramento e fila), `server/game-stream.ts` (NDJSON),
`server/action-validation.ts`, `server/maddox-mcp.ts` + `server/master-turn-token.ts` + `server/opencode-mcp.ts` (OpenCode),
`hooks/useMaddoxGameStream.ts`, `components/composer-focus.ts`.

**Tom e regras.** As instruções são as da aba ("Maddox (narrador)") + memórias do agente (canal `dndicas/maddox` no Engramind) + as regras fixas do
narrador (`MADDOX_NARRATOR_RULES`, adaptadas do `~/code/roleplay/agente-exemplo.md` para vários jogadores: cada jogador decide
as ações, falas e escolhas do próprio personagem; o Maddox cuida do mundo, dos NPCs, dos resultados e do involuntário; prosa
sensorial em segunda pessoa; cada narração desenvolve a situação e termina num ponto de decisão) + **modo narrativo puro**
(sem dados, números, atributos ou pontos de vida — Narrativo e Flexível; nos graus com ficha a regra é a dos testes, seção "Fichas e testes (Maddox 5)")
+ rigor + formato (Markdown, negrito, citações `{{Tipo:Nome}}` do catálogo) + rotina de persistência + a campanha: cenário,
situação inicial, personagens (perfil da entrevista e **condição atual**), **estado atual** (checkpoint) e um índice de NPCs e
anotações (missões ativas sempre; o que é segredo do mestre marcado `[SÓ O MESTRE]` — os jogadores nunca recebem o prompt).
A mensagem do turno leva a transcrição recente (até 40.000 caracteres, `MADDOX_NARRATOR_HISTORY_CHARS`) e a tarefa: abertura,
narração das declarações do turno que fechou, ou resposta a uma pergunta **sem avançar a cena**.

**Ferramentas** (a campanha vem sempre do contexto da geração, nunca do modelo; erro volta ao modelo em pt-BR; cada gravação gera
log estruturado). **Tamanho:** o prompt orienta anotações consolidadas de até ~3.000 caracteres (`MADDOX_TOOL_TEXT_GUIDE`); o
corte só acontece no **teto de proteção** `MADDOX_TOOL_TEXT_MAX` = 20.000 (nomes e títulos: 120), nunca invalida a chamada e o
retorno avisa o modelo (`truncated` com os campos cortados) para ele consolidar e gravar de novo.

| Ferramenta | Grava em |
| --- | --- |
| `get_campaign_state` / `update_campaign_state` | `campaign.state` (`scene`, `location`, `situation`, `pendingDecision`, `updatedTurn`) |
| `list_npcs`, `get_npc`, `save_npc` | `maddox_npcs` pelo nome sem acento e sem caixa (`nameKey`, sem duplicar): descrição pública, `masterNotes`, visibilidade, situação. A grafia gravada é mantida ao atualizar; renomear só com `newName` (nome já usado por outro NPC = erro) |
| `search_memories`, `save_memory` | `maddox_campaign_memories` por tipo + título (`titleKey`): `local` (locais), `missao` (missões, com `status` ativa/concluída/falhou/abandonada — nasce `ativa`), `evento` (marcos), `relacao`, `fato`, `outro`; `origin: agent`, `createdBy: maddox`, `turnNumber` |
| `update_character_state` | `character.currentState` (o perfil da entrevista não muda) |

**Provedores.** Gemini, Anthropic, OpenAI e DeepSeek: `streamText` com as ferramentas (até 12 passos,
`MADDOX_NARRATOR_MAX_STEPS`). **OpenCode:** sessão `narrator` da campanha (`ensureMaddoxSession`), sem ferramentas na chamada;
antes de narrar, `ensureMaddoxMcp` confere no OpenCode (`mcp.list`, no diretório das sessões) o MCP **`dndicas-maddox`** e, se
faltar, adiciona (`mcp.add`, remoto, sem OAuth) e conecta; sem conexão = 409 `MADDOX_UNAVAILABLE` (o turno fica com falha e é
tentado de novo). Um resultado positivo fica em cache por 1 min. **Troca de URL:** a URL registrada vem dos documentos de
configuração do OpenCode (`config.get`) ou do registro feito por este processo; se for outra que a configurada, o card mostra
"URL desatualizada" (com a registrada) e narrar ou "Registrar no OpenCode" troca o registro (`mcp.remove` + `mcp.add`). Quando o
OpenCode não informa a URL registrada, o card avisa e o botão refaz o registro com a URL atual. Use no OpenCode um agente **sem ferramentas de arquivos ou
terminal**.

**MCP do Maddox** (`/api/maddox/mcp`, Streamable HTTP sem sessão, separado do `/api/mcp` público): as mesmas ferramentas com o
campo obrigatório **`turno`**, o **token de turno** posto nas instruções da geração — `payload.assinatura` (HMAC-SHA256 com o
`AUTH_SECRET`), com campanha, job, turno e validade de 20 min. A rota recusa token inválido, adulterado ou expirado e também o
de uma geração que **já terminou** (o job precisa estar rodando no barramento). Sem login: o token é a autorização.

**Fila e streaming.** O barramento (`globalThis.__maddoxGameHub`, possível pela instância única) mantém por campanha uma **fila em
série** — uma geração do Maddox por vez (narrações e respostas), o que evita duas gerações na mesma sessão do OpenCode e corridas
no estado —, as gerações ao vivo e os ouvintes. Fechar o turno, iniciar a campanha ou perguntar **responde logo**; a geração roda
em segundo plano e não depende da conexão de ninguém. Cada geração tem **teto de duração** de 5 min
(`MADDOX_MASTER_GENERATION_TIMEOUT_MS`): passado, o provedor é abortado (sinal no `streamText`/`streamAi`) e a geração é tratada como
falha — mesmo que não respeite o sinal —, então a fila anda e o pulso da trava para; o texto parcial nunca é gravado. Enquanto narra, a trava do turno é renovada a cada 30 s
(`MADDOX_MASTER_HEARTBEAT_MS`) e a retomada (`GET`/`check`) ignora campanhas com geração ativa no processo. A resposta que falha
é gravada com `error` ("O Maddox não conseguiu responder agora. Pergunte de novo."); a narração que falha marca `failedAt`
(`turn.failed` no DTO). Consumo nas origens `maddox-narration` e `maddox-validation`.

Uma falha da narração encerra a geração ao vivo **antes** de gravar `failedAt` (se a gravação falhar, nenhum cliente fica
com a bolha parada). `GET …/game/stream` (membros; `maddox.play`): `snapshot { live[] }`, `live-start`, `delta { liveId, text }`,
`tool { liveId, running }`, `live-end { liveId, messageId, error }` e `ping` (15 s). O mesmo fluxo chega a **todos** os
jogadores com a mesa aberta. O texto ao vivo passa pelo `createMarkupFilter` (marcação do catálogo nunca crua) e, ao gravar, as
menções são resolvidas com os nomes reservados da campanha **e dos NPCs**.

**Ação livre.** **Rigoroso e Fiel ao D&D** (`MADDOX_DECLARATION_VALIDATION_RIGORS`) validam a declaração **antes de gravar**: com
a chave JEV "Validade de ação livre" ligada decide o JEV (`noul`, motivo padrão); senão, uma geração curta e efêmera do narrador
devolve `{ valid, reason }`, com teto de 20 s (`MADDOX_VALIDATION_TIMEOUT_MS`, sinal no provedor e no JEV; passou = aceita).
Quem já declarou recebe **409 `ALREADY_DECLARED` antes** da validação (sem chamada de IA).
Inválida = **409 `ACTION_INVALID`** com o motivo: nada é gravado e a vez não é gasta. Falha do
validador aceita a declaração (aviso no log). **Narrativo, Flexível e Equilibrado** julgam na narração: a ação impossível vira
uma tentativa frustrada narrada com a causa na ficção. Perguntas e "Não fazer nada" nunca são validadas.

**Tela.** A mesa assina o stream (`useMaddoxGameStream`): reconecta sozinho com espera crescente (3 s, dobrando até 60 s;
sem linha nem `ping` por 45 s refaz a conexão) e **para** em 401/403/404; a fala do Maddox chega aos poucos numa bolha com
cursor e "Consultando as anotações da campanha…" enquanto ele usa ferramentas; a resposta ao vivo aparece ligada à pergunta; a
geração que terminou fica na tela até a mensagem gravada chegar (sem piscar). A faixa mostra "o Maddox teve um problema;
tentando de novo em instantes…" depois de uma falha. `ACTION_INVALID` aparece acima do campo e o rascunho volta.
**Foco:** sempre que o Maddox termina de responder — na mesa e na entrevista — o campo de texto recebe o foco
(`focusComposer`), sem roubá-lo de outro campo editável nem de um diálogo aberto.

## Fichas e testes (Maddox 5)

Código: `check-modifier.ts` (módulo PURO, servidor e tela: modificador pela ficha, título, sucesso pela CD, resumo da ficha),
`server/game-checks.ts` (rolagem, rolar no lugar, fim da rodada, cancelamento), ferramenta `request_check` em
`server/master-tools.ts`, `server/check-hints.ts` (JEV "Pedir teste"), rodadas em `server/game.ts` (`runMasterTurn`),
`components/game/GameCheckCard.tsx`, `MySheetButton.tsx`, `NpcPanel.tsx`.

**Graus.** Equilibrado, Rigoroso e Fiel ao D&D (`MADDOX_CHECK_RIGORS`, os mesmos que criam a ficha) trocam o modo narrativo pela
regra `checksRule(rigor)`: frequência do grau (Equilibrado só nos momentos decisivos; Rigoroso sempre que adequado; Fiel exatamente
como nas regras), pedir pela ferramenta, **nunca rolar nem inventar resultado**, parar a narração no momento da tentativa, comparar o
total com a CD e narrar a consequência sem recitar números. No Rigoroso e no Fiel ao D&D o combate é tático (Maddox 7).
Cada personagem do prompt ganha o **resumo da ficha** (`sheetSummary`: nível, classe, raça, PV, CA, atributos com modificador,
proficiência, resistências e perícias treinadas). Classe, subclasse e raça entram em texto puro (os campos guardam HTML de menção);
a CA não é gravada na ficha: `loadSheetSummaries` a calcula dos itens equipados com `computeSheetArmorClass`
(`character-sheets/utils/armor-class.ts`, a mesma conta da listagem de fichas). Narrativo e Flexível não recebem a ferramenta nem a regra.

**Turno do mestre em rodadas** (`turn.checkRound`, `turn.awaitingChecks`):

1. Rodada 0 narra as declarações. A ferramenta `request_check` (personagem, `tipo` perícia/atributo/resistência, `pericia` ou
   `atributo`, `cd` 1–30, `modo`, `motivo` público — curto por orientação, sem corte abaixo do teto de proteção
   `MADDOX_TOOL_TEXT_MAX`, com `truncated` no retorno se passar) guarda o pedido **em memória no job da fila** (`game-live`: `addDraftCheck`,
   instância única). Só depois de gravar a narração os pedidos viram mensagens `kind: "check"` (mesmo `insertMany`, logo abaixo da
   narração); se a geração falhar, somem com o job e a nova tentativa não duplica nada.
2. Com teste pendente, o turno fica em `master` com `awaitingChecks: true` e sem trava (`resumeMasterTurn` ignora). Declarar,
   perguntar e passar seguem em 409 `MASTER_TURN`: **os testes fazem parte do turno do mestre**.
3. Rolar (`rollCheck`): o servidor calcula o modificador da ficha na hora (`checkModifier`) e rola o d20 com o **motor de dados**
   (`rollGeneralDice`, vantagem/desvantagem do pedido; valem as regras de dado — *overrides* — do jogador do personagem). A troca
   `pending → rolled` é condicional (rolagem dupla = 409 `CHECK_ALREADY_ROLLED`). Grava `check.roll`, as partes do modificador e
   quem rolou; avisa a mesa e o stream (`check-rolled`).
4. Sem teste pendente na rodada, uma troca condicional (`awaitingChecks: true` + `checkRound`) faz `checkRound + 1`, pega a trava e
   põe a **continuação** na fila (uma só, mesmo com rolagens simultâneas). Se a rolagem foi gravada mas a continuação não chegou a
   ser agendada (queda do banco ou do processo), o `GET …/game`/`check` seguinte vê `awaitingChecks` sem teste pendente e retoma pela
   mesma troca condicional (`resumeMasterTurn` → `advanceAfterChecks`). A tarefa leva as declarações e os resultados
   (`checkResultLine`: total, d20, modificador, vantagem com o descartado, 20/1 natural, "rolado pelo dono", CD e sucesso/falha); o
   Maddox narra a consequência a partir de onde parou. Narrações da rodada são `segment = checkRound` (as antigas, sem o campo,
   contam como 0).
5. Até **3 rodadas** por turno (`MADDOX_CHECK_ROUNDS_MAX`): na última a ferramenta recusa novos pedidos e a narração termina no
   ponto de decisão. Na rodada sem testes, o turno dos jogadores abre como antes.

A ferramenta recusa (erro em pt-BR ao modelo): campanha narrativa, geração que não é narração (respostas a perguntas), teto de
rodadas, personagem desconhecido, sem entrevista concluída ou **sem ficha**, perícia/atributo ausente e um segundo teste para o
mesmo personagem na rodada (índice único parcial `{ campaignId, turnNumber, check.round, memberId }` com `kind: "check"`, garantido
pela `ensure-maddox-indexes`).

**Quem rola.** O jogador indicado (`assertMemberCanPlay`) ou o **dono, no lugar dele** ("Rolar no lugar", com confirmação e
auditoria `CampanhaMaddox` `{ turn, check, rolledFor, total }`). Outros = 403 `NOT_CHECK_TARGET`; quem não participa = 404; teste
cancelado ou fora da rodada = 409 `CHECK_NOT_PENDING`. O membro que sai ou é removido tem os testes pendentes **cancelados**
(`cancelMemberChecks`, chamado por `onMemberLeftGame`) e a rodada pode terminar; o Maddox recebe "cancelado; resolva sem o teste".
Quem sai **durante a geração** (o pedido ainda estava em memória) é coberto por `cancelOrphanChecks`: ao gravar a narração e em
`advanceAfterChecks` (também na retomada do `GET`), testes pendentes de membros que não estão mais `joined` viram `cancelled`; se a
rodada ficar sem pendentes, a continuação entra na fila na hora.

**Visibilidade.** O teste **pendente só chega ao jogador indicado** (filtro no servidor em `messagesDto`, também na paginação). Os
outros recebem só `turn.pendingChecks` (`checkId`, membro, nome do personagem): a faixa "Turno do mestre — aguardando o teste de
Lyra", o chip "Rolando teste" no painel e o "Rolar no lugar" do dono. Rolado, todos veem quem rolou, o teste, o motivo, as partes do
modificador e o total; quem estava com a mesa aberta **vê o dado rolando** (linha `check-rolled` do stream → o `DiceRollerPanel`
repete a animação com o resultado oficial, sem botão). Recarregar mostra o resultado sem animação. Cancelado vira nota discreta.

**CD.** Configurável por campanha (`showCheckDc`, padrão **secreta**): seletor "CD dos testes: Secreta | Visível" na criação (só nos
graus com testes) e na edição (dono, a qualquer momento, auditado). Secreta, o DTO nunca traz a CD (`dc: null`, `success: null`);
visível, o card mostra "CD 15" e, depois da rolagem, "Sucesso"/"Falha". O Maddox sempre recebe a CD.

**JEV "Pedir teste"** (`requires-check`): com a chave ligada, nos graus com testes, a rodada 0 consulta o JEV uma vez (uma pergunta
`noul` por declaração, teto de 20 s `MADDOX_CHECK_HINT_TIMEOUT_MS`). A declaração marcada ganha na tarefa "(o JEV indica que esta ação
provavelmente exige teste; você decide)". Chave desligada, falha ou teto: narra sem a orientação (aviso no log).

**Tela.**

- **Card do teste** (`GameCheckCard`): "O Maddox pede um teste para você", "Teste de perícia: Furtividade (Destreza)", motivo, `d20` +
  as partes do modificador nas cores dos atributos (as do `CalcTooltip`) e "= d20 +5", chip de vantagem/desvantagem e de CD (visível).
  A prévia usa a ficha ao vivo (`useSheet`); "Rolar" fica desabilitado ("Carregando a ficha…") até ela chegar. O modificador do
  `preset` do painel é congelado no clique: o resultado do servidor (que pode trazer outro modificador) não troca o preset — o painel
  se reinicia quando o preset muda e o dado/total sumiriam para quem rolou. Abaixo, o `DiceRollerPanel` sem controles e sem palco
  (`appearance="inline"`, `stageVariant="bare"`, `stageSize="compact"`, `stageVisibility="roll"`): pendente, só o botão **"Rolar"**
  pequeno, que chama `POST …/game/checks/[checkId]/roll` (corpo `{}`); rolando, o d20 solto no card e "Resultado enviado ao Maddox.";
  quando o dado para (`onRollSettled`), a linha do resultado (`check-roll-result`) e Sucesso/Falha, e o dado some com animação
  `MADDOX_CHECK_DIE_HIDE_MS` (1,4 s) depois. Quem assiste vê o mesmo dado pelo `replay`, sem botão. Mesa recarregada depois da
  rolagem: só a linha. O painel fica montado durante toda a rolagem, para o fim da animação sempre chegar ao card.
  O painel fica numa coluna à direita do texto (`check-roll-column`, centralizada nos dois eixos; no celular, abaixo), com o
  "Rolar" maior (`h-11 px-6 text-sm`); quando o dado para, o botão e o aviso saem. A linha do resultado traz, ao lado do total, a
  bolha **Sucesso**/**Falha** (CD visível) e a bolha **20 natural**/**1 natural**. Cor do card (`data-accent`): verde/vermelho do
  desfecho com a CD visível; com a CD secreta, só o crítico pinta (verde no 20, vermelho no 1); senão, a cor do rigor — e só depois
  que o dado para. No crítico, borda e fundo ganham o destaque animado sem fim da rolagem flutuante (`CriticalHighlight`), também
  nos cards antigos.
- **Regra do d20:** 20 natural no d20 mantido é sempre sucesso e 1 natural sempre falha, qualquer que seja a CD
  (`checkSucceeded(total, cd, d20)` em `check-modifier.ts`, usado no DTO da mesa e na linha "resultado dos testes" do narrador).
- Faixa: "o Maddox pediu um teste para você" (com "e aguarda …" se houver outros) ou "aguardando o teste de …"; o campo de texto
  fica bloqueado com o motivo; o Maddox não aparece "narrando" enquanto espera.
- **Minha ficha**: botão no cabeçalho da mesa, só com ficha (`me.sheet`, só a minha chega ao DTO). Abre a janela `maddox-sheet`
  (`GlassWindow` do `WindowProvider`) com o `SheetForm` editável (auto-save e tempo real da própria ficha) e "Abrir em nova aba".
- **NPCs conhecidos**: card abaixo de "Na mesa" com nome e foto (ou iniciais) dos NPCs com `visibility: "players"`. Os personagens
  dos outros já aparecem com nome e retrato em "Na mesa"; a ficha deles não é exposta.

**Painel de dados.** O `DiceRollerPanel` ganhou `rollRequest` (quem faz a rolagem oficial; padrão `requestDiceRoll`),
`rollButtonLabel` (padrão "JOGAR") e `hideRollButton` (só repete um resultado externo). Ver `dice-roller.md`.

### Atributos na entrevista de personagem (Maddox 5)

Escopo acrescentado à DND-16 depois da prévia: na entrevista, o Maddox pedia ao jogador que rolasse 4d6 "por fora" e digitasse os
números (improviso do modelo — a entrevista não tinha ferramenta de dados e a consolidação gravava os atributos extraídos pela IA).
Agora, nos graus com ficha (Equilibrado, Rigoroso e Fiel ao D&D), os seis atributos só entram pelo **card de atributos**. Narrativo e
Flexível seguem sem atributos.

Código: `interview-scores.ts` (PURO: validação por método, sexta = 72 − soma, bônus, final = base + bônus, `scoresLine`),
`server/interview-tools.ts` (ferramentas, rascunho em memória, situação para o prompt), `server/interview-scores-service.ts` (rolar,
reiniciar, enviar), `components/interviews/AbilityScoresCard.tsx`. As regras dos métodos ficam em
`src/features/character-sheets/utils/ability-score-rules.ts` (sem "use client", importável pelo servidor) e são reexportadas por
`assisted-creation.ts`; o `PointBuyControls` saiu do modal de criação assistida para
`src/features/character-sheets/components/point-buy-controls.tsx` (o modal e o card usam o mesmo).

- **Métodos.** Conjunto padrão (15, 14, 13, 12, 10, 8, um por atributo); compra de pontos (27 pontos, 8–15, tabela da ficha);
  rolagem: **cinco 4d6 descartando o menor + a sexta = 72 − soma** (a regra da ficha, `calculateFinalDiceScore`).
- **Quem rola.** O jogador, no `DiceRollerPanel` do card (4d6, "Rolar 4d6"), mas cada rolagem acontece **no servidor da entrevista**
  (`POST …/ability-scores/roll`, corpo `{}`): `rollGeneralDice` com as regras de dado do jogador, gravada em
  `maddox_interviews.abilityRolls` (`rolls[{ dice, score, rollId }]`, `sixth`, `invalid`) por troca condicional (dois cliques = uma
  rolagem; o outro 409 `ROLL_CONFLICT`). O envio só aceita exatamente as pontuações roladas. "Reiniciar" (`…/reset`) só existe com a
  sexta fora de 3–18; rolar tudo de novo é decisão do Maddox (`novaRolagem`). As rolagens pertencem à entrevista: reabrir o card
  mantém os mesmos dados.
- **Card** (`messages[].abilityScores`, numa fala do Maddox): `pending` → `submitted` (travado) → `superseded` quando o Maddox reabre
  (o novo card vem com `prefill` — método e valores do último envio — e herda o bônus). O final é sempre derivado (base + bônus).
- **Ferramentas do entrevistador** (só entrevista de personagem nos graus com ficha; valem só enquanto a geração que as recebeu
  roda — a trava `generating.token`):
  - `request_ability_scores { motivo?, novaRolagem? }` abre/reabre o card. O pedido fica num rascunho em memória
    (`globalThis.__maddoxInterviewDrafts`, pela trava) e só vira card quando a fala é gravada; falha da geração descarta. Card já
    aberto → `{ alreadyOpen: true }`.
  - `get_ability_scores {}` (leitura): situação, método, base, bônus, final e rolagens.
  - `apply_ability_bonus { antecedente, bonus: { "Destreza": 2, … } }`: exige card enviado; exatamente 3 pontos, +1/+2 por atributo,
    só nos `suggestedAttributes` da origem do catálogo (`findBackground`: origens **ativas**, por nome ou nome original, ignorando
    acento, caixa e espaços; grava o nome oficial). **Origem fora do catálogo:** em **Rigoroso e Fiel ao D&D**
    (`MADDOX_CATALOG_ORIGIN_RIGORS`) é **recusada sem gravar**, com a lista das origens disponíveis; no **Equilibrado** é aceita como
    origem própria, com os pontos livres (`catalogo: false` e a nota no retorno). **Só sugerido** (não bloqueia a síntese) e **sem teto
    de 20**.
  - Consulta ao catálogo (só leitura): `search_catalog` e `get_catalog_entity` (ver "Catálogo do DnDicas" abaixo).
- **Como chegam ao modelo.** Provedores diretos: `streamText` da AI SDK com as ferramentas (`MADDOX_INTERVIEW_MAX_STEPS`), no mesmo
  formato de eventos do `streamAi` (o `src/lib/ai/stream.ts` não mudou). OpenCode: **o mesmo MCP do narrador** (`dndicas-maddox`,
  `/api/maddox/mcp`) registra também as três ferramentas, com um **token de entrevista** próprio
  (`createMaddoxInterviewToken`, HMAC no domínio `maddox-interview:` com `{ interviewId, lockToken }`): o token do narrador não serve na
  entrevista e vice-versa. `prepareTurn` garante o MCP (`ensureMaddoxMcp`) antes de gravar qualquer coisa.
- **Envio** (`POST …/interviews/character/ability-scores`, `{ method, scores }` estrito → NDJSON da fala seguinte): valida o
  método, pega a trava (409 `INTERVIEW_BUSY`), prepara o turno **antes de gravar** (falha de preparação deixa card e conversa
  intactos) e grava o card `submitted` + uma **fala interna** (`internal: true`, "[Sistema] O jogador enviou os atributos…"), que vai
  ao modelo e à transcrição ("SISTEMA:") mas nunca ao DTO. Uma proposta pendente é desfeita. Auditoria `CampanhaMaddox` com método
  e base. Falha do provedor: "Tentar de novo" (a rota de sempre) gera a fala seguinte com o card já enviado.
- **Prompt.** A seção "Atributos do personagem" troca o antigo "combine … os valores dos seis atributos": card como único caminho,
  nunca pedir números digitados nem rolar/inventar, os três métodos, bônus sugerido e `get_ability_scores` antes da síntese. Cada
  turno leva "Atributos: situação atual" e, no OpenCode, o servidor MCP e o token (`turno`).
- **Catálogo do DnDicas** (`server/catalog-tools.ts`, mesmo serviço do `search_catalog` do Agente Opex e do MCP público, só
  entidades ativas). O entrevistador (só na entrevista de personagem dos graus com ficha) e o narrador (todos os graus) recebem:
  - `search_catalog { consulta?, tipos?: CatalogEntityType[] (até 5), limite?: 1–30 (padrão 15) }` → `{ itens: [{ id, tipo, nome,
    nomeOriginal, fonte, resumo }] }`, resumo em texto puro de até 300 caracteres. Só `tipos` lista o tipo (ex.: todas as origens);
    nada encontrado traz a nota "não cite isso como entidade do catálogo". Sem consulta nem tipo: erro.
  - `get_catalog_entity { tipo, id }` → entidade compacta (`compactCatalogEntity`: sem HTML, sem `_id`/imagem/status/datas, listas até 40,
    textos até 4.000 caracteres com `truncated`); não encontrada ou inativa: erro que manda buscar o id.
  - AI SDK: entram junto das ferramentas de cada um (`buildInterviewAiTools`, `buildMaddoxAiTools`). MCP `dndicas-maddox`: registradas
    **uma vez**, aceitando o token do narrador (job ativo) **ou** o da entrevista (`generating.token` igual ao do token); as ferramentas que
    gravam continuam só com o token do próprio tipo.
  - Prompts: a entrevista ganha "## Catálogo do DnDicas" antes dos atributos (consultar antes de sugerir raça, classe, subclasse,
    origem, talento ou magia; nunca nomes de memória ou de outras edições; Rigoroso e Fiel exigem raça, classe, subclasse e origem do
    catálogo, Equilibrado prefere o catálogo); o narrador ganha a mesma seção (consultar antes de afirmar mecânica; nos graus sem testes é
    referência). Tetos de passos: `MADDOX_INTERVIEW_MAX_STEPS = 14` (subiu com as ferramentas da ficha), `MADDOX_NARRATOR_MAX_STEPS = 16`.
- **Consolidação.** Vale o **último envio** (`submittedAbilityCard`: o card mais novo com valores, enviado ou já `superseded` — um card
  reaberto e não reenviado não apaga o envio anterior nem o bônus). Card aberto e nunca enviado: concluir responde 409
  `ABILITY_SCORES_PENDING` ("Envie os atributos pelo card antes de concluir a entrevista.") sem consolidar. Em Rigoroso e Fiel, um bônus
  de origem fora do catálogo responde 409 `BACKGROUND_NOT_IN_CATALOG` ("O antecedente do bônus (X) não está no catálogo. Peça ao Maddox
  para escolher uma origem do catálogo e reaplicar o bônus.") sem consolidar nem pegar a trava. Com envio, a ficha recebe
  os valores **finais do card** (base + bônus) e ignora os atributos extraídos
  pela IA (as instruções avisam); o resultado guarda `abilityScores { method, base, bonus, final }` e o `build`. Nos graus com ficha a
  ficha inteira sai de `sheet-builder.ts` (veja "Ficha completa pela entrevista").
- **Tela.** O card aparece abaixo da fala que o abriu: `GlassSelector` do método, grade do conjunto padrão (sem repetir valores),
  `PointBuyControls` com "N/27", painel 4d6 com as pontuações (a nova só aparece quando o dado para) e a sexta calculada,
  distribuição por `GlassSelector`, prévia base/bônus/final e "Enviar atributos" com confirmação ("Depois de enviar, só o Maddox
  pode reabrir o card."). Desabilitado enquanto o Maddox responde. Enviado: somente leitura (método, base, bônus, final); substituído:
  "Reaberto abaixo". O campo de mensagem continua livre com o card aberto.

API (`maddox.play`, só o próprio membro; `scenario` = 404, grau sem ficha = 409 `ABILITIES_DISABLED`, sem card pendente = 409
`NO_PENDING_SCORES`):

- `POST /api/maddox/campaigns/[id]/interviews/character/ability-scores` — `{ method, scores }` → NDJSON.
- `POST …/ability-scores/roll` — `{}` → `{ roll, interview }` (409 `ROLLS_DONE`, `ROLLS_INVALID`, `ROLL_CONFLICT`).
- `POST …/ability-scores/reset` — `{}` → `{ interview }` (409 `ROLLS_NOT_RESETTABLE`).

### Nível inicial da mesa (Maddox 5)

- **Definido na entrevista de cenário**, com quem criou a campanha; a pergunta muda por grau (`LEVEL_QUESTION` em
  `interview-prompt.ts`): Fiel pergunta direto "qual o nível inicial (1 a 20)?" e cita a recomendação do D&D 2024 (1 para
  iniciantes, 3 para quem conhece); Rigoroso pergunta o número sugerindo 1 ou 3; Equilibrado oferece estágios na ficção do cenário
  com o número de cada um; Flexível e Narrativo perguntam o **estágio de experiência sem número**, adaptado ao cenário ("acabou de
  se tornar aventureiro" na fantasia; "caçador recém-iniciado" num cenário como Supernatural — nunca "aventureiro" fora desse tipo).
- **Campanha:** `startingLevel` (1–20 ou `null`, graus com ficha) e `startingStage` (texto do modelo gravado inteiro, sem corte, graus narrativos), gravados pela
  consolidação do cenário (`scenarioConsolidationSchema`: fora de 1–20 vira `null` sem invalidar o resto). DTO da campanha:
  `startingLevel`, `startingStage`; chip "Nível inicial N" no card e no lobby (`StartingLevelChip`, só o número). O estágio narrativo
  (texto do modelo, pode ser longo) aparece inteiro numa linha própria com quebra ("Estágio inicial: …", `StartingStageLine`), nunca com
  reticências.
- **Entrevista de personagem:** com nível da mesa, o Maddox só confirma (pedir outro nível = "o nível é da mesa"); sem nível
  (campanhas antigas), pergunta ao jogador pela regra do grau e grava em `build.level`. Nos graus narrativos o estágio entra na seção
  "Capacidades e limitações" do perfil.
- **Edição:** `PATCH /api/maddox/campaigns/[id]` aceita `startingLevel` (dono; só graus com ficha, senão 409 `LEVEL_DISABLED`; só em
  `lobby`/`interview`, senão 409 `LEVEL_LOCKED`; auditado). O diálogo de edição mostra `StartingLevelField` (`Select` glass de
  `@/core/ui/select`, níveis 1–20) avisando que fichas já criadas mantêm o nível delas.

### Ficha completa pela entrevista (Maddox 5)

Nos graus com ficha, a entrevista de personagem monta a ficha D&D **inteira** no servidor.

- **Escolhas (`build` na entrevista, `server/character-build.ts`):** `update_character_build` (gravação parcial; tudo ou nada: com um
  erro, nada é gravado e a mensagem traz o motivo e as opções) e `get_character_build` (só leitura). Ambas devolvem o resumo, as
  regras da classe no nível e `faltando`. Campos: `nivel` (só sem nível da mesa), `raca`, `classe`, `subclasse`, `origem` (ids do
  `search_catalog` ou nomes, comparação sem acento/caixa, só ativos), `periciasClasse` (exatamente `skillCount`, de
  `availableSkills`, sem repetir as da origem), `especialista` (2 por traço "Especialista" até o nível, entre as proficientes),
  `estiloLuta` (talento "Estilo de Luta", só com o traço), `talentos [{ nivel, talento, atributos? }]` (um por nível de talento da
  classe: traços "Melhoria de Atributo", "Aumento de Atributo", "Aumento no Valor de Habilidade", "Aperfeiçoamento da pontuação de
  atributo", "Novo Talento"; "Dádiva Épica" exige a categoria Dádiva Épica; Aumento de Atributo = +2 ou +1/+1 com teto 20, Dádiva
  até 30; talento com `attributeBonuses` = +1 num dos listados; nível 1 aceita um talento de Origem extra), `truques`/`magias` (pela
  tabela de progressão da classe ou da subclasse que conjura: quantidade, círculo máximo com espaço e lista de magias),
  `equipamento [{ item, quantidade, equipado }]` (Fiel/Rigoroso: só itens do catálogo; uma armadura base e um escudo equipados),
  `moedas { po, pp, pc, pe, pl }`, `idiomas`, `ferramentas`. Trocar a classe apaga as escolhas dependentes (aviso). Equilibrado aceita
  raça, classe, subclasse, origem, talento e item **próprios** (texto, com aviso) e não cobra o que depende do catálogo. Origem
  diferente da do bônus de atributos gera aviso para reaplicar o bônus. Regras puras em `character-build-rules.ts`.
- **Card de PV (`server/interview-hit-points.ts`, `HitPointsCard`):** acima do nível 1, `request_hit_points` abre o card (rascunho até a
  fala ser gravada; reaberto = anterior `superseded`). Como o assistente de subir de nível da ficha: em cada nível do 2 ao N, "Média"
  (`averageHpGain` = ⌈lados/2⌉ + CON, mínimo 1) ou "Rolar vida" (1 dado de vida + CON pelo `rollGeneralDice` com as regras de dado do
  jogador, um por nível, gravado em `hitPointRolls` — só o dado; o CON final entra no total). Na tela, o nível em rolagem mantém o
  painel de dados montado (e o mesmo preset) até o fim da animação (`onRollResolved`), mesmo que a rota já tenha devolvido a linha com
  o dado; só então o ganho aparece e o painel passa ao próximo nível marcado. Nível 1 automático
  (`getLevelOneHpMax`). Trocar classe ou nível apaga as rolagens. Rotas (`maddox.play`, só o dono da entrevista, `scenario` = 404, grau
  sem ficha = 409 `SHEET_DISABLED`, sem card = 409 `NO_PENDING_HIT_POINTS`): `POST …/interviews/character/hit-points/roll { nivel }`
  → `{ roll, interview }` (409 `HIT_POINT_ROLLED`, `ROLL_CONFLICT`) e `POST …/hit-points { escolhas: { "2": "media" | "rolagem" } }` →
  NDJSON (400 `INVALID_HIT_POINTS` se faltar nível ou "rolagem" sem dado rolado).
- **Prompt:** seção "## Construção da ficha" (ordem: nível → raça → classe → origem → atributos → bônus → perícias → escolhas de nível →
  magias → equipamento e moedas pelo D&D 2024 → idiomas e ferramentas; consultar o catálogo antes de sugerir; gravar ao confirmar;
  não inventar PV, proficiências, deslocamento, tamanho, traços nem espaços; síntese só com `faltando` vazio) e "Ficha: situação
  atual" a cada turno. MCP: as três ferramentas novas entram no mesmo `dndicas-maddox` com o token da entrevista.
- **Conclusão:** antes de consolidar e sem pegar a trava — escolhas faltando = 409 `CHARACTER_BUILD_INCOMPLETE` ("Faltam escolhas na
  ficha: …"); acima do nível 1 sem card de PV válido para o nível e o dado de vida = 409 `HIT_POINTS_PENDING`.
- **Montagem (`server/sheet-builder.ts`):** campos de raça, classe, subclasse e origem como **HTML de menção** (o formato da criação
  assistida) com `raceRef`, `classRef`, `subclassRef` (o `_id` da subclasse; a menção usa `subclass:{classe}:{sub}`) e `originRef`;
  nível; atributos (card + bônus + talentos); tamanho e deslocamento da raça; dado de vida, PV máximo e atual; salvaguardas, armaduras
  e armas da classe; perícias (origem + classe + Especialista); ferramentas; atributo de conjuração e espaços de magia; traços da
  classe/subclasse e da raça até o nível (`classFeatures`, `speciesTraits`); talento da origem, estilo e talentos (`featuresNotes`);
  cargas de traços, talentos e itens (`resourceCharges`); moedas; "Idiomas: …" em `notes`. Coleções: itens (menção, `catalogItemId`,
  tipo, CA), um ataque por arma equipada (`buildWeaponAttackAutofill`), magias preparadas e o ataque dos truques com dano. As
  coleções são apagadas e regravadas, então refazer não duplica. A ficha nova é ligada ao personagem logo ao ser criada.
- **Descritivo (consolidação):** o JSON da síntese não pede mais raça/classe/origem/atributos; pede `appearance` (1–3 parágrafos),
  `history` (2–5 parágrafos), `personalityTraits`, `ideals`, `bonds`, `flaws`, idade, altura, peso, olhos, pele e cabelo, em texto
  simples. `textToSheetHtml` converte parágrafos e **negrito** e transforma citações `{{Tipo:Nome}}` em menções do catálogo; os campos
  curtos saem sem a marcação (`stripCatalogMarkup`). Nenhum campo da ficha guarda `{{…}}`.

API (`maddox.play`, usuário efetivo):

- `POST /api/maddox/campaigns/[id]/game/checks/[checkId]/roll` — `{}` (estrito: dado ou modificador no corpo = 400) → `{ roll, state }`.
- `PATCH /api/maddox/campaigns/[id]` e `POST /api/maddox/campaigns` aceitam `showCheckDc`.
- `GET …/game`: `turn.awaitingChecks`, `turn.pendingChecks`, `showCheckDc`, `npcs`, `me.sheet` e `check` nas mensagens.

Fora do escopo: dano, PV e recursos aplicados pelo Maddox na ficha, iniciativa e combate por botões (Maddox 7), imagens de NPC (Maddox 10).
(O Maddox 6 passou a aplicar na ficha as **recompensas** de combate — moedas e itens — no Equilibrado; ver "Combate narrativo (Maddox 6)".)

## Combate narrativo (Maddox 6)

Código: `server/combat.ts` (aplicação, efeitos do fim, recompensas, DTOs), ferramentas em `server/master-tools.ts`
(`MADDOX_COMBAT_TOOLS`), rascunho no job em `server/game-live.ts` (`addDraftCombat`/`takeDraftCombat`), `server/combat-hints.ts`
(JEV), `server/combat-image.ts` (gancho da imagem), coleção `maddox_combats` (`models/maddox-combat.ts`),
`components/game/GameCombatCard.tsx`.

**Graus.** Narrativo, Flexível e Equilibrado (`MADDOX_COMBAT_RIGORS`). Rigoroso e Fiel ao D&D usam o **combate tático** (seção
"Combate tático (Maddox 7)"), que reaproveita o registro, os cards e o fim descritos aqui. Sem iniciativa nem turnos rígidos: o motor de turnos
não muda (todos declaram, o Maddox narra); no Equilibrado os testes continuam nos golpes decisivos.

**Ferramentas do narrador** (só nas narrações dos três graus — respostas a perguntas não recebem; pelo MCP `dndicas-maddox` elas existem
para todos e recusam pelo grau/geração):

| Ferramenta | Comportamento |
| --- | --- |
| `start_combat { titulo, local?, adversarios[] }` | Adversário: `nome`, `lado` (inimigo/aliado), `quantidade`, `descricao`, `condicao`, `registrarNpc`. Liga ao NPC já registrado pelo nome; com `registrarNpc` cria o NPC (visível aos jogadores); grupos genéricos ficam só no combate. Combate já ativo = erro |
| `update_combat { adversarios[] }` | Condição, quantidade, reforços |
| `end_combat { resultado, resumo, notasMestre?, adversarios[{ nome, desfecho }], recompensas[], estadoPersonagens[], cenaFinal }` | Exige combate ativo; recusa se a narração pediu teste ("resolva os testes antes"); adversário fora do combate e personagem desconhecido = erro com as opções. Recompensa: `tipo` moedas (`po`, `pp`, `pe`, `pc`, `pl`, até 100.000 cada), item (`item`, `quantidade`) ou outro (`descricao`), `personagem` opcional (vazio = o grupo) |
| `get_combat {}` | Leitura do combate (gravado + o que já foi pedido nesta narração) |

**Rascunho e aplicação.** Como os testes do Maddox 5, os pedidos ficam no job da fila e só são aplicados por `applyCombatDrafts`
depois que a narração é gerada e **antes** de ela ser gravada: geração que falha não muda nada (nem cria NPC). Os cards são mensagens
`kind: "combat"` (`combat { event: "start" | "end", combatId }`), gravadas no mesmo `insertMany`: início **antes** da narração, fim
**depois** dela (e dos testes). O índice único parcial `{ campaignId }` com `status: "active"` (migração `ensure-maddox-indexes`)
garante um combate ativo por campanha. Os **efeitos do fim só rodam depois** de gravar os cards e a narração (`finishCombatTurn`,
troca condicional `effectsApplied`): se a gravação das mensagens falhar depois de aplicar o combate, a retomada do turno grava o
card que faltou e dispara os efeitos uma vez. Nomes repetidos de participantes (mesmo nome sem acento/caixa) são recusados em
`start_combat`/`update_combat`, com a orientação de usar `quantidade` ou nomes distintos. Cada narração da rodada 0 com combate ativo (ou que o tocou) soma `masterTurns`.

**Fim do combate.** Troca condicional `active → ended` (uma só aplicação vence), com resultado (`vitoria`, `derrota`, `fuga`, `tregua`,
`interrompido`), resumo, notas do mestre, desfecho de cada adversário (`morto`, `derrotado`, `capturado`, `rendeu-se`, `fugiu`,
`poupado`, `ileso`), recompensas, condição dos personagens e a cena final. Efeitos (cada um falha sozinho, com aviso no log):

- NPC ligado: `morto` → `dead`, `fugiu` → `unknown`; os demais mantêm a situação. Participante sem NPC ligado é religado pelo nome
  no fim (NPC registrado por `save_npc` depois do início também recebe o desfecho);
- `character.currentState` de cada personagem em `estadoPersonagens`;
- memória `evento` "Combate: {título} (turno N)" (visível aos jogadores, tag `combate`) com resultado, resumo, desfechos e
  recompensas — **uma por combate** (chave `combatId` na memória), então dois combates com o mesmo título não se sobrescrevem;
- **recompensas na ficha no Equilibrado, no Rigoroso e no Fiel ao D&D** (`MADDOX_COMBAT_SHEET_REWARD_RIGORS`) e só para personagem com ficha: cada recompensa troca
  `applied: false → true` antes de tocar a ficha (retomada não duplica); se a escrita na ficha falhar, a marca volta a `false` (o
  card não mostra "Na ficha"), com aviso no log, e as recompensas seguintes continuam. Moedas: `$inc` em `sheet.coins` (po→gp, pp→sp, pe→ep,
  pc→cp, pl→pp). Item: do catálogo (busca por id ou nome, ativo; menção e campos de CA como a ficha da entrevista) ou, fora dele,
  **item próprio** com o aviso `"X" não está no catálogo: entrou como item próprio.`; entra sem equipar. Avisa a ficha aberta
  (`CharacterSheetPusherService`) e audita (`CampanhaMaddox`, `by: maddox`). Narrativo e Flexível só registram;
- `onCombatEnded` (`combat-image.ts`): **imagem de fim de batalha (Maddox 10)** — com a situação "Fim de batalha" ativa, a `finalScene`
  vira imagem ligada ao card "Fim do combate" (`image.status = "requested"`); sem cena final ou fora das regras, `skipped`. Combates
  encerrados antes do Maddox 10 ficaram com `awaiting-feature`.

**Prompt.** Regra fixa "## Combate narrativo" (`combatRule`: quando abrir, narração cinemática sem números, testes só nos golpes
decisivos no Equilibrado, `update_combat`, quando e como encerrar, personagem não morre por conveniência) e o bloco
"## Combate em andamento" (título, local, narrações desde o início, participantes e condição); a partir de 6 narrações
(`MADDOX_COMBAT_LONG_TURNS`) o bloco pede para conduzir a luta a um desfecho. A transcrição mostra os cards ("combate começou: …",
"combate terminou: Vitória — …"). No OpenCode, a lista do MCP inclui as quatro ferramentas.

**JEV "Início ou fim de combate"** (`combat-boundary`): com a chave ligada, nos três graus, na rodada 0 com declarações, uma pergunta
`noul` sobre o conjunto: fora de combate, "a cena entra em combate agora?"; em combate, "o combate está terminando?". Positiva (≥ 0,5)
acrescenta à tarefa a nota "(o JEV indica que … provavelmente começam/encerram …; você decide)". Teto de 20 s
(`MADDOX_COMBAT_HINT_TIMEOUT_MS`); chave desligada, falha ou teto = narra sem a nota (aviso no log). Quem decide é sempre o Maddox.

**DTO e tela.** `GET …/game` traz `combat` (combate ativo: título, local, turno de início, narrações, participantes com condição) e
`combat` nas mensagens (`MaddoxGameCombatEventDto`: no fim, resultado, resumo, desfechos e recompensas com `applied`/`warning`);
`masterNotes` e `finalScene` nunca chegam. `npcs[].status` também. Campanha (`GET /api/maddox/campaigns…`): `combatTitle`.

- **Card** (`GameCombatCard`): início "Combate!" com título, local e chips dos participantes; fim "Fim do combate" com o chip do
  resultado (vitória verde, derrota vermelha, fuga/trégua âmbar, interrompido neutro — `data-accent`), resumo, desfechos, recompensas
  ("Na ficha" quando aplicada, aviso do item próprio) e "Durou N narrações (turnos A–B)". O divisor do turno sai antes do card de início.
- Cabeçalho da mesa: chip **"Em combate · {título}"** enquanto houver combate ativo (vem do estado, atualiza pelo tempo real).
- "NPCs conhecidos": NPC morto esmaecido com "Morto"; `unknown` com "Paradeiro desconhecido".
- Lobby: "Em andamento · Turno N · fase · em combate (título)".

Sem rota nova nem permissão nova (`maddox.play` cobre a mesa).

## Combate tático (Maddox 7)

Graus **Rigoroso e Fiel ao D&D** (`MADDOX_TACTICAL_COMBAT_RIGORS`): iniciativa, turnos por combatente, Ação e Ação bônus por botões,
dados rolados pelos jogadores (personagens) e pelo servidor (adversários) e dano/efeitos aplicados e persistidos.

Código: regras puras em `combat-rules.ts` (vantagem/desvantagem por condição, crítico, dano com resistência/imunidade/vulnerabilidade,
PV temporários, 0 PV, morte instantânea, testes contra a morte 2024, CD da concentração, desempate da iniciativa, expressões de dados)
e `combat-options.ts` (o que o personagem PODE usar); tipos em `combat-types.ts`; Zod das rotas em `combat-schemas.ts`. Servidor:
`server/tactical-combat.ts` (estado, início, ordem, fila dos adversários, abertura da vez, ausência), `server/tactical-actions.ts`
(vez do jogador, rolagens, cancelar, encerrar, pular, morte), `server/tactical-master.ts` (ferramentas da vez dos adversários sobre
uma cópia de trabalho), `server/combat-reactions.ts` (janelas de reação), `server/combat-monsters.ts` (bloco de estatísticas),
`server/combat-classifier.ts` (custo das habilidades), `server/combat-sheet.ts` (leitura e escritas atômicas na ficha),
`server/tactical-options.ts`, `server/tactical-dto.ts`. Tela em `components/game/combat/` e `hooks/useMaddoxCombat.ts`.

**Estado (`maddox_combats`).** `mode: "tactical"`, `tactical { phase: initiative|running, round, activeIndex, order[], characters[],
surprise, queue[], nextKey, queueTurn, staleEndNarrations }` e `rev` (cada gravação é condicional à versão: clique duplo e corridas
viram 409 `COMBAT_CHANGED`, com até 3 tentativas internas). Cada adversário vira um **indivíduo** ("Goblin 1", "Goblin 2", PV próprios,
iniciativa compartilhada pelo grupo) com `combatants[].tactical { actorKey, stats, conditions, flags, economy, concentration, defeated }`.
`characters[]` guarda condições, flags (Esquivando, Desengajado, Disparada, Escudo, Ajudado), economia, concentração, `hpZero`,
`stable`, `dead`, `left` e a ação preparada. **PV, PV temporários, testes contra a morte, espaços de magia e cargas ficam na ficha**
(fonte da verdade), escritos com `$set`/`$inc` atômicos e aviso `publishSheetPatched` para a ficha aberta. O schema usa
`minimize: false` (objetos vazios do estado ficam gravados).

**Bloco dos adversários** (`start_combat`/`update_combat` estendidos com `monstro` e `estatisticas`): **Fiel** = só monstros ATIVOS do
catálogo (nome desconhecido é recusado sem gravar nada, com sugestões pelo começo do nome e a dica de `search_catalog`; bloco próprio
recusado); **Rigoroso** = catálogo ou bloco próprio explícito (`ca`, `pv`, `iniciativa`, `salvaguardas`, resistências, `acoes[]`).
Do catálogo: PV = média de `hitPointsFormula`, CA = primeiro número de `armorClass`, salvaguardas pelos atributos e a proficiência do
ND (ou `override`), ações com `attackRoll`/`hitRoll` (dados somados, primeiro tipo de dano), salvaguarda lida do texto ("Salvaguarda de
Destreza CD 15", "metade do dano"), recarga rolada em d6 no começo do turno, Ataques Múltiplos pelo texto. Ações lendárias, de covil
e efeitos regionais ficam fora (o Maddox só narra).

**Iniciativa.** A narração que chama `start_combat` grava o card "Combate!" e um card `combat-roll` de iniciativa por personagem
pronto com ficha (espera do turno do mestre, como os testes do Maddox 5; só quem rola o vê pendente). O servidor rola a dos
adversários (desvantagem se `surpresa: "adversarios"`; a dos personagens com `surpresa: "personagens"`). O modificador vem da ficha.
Depois da última rolagem, a ordem fecha (total → Destreza → personagens antes → entrada), grava o card `combat { event: "order" }`
("Ordem de iniciativa") e a continuação narra o começo.

**Motor da vez.** O motor do Maddox 3 continua: em combate, o **turno dos jogadores é a vez de UM personagem** (`turn.combatActor`,
`eligibleMemberIds` = só o membro dele) e o **turno do mestre** narra a vez que fechou e conduz, na ordem, os adversários até o próximo
personagem (`prepareMonsterQueue`, uma vez por turno do mestre, com o começo do turno de cada um: economia nova, flags e condições
vencidas, recarga; rodada nova quando a ordem volta ao topo). Sem esperas, `openCombatTurn` abre a vez do próximo personagem (começo do
turno dele; com 0 PV, o card do teste contra a morte). Personagem morto, estável ou que saiu é pulado; se o personagem da vez cair
durante a vez dos adversários, os seguintes agem num novo turno do mestre. Perguntas ao mestre continuam livres para qualquer membro
pronto durante a vez de outro (não mudam o turno); declarações de texto livre no combate respondem 409 `COMBAT_USE_ACTIONS`.

**Ausência.** Jogador da vez offline: `offlineSince` é marcado e a vez passa depois de `MADDOX_COMBAT_OFFLINE_GRACE_MS` (30 s; timer no
processo e retomada no `check`), com "Não agiu: o jogador estava offline" (`offlineSkip`). O dono pode pular a vez (`/game/skip`, com
auditoria). Saída do membro: o personagem sai da ordem (`left`), rolagens/reações/ações pendentes são canceladas e, se era a vez dele,
ela fecha e o turno do mestre segue. Mesa toda offline não avança sozinha (regra do Maddox 3).

**Vez do jogador (rotas, todas com `maddox.play`, membro `joined`, `assertMemberCanPlay` e "é a sua vez" no servidor):**

| Rota | Comportamento |
| --- | --- |
| `POST …/game/combat/actions` `{ economy, optionId, targets?, spellLevel?, skill?, freeText?, readyOptionId?, readyTrigger? }` | A opção precisa estar na lista recalculada da ficha (`OPTION_UNAVAILABLE`); alvo validado; opção sem os dados para resolver = 409 `OPTION_UNRESOLVABLE` antes de qualquer gasto; a economia é reservada primeiro (`ACTION_ALREADY_USED`) e só então espaço de magia, carga e item são gastos (gasto recusado devolve a economia); uma ação pendente por vez (`ACTION_PENDING`). "Outra ação" (ou habilidade de custo não identificado) passa pelo `validateDeclaration` com o contexto do combate: inválida = 409 `ACTION_INVALID` com o motivo, nada gasto |
| `POST …/combat/actions/[id]/roll` `{}` | Reivindica o passo antes de rolar (`combatAction.rollingStep`/`rollingAt`, troca condicional; a chamada concorrente recebe 409 `ACTION_RESOLVED`; trava mais velha que `MADDOX_COMBAT_ROLL_CLAIM_STALE_MS` (30 s) é tida como abandonada e a próxima tentativa assume; só o dono da reivindicação grava). Rola o próximo passo: ataque (vantagem/desvantagem pelas condições; acerto contra a CA do alvo, que não aparece; 20 natural = crítico com dados dobrados), dano (resistências; adversário a 0 PV = `defeated`), cura (sai dos 0 PV), magia de salvaguarda (o servidor rola a salvaguarda de cada alvo; metade no sucesso pelo texto/perfil), teste (Esconder = Furtividade CD 15 → Invisível) |
| `DELETE …/combat/actions/[id]` | Cancela a ação sem rolagem e sem recurso gasto; a economia volta (`ACTION_NOT_CANCELLABLE`) |
| `POST …/combat/rolls/[id]/roll` `{}` | Reivindicada antes de rolar (`combatRoll.rolling`/`rollingAt`, mesma expiração; concorrente = 409 `ROLL_NOT_PENDING`). Iniciativa, teste contra a morte (encerra a vez), concentração, salvaguarda contra um adversário (aplica o dano pré-rolado), dano pedido pelo Maddox. O dono pode rolar no lugar (auditado) |
| `POST …/combat/reactions/[id]` `{ escolha }` | A reação escolhida ou `none`; o dono só pode recusar no lugar (auditado) |
| `POST …/combat/end-turn` `{ movimento? }` | Encerra a vez (409 com ação ou rolagem pendente); grava a declaração da vez com o resumo das ações e o "Movimento e posição" |

**O que o personagem pode usar** (`buildCombatOptions`, revalidado a cada ação): armas equipadas do catálogo (Força; Acuidade = o maior
entre Força e Destreza; Munição = Destreza) e o ataque desarmado; Ataque Extra pelo nome da habilidade (2/3/4 ataques na mesma Ação);
a outra arma Leve na Ação bônus depois de atacar com uma Leve (sem o modificador no dano, salvo negativo; a mesma arma só com quantidade ≥ 2, por `economy.lightWeaponId`); magias preparadas (ou
truques) com o custo do tempo de conjuração e espaço livre no círculo ou acima (seletor de círculo), **uma magia com espaço por turno**
(2024), truques escalando pelo nível; consumíveis com quantidade (poção de cura: Ação bônus em si, Ação em aliado; os demais em
"Utilizar"); habilidades e talentos pelo **classificador** (sem cargas esgotadas, sem passivas; cura e acerto automático só são resolvidos pelo servidor com os dados no texto, ataque/salvaguarda de habilidade viram utilitária para o Maddox); ações comuns 2024 (Disparada,
Desengajar, Esquivar, Ajudar, Esconder, Influenciar, Preparar, Procurar, Estudar, Utilizar); "Outra ação". Incapacitado = nada; 0 PV =
só o teste contra a morte. Reações: ataque de oportunidade (arma corpo a corpo ou desarmado), magias de Reação preparadas com espaço,
habilidades classificadas como Reação e a ação preparada.

**Classificador do custo** (`combat-classifier.ts`): cache `maddox_combat_option_profiles` (`{ entityType, entityId, textHash }` único)
→ regra pelo texto ("como uma Ação Bônus", "usa sua ação", "como Reação, quando…"; "sempre que usar a ação Atacar" = passiva) → JEV
`combat-option-cost` ("Custo de ação no combate", pergunta tipada: custo e gatilho), **em segundo plano** com teto
`MADDOX_COMBAT_CLASSIFY_TIMEOUT_MS`; quando classifica, a mesa recebe `maddox.game.changed`. Sem resposta (chave desligada, falha,
teto) = "Custo não identificado: o Maddox confere" (ação livre validada), com log. Cache negativo em memória: a mesma habilidade só é
reenviada (e a configuração relida) depois de `MADDOX_COMBAT_CLASSIFY_RETRY_MS` (10 min).

**Vez dos adversários (ferramentas do narrador, só nos graus táticos):**

| Ferramenta | Comportamento |
| --- | --- |
| `monster_action { combatente, acao, alvos[], modo?, reacao? }` | Só quem está em "agem agora", na ordem (anterior que já passou = erro); ação do próprio bloco, economia e recarga conferidas; Ataques Múltiplos = chamadas seguidas. Ataque: o servidor rola contra a CA da ficha (+5 do Escudo) e o dano; se o alvo tem reação de gatilho "atingido", devolve `aguardando_reacao` (narre até o golpe e pare). Salvaguarda: dano rolado já, card de salvaguarda para cada personagem (espera; falha automática por condição sem card), salvaguarda dos adversários rolada pelo servidor. `reacao: true` = ataque de oportunidade (recusado contra quem se desengajou) |
| `apply_effect { alvo, condicao?, remover?, duracaoRodadas?, dano?, tipoDano?, cura?, descricao }` | Efeito adjudicado: condição (com duração) e dano/cura em dados rolados pelo servidor |
| `request_damage_roll { personagem, dados, tipoDano?, alvo, motivo }` | Dano de uma ação livre aceita: o JOGADOR rola (espera) |
| `offer_reaction { personagens[], gatilho, descricao, fonte? }` | Abre a janela (saiu do alcance, conjura magia, preparada, outro) para quem tem reação disponível; `saiu-do-alcance` exige `fonte` (o adversário) |
| `get_combat` | Ordem, rodada, "agem agora", próxima vez, PV/CA/condições/ações |

Tudo mexe numa **cópia de trabalho** no job da fila (`jobWorkspace`): ferramentas seguintes veem o PV já reduzido, e a cópia só é
gravada (`commitTacticalWorkspace`: combate pela versão, PV e testes contra a morte na ficha, mortes) depois que a narração foi gerada,
antes do fim do combate. Geração que falha não muda nada; a nova tentativa rola de novo (log). Dano a 0 PV: Inconsciente, perde a
concentração; dano a 0 PV = falha (crítico = duas); excedente ≥ PV máximo = morte instantânea. Dano em quem concentra abre a
salvaguarda de Constituição (CD max(10, metade), até 30). 3 falhas → `MaddoxCharacter.status = "dead"` (auditado), fora da ordem.

**Reações** (`combat-reactions.ts`): mensagem `combat-reaction` (índice único: uma pendente por personagem) com as opções só para quem
reage e prazo `MADDOX_REACTION_TIMEOUT_MS` (45 s, contagem na tela). Offline recusa na hora; prazo vencido = não reage (timer no
processo). Resolução: Escudo (+5 na CA até o próximo turno, reavalia o acerto, gasta o espaço), ataque de oportunidade (abre um card
de ação com ataque e dano rolados pelo jogador dentro da espera; sem o adversário, não sai e a reação não é gasta), Contramágica (salvaguarda de Constituição do conjurador contra a CD
de magia da ficha), Esquiva Sobrenatural (metade do dano), ação preparada; as demais são registradas e o Maddox adjudica. Sem
reação, o golpe que esperava entra. Esperas por turno do mestre em combate: `MADDOX_COMBAT_WAIT_ROUNDS_MAX` (10); passado o teto,
novas janelas não abrem.

**Fim.** `end_combat` como no Maddox 6 (recusado com salvaguarda/reação/rolagem esperando). A tarefa manda encerrar quando todos os
inimigos caem ou nenhum personagem fica de pé; se o Maddox não encerrar em `MADDOX_COMBAT_FORCE_END_AFTER` (2) narrações (ou
imediatamente quando o grupo caiu), o servidor encerra como `vitoria`/`derrota` (log de aviso) e a mesa volta ao turno normal com todos
os elegíveis.

**Prompt.** Regra "## Combate tático" (`tacticalCombatRule`), bloco "## Combate tático em andamento" (estado do `get_combat`), tarefa
com "agem agora, nesta ordem: …" e a vez seguinte (`tacticalTaskLines`), resultados das esperas na continuação
(`waitRoundResults`) e a transcrição com os resumos dos cards. No OpenCode, a lista do MCP inclui `monster_action`, `apply_effect`,
`request_damage_roll`, `offer_reaction`.

**DTO e tela.** `combat.tactical` (ordem com PV dos personagens, faixa "Ileso/Ferido/Muito ferido/Caído" dos adversários — sem PV nem
CA —, condições, concentração, morrendo/estável/morto, quem age), `turn.combatActor`, `turn.pendingCombat`, `me.combat` (vez, economia,
opções de Ação/Ação bônus, morrendo) e `combatAction`/`combatRoll`/`combatReaction` nas mensagens (rolagem pendente só para quem rola;
opções da reação só para quem reage). Stream: `combat-rolled` (todos repetem o dado). Tela: `InitiativeTracker` (coluna da direita e
faixa compacta no cabeçalho em telas pequenas), `CombatActionBar` (na minha vez substitui o campo: Ação, Ação bônus, economia,
"Movimento e posição", Encerrar turno, "Perguntar ao mestre"; um único painel ancorado ao botão que o abriu, `anchorLeft` limita ao
contêiner e à janela; categorias em `OptionTabs`, alvos/círculo/perícia em `GlassSelector`), `CombatWaitBar` ("Vez de Kael
(iniciativa 17) · Rodada 2"), cards `CombatActionCard` (dado inline, Acertou/Errou/Crítico, dano), `CombatRollCard`,
`CombatReactionCard` (contagem, "Não reagir", "Não reagir no lugar" do dono) e `CombatOrderCard`.

Sem permissão nova (`maddox.play` cobre). Fora do escopo: grid e alcance medido (o movimento é texto), ações lendárias e de covil,
XP e subida de nível, reações dos adversários além do ataque de oportunidade conduzido pelo Maddox, novo personagem depois da morte.

## Modo fiel ao D&D (Maddox 8)

Entrega 8 (DND-14, #204). No **rigor máximo (Fiel ao D&D)** o mundo é de fantasia D&D — um cenário oficial (Reinos Esquecidos,
Eberron…) ou um mundo **próprio** no estilo do D&D — e os **povos (raças) e as classes do mundo são só os do catálogo**. Nos graus
menores essas restrições não se aplicam: Narrativo e Flexível aceitam qualquer universo, setting, estilo, raça ou classe, conforme o
roteiro; Equilibrado prefere o catálogo e aceita criações próprias; o **Rigoroso continua como no Maddox 5** (ambientação livre, raça,
classe, subclasse, origem e itens da ficha só do catálogo).

Código: `world-catalog.ts` (PURO: `worldAllows` — lista vazia = todo o catálogo —, `worldCatalogOf`, `worldCatalogLines`),
`server/interview-tools.ts` (`MADDOX_WORLD_TOOLS`), `server/character-build.ts` (`buildContextOfCampaign`, `outOfWorldItems`,
`similarCatalogNames`), constantes `MADDOX_WORLD_CATALOG_RIGORS` e `MADDOX_CATALOG_REWARD_RIGORS` (`["fiel-dnd"]`).

- **Seção fixa por grau** (`universeSection` em `interview-prompt.ts`): entra em toda entrevista, depois do bloco do rigor, e vale
  mesmo quando as instruções do entrevistador ou o guia do roteiro (editáveis) não falam de universo. No Fiel: recusar com gentileza
  universos de fora do D&D (anime, série, ficção científica, mundo moderno) e propor uma alternativa; nunca inventar povos, classes ou
  subclasses; o catálogo é a fonte de verdade e, onde não houver regra clara, o Maddox decide. O universo é texto livre: a trava real
  no servidor fica nos povos e classes.
- **Cenário do Fiel** (`usesWorldTools`): a entrevista de cenário passa a usar o caminho com ferramentas (`usesInterviewTools`; AI SDK
  ou o MCP `dndicas-maddox` com o token da entrevista) e recebe `search_catalog`, `get_catalog_entity` e:
  - `update_world_options { racas?, classes? }` — **restritiva**: cada nome (ou id, sem acento/caixa, só ativos) é resolvido no
    catálogo; um único nome fora dele recusa a chamada inteira ("Nada foi gravado. Povos (raças) fora do catálogo do DnDicas: “Kitsune”.
    Opções: …") sem gravar. Cada lista enviada substitui a anterior; grava `maddox_interviews.world` pela trava da geração.
  - `get_world_options {}` (leitura). As duas recusam fora do cenário do Fiel (`scope: "scenario"`; as ferramentas da ficha têm
    `scope: "character"` e `buildInterviewAiTools(context, kind)` só entrega as do tipo da entrevista).
  - Prompt: "## Povos e classes do mundo" (consultar o catálogo, combinar e gravar, lista vazia = todo o catálogo, conferir antes da
    síntese) e "### Mundo: situação atual" a cada turno.
  - **Conclusão:** antes de consolidar e sem pegar a trava, revalida cada povo/classe gravado; um inativado depois responde 409
    `WORLD_OPTIONS_INVALID`. Concluir grava `campaign.worldCatalog { races, classes }` (`[{ id, name }]`) e audita as listas. Sem
    lista, a conclusão não é bloqueada: todo o catálogo vale.
- **Personagem do Fiel:** o prompt lista "Povos (raças) deste mundo" e "Classes deste mundo" dentro de "## Catálogo do DnDicas";
  `update_character_build` recusa raça ou classe do catálogo que não estejam no mundo ("A classe “Mago” não existe no mundo desta
  campanha. Opções deste mundo: Guerreiro."), e o retorno traz `mundo` (e `foraDoMundo`, se houver). A conclusão responde 409
  `CHARACTER_NOT_IN_WORLD` se a ficha gravada tiver raça ou classe fora do mundo.
- **Narrador do Fiel:** `narratorCatalogRule(rigor, worldCatalog)` acrescenta que as entidades de regras do catálogo são a fonte de
  verdade, NPCs só dos povos e classes do mundo, magias/itens/criaturas/recompensas só do catálogo, e as listas do mundo.
  `end_combat` **recusa** recompensa em item fora do catálogo ("No Fiel ao D&D toda recompensa em item vem do catálogo: … Parecidos no
  catálogo: …"), sem gravar; Equilibrado e Rigoroso seguem com o item próprio com aviso.
- **Tela:** o card do Fiel no slider troca "Só raças, classes, magias e itens…" por "Mundo de fantasia D&D, oficial ou próprio, com
  povos e classes do catálogo do DnDicas" + "Só magias e itens cadastrados no DnDicas". O lobby mostra "Povos deste mundo: …" e
  "Classes deste mundo: …" (`WorldCatalogLines`, só quando há lista). DTO da campanha: `worldCatalog`.

Campanhas Fiel antigas ficam sem lista (todo o catálogo), sem migração. Sem permissão nova (`maddox.play` cobre).

## Diário da campanha (Maddox 9)

Código: `server/journal.ts` (serviço), `journal-search.ts` (módulo puro: regex sem acento, trecho, texto corrido),
`journal-schemas.ts`, `journal-types.ts`, `hooks/useMaddoxJournal.ts`, `components/journal/`.

**O que os jogadores consultam.** Só o que eles sabem: NPCs e memórias com `visibility: "players"`, a descrição pública dos
NPCs (o `masterNotes` nunca é lido, buscado nem existe nos DTOs), o histórico da mesa (o mesmo `messagesDto` da mesa, que esconde
a CD secreta), a situação atual (`campaign.state`), o cenário e a situação inicial, e o grupo (perfil da entrevista e
`currentState` de cada personagem; a ficha D&D continua só do dono dela). O filtro `PLAYER_VISIBLE` vai em toda consulta de NPC
e memória, junto do `campaignId`, e os DTOs são montados campo a campo. O dono da campanha é jogador e vê o mesmo que os outros.
Acesso: membro `joined` com `maddox.play` (quem saiu ou não participa = 404). Só leitura: sem auditoria.

**Estado e condição públicos.** Esses campos não têm `visibility`: até o Maddox 9 o narrador os tratava como rascunho interno
e pode ter gravado neles uma pista ou um segredo. Por isso só aparece (no resumo, na aba Grupo e na busca) o que foi
**regravado desde o Maddox 9**, já com o aviso de que é público: `update_campaign_state` acrescenta os campos que escreveu a
`campaign.state.publicFields` e o diário mostra só esses; `update_character_state` (e as condições de fim de combate e de morte
no combate tático, que já são públicas) marca `currentStatePublic: true`. Estado e condição antigos ficam vazios até o Maddox
regravá-los. O aviso está no `MADDOX_PERSISTENCE_RULE`, nas descrições das duas ferramentas e, a cada turno, logo abaixo do
título do estado no prompt (`MADDOX_PUBLIC_STATE_NOTE`). Risco residual: em campanhas novas, a proteção depende de o modelo
obedecer ao prompt; o segredo tem lugar próprio (`masterNotes` ou `save_memory` com `visibility: master`).

**Busca.** Regex que ignora acentos e caixa (`accentInsensitivePattern`: cada vogal/ç/ñ vira a classe das variantes; o resto é
escapado), também por pedaço de palavra, sempre filtrada pela campanha — o índice de texto antigo das memórias não é usado (não
começa por `campaignId` e só acha palavras inteiras). Procura em NPCs (nome e descrição pública), memórias (título, texto e tags),
falas da mesa (`narration`, `declaration`, `question`, `answer`, sem as respostas que falharam), grupo (nome, perfil e condição) e
situação atual. Termo de 2 a 100 caracteres (fora disso, 400). Até 20 por grupo (`hasMore`), cada um com um trecho de ~160
caracteres em texto corrido (sem `{{Tipo:Nome}}` nem ênfase do Markdown). O `search_memories` do narrador usa o mesmo regex.

API (todas `GET`, `maddox.play`, usuário efetivo):

- `GET /api/maddox/campaigns/[id]/journal` — resumo: situação atual, cenário, missões ativas, contagens, `myMemberId` e avatar do Maddox.
- `GET …/journal/npcs?cursor=` e `GET …/journal/memories?kind=&status=&cursor=` — página de 30, do mais recente (cursor `_id`;
  inválido = 400; `kind` inválido = 400 com as opções). Missão sem situação gravada conta como `ativa`.
- `GET …/journal/party` — personagens do grupo.
- `GET …/journal/search?q=` — busca.
- O histórico usa `GET …/game/messages` (sem `before` = página mais recente).

Índices novos (pela `ensure-maddox-indexes`): `{ campaignId, visibility, _id: -1 }` em `maddox_npcs` e
`{ campaignId, visibility, kind, _id: -1 }` em `maddox_campaign_memories`.

**Tela `/campanhas/[id]/diario`** (`pageAccess`): cabeçalho da campanha (`CampaignChatHeader`, cor do rigor, "Voltar à mesa"),
card de busca com espera de 300 ms e resultados agrupados (Situação atual, NPCs, Locais, Missões, Outras anotações, Grupo,
Histórico da mesa) com o termo destacado; abas `IntegrationTabs` (`?aba=historico|npcs|locais|missoes|anotacoes|grupo`):
histórico em modo leitura (`GameMessageList readOnly`: nenhum card é "meu", então nada de rolar, cancelar ou reagir;
`?msg=<id>` carrega até 10 páginas atrás da mensagem e a destaca, depois avisa "Mensagem muito antiga"), NPCs (morto esmaecido),
locais, missões (filtro por situação em `GlassSelector` com as cores de raridade, na URL `?situacao=` — o link de um resultado
da busca o zera), anotações (`?tipo=evento|relacao|fato|outro`) e grupo. NPCs e anotações abertos por link fora da primeira
página: a lista carrega as páginas seguintes até o item (até 10, `MADDOX_JOURNAL_SEEK_PAGES`) e depois avisa "Item muito antigo:
use “Carregar mais”". Ao lado, "Situação atual" (com "atualizada no turno N" e as missões ativas) e o cenário recolhível. Cada item tem âncora
(`#npc-…`, `#anotacao-…`, `#personagem-…`) e fica em destaque quando aberto por link. Em dia pelo `maddox.game.changed`
(as chaves ficam sob `MADDOX_CAMPAIGNS_KEY`).

**Pontos de entrada.** Na mesa, "Buscar no diário" (diálogo com a mesma busca; o resultado leva ao diário na aba e no item) e
"Diário" no cabeçalho; cada NPC do painel "NPCs conhecidos" abre o NPC no diário. No lobby, "Diário" depois que a campanha começa.
Sem atalho de teclado: Ctrl/⌘+K já é a busca global do app.

**Aba Imagens e legendas na busca (DND-22).** Ver "Densidade das narrações e imagens no diário (DND-22)".

## Imagens nas cenas (Maddox 10)

Código: `server/scene-images.ts` (regras, cota, reserva, geração em segundo plano, pedidos do dono, DTO), `server/scene-image-references.ts`
(aparência), `server/scene-image-hints.ts` (JEV), `server/scene-image-describer.ts` (descrição para o pedido manual),
`server/combat-image.ts` (fim de batalha), ferramenta `request_scene_image` e `save_npc.gerarRetrato` em `server/master-tools.ts`,
coleção `maddox_scene_images` (`models/maddox-scene-image.ts`), `components/game/GameSceneImage.tsx`, `SceneImageButton.tsx`,
`NpcPanel.tsx`, `components/campaigns/SceneImagesField.tsx`, `components/settings/MaddoxSceneImagesCard.tsx`,
`hooks/useMaddoxSceneImages.ts`. Usa o **Gerador de imagens** já integrado (`generateAndStoreDndImage`).

**Configuração** (`settings.sceneImages`, seção "Imagens" da aba; padrão tudo desligado; configuração antiga recebe o padrão):
`enabled`, `situations` (fixas, `MADDOX_SCENE_IMAGE_SITUATIONS`: abertura da campanha, novo local ou cenário, fim de batalha, clímax ou
cena importante, primeiro encontro com NPC importante, missão concluída, retrato de NPC), `custom` (até 10 personalizadas: nome,
"quando acontece" — orienta o Maddox e o JEV —, ativa), `minNarrationsBetween` (0–50, padrão 3), `maxPerDay` (1–100, padrão 10),
`aspectRatio` (padrão 16:9; retrato sempre 1:1) e `style` (estilo visual). A aba avisa quando o Gerador está indisponível ou o modelo
dele não aceita imagens de entrada. **Chave por campanha**: `campaign.sceneImages` (padrão ligada; "Imagens nas cenas: Ligadas |
Desligadas" na criação e na edição, muda a qualquer momento) — desligada, nada automático; o pedido manual continua.

**Origens** (`source`):

| Origem | Quem dispara | Regras | Ligada a |
| --- | --- | --- | --- |
| `tool` | `request_scene_image { situacao, descricaoVisual, legenda?, personagens?, npcs?, catalogo? }` | Só nas narrações; situação ativa (fixa ou personalizada) e chave da campanha; intervalo, uma por turno e teto; JEV opcional | Narração |
| `combat-end` | `onCombatEnded` com a `finalScene` | Situação "Fim de batalha" ativa e chave da campanha; intervalo, uma por turno e teto | Card "Fim do combate" |
| `manual` | Botão **"Gerar imagem da cena"** do dono | Só o teto diário e uma manual por vez (ignora situações, chaves e intervalo) | Última narração |
| `npc-portrait` | `save_npc { gerarRetrato: true }` ou **"Gerar retrato"** do dono | Automático: situação "Retrato de NPC", chave da campanha, NPC conhecido dos jogadores e sem retrato (uma vez). Dono: só o teto | `npc.portraitUrl` |

**Ferramenta.** Validação restritiva: situação inexistente ou inativa, personagem desconhecido, NPC desconhecido ou só do mestre e
entidade fora do catálogo recusam com a lista das opções e nada é guardado; `combat-end`/`npc-portrait` pela ferramenta, segunda imagem
na narração, resposta a pergunta, cota esgotada e Gerador indisponível também recusam com o motivo. O pedido fica no job (como os
testes) e só vira imagem **depois** que a narração é gravada (`scheduleDraftImages` em `runMasterTurn`): narração que falha não gera
nada. Oferecida à AI SDK só quando há situação ativa pedida pelo narrador; no MCP `dndicas-maddox` existe sempre e recusa pelo
contexto. A regra **"## Imagens da cena"** (`sceneImagesRule`) lista as situações ativas e, fora da cota, avisa "AGORA: … Não peça
imagem nesta narração."; com "Retrato de NPC" ativa, orienta o `gerarRetrato`. `save_npc` salva o NPC de qualquer jeito: o retorno
`retrato` diz se o retrato foi pedido ou por quê não.

**Frequência.** Contam as imagens com `counts: true` (`pending`, `generating`, `done`); `failed` e `skipped` liberam a vaga. Intervalo
(só automáticas): a última automática precisa estar `minNarrationsBetween` turnos do mestre antes. Uma automática por turno: índice
único parcial `{ campaignId, turnNumber, slot }` com `counts: true, slot: "auto"` (a duplicata vira `skipped`). Teto: todas as origens
nas últimas 24 h; a reserva reconta depois de gravar e descarta (`skipped`, `daily-limit`) o que passou em pedidos simultâneos.

**Referências de aparência.** Como na imagem da ficha (`formData`), os **dados** de quem aparece vão em JSON (perfil da entrevista e
campos visuais da ficha D&D dos personagens; descrição pública dos NPCs — nunca `masterNotes` —; entidades do catálogo compactas;
cenário e local), e as **imagens cadastradas** vão como referência ao gerador (`prompt: { text, images }` da SDK `ai`), até 6, na
ordem personagens (retrato da campanha ou, sem ele, a foto da ficha) → NPCs (retrato) → catálogo (`image`). Imagens do storage são lidas
pela chave (`/api/upload?key=`), externas por `fetch` (10 s, 5 MB); a que falha sai com aviso. Modelos que aceitam imagens de entrada:
Gemini `*-image*` e OpenAI `gpt-image-*` (`imageModelSupportsReferences`); nos demais (Imagen, `dall-e-*`), só os dados, com aviso no log.

**Geração.** Em segundo plano, **fora da fila da campanha** (o turno não espera), no máximo 2 simultâneas no processo, teto de 120 s.
JEV "Gerar imagem na cena" (só `tool`): abaixo de 0,5 → `skipped` (`jev`); falha ou teto do JEV → gera (aviso no log). Arquivo em
`maddox/campaigns/{id}/scenes/{imagem}` ou `…/npcs/{npc}-{ts}`; consumo na origem `maddox-scene-image` (assunto: a campanha). Ao
terminar (ou falhar) avisa a mesa (`publishGameChanged`). Falha = `failed` com "Não foi possível gerar a imagem desta cena.".
Imagens `pending`/`generating` há mais de 5 min (processo reiniciado) viram `failed` na leitura da mesa — menos as que estão gerando ou,
no pedido manual, esperando a vez na fila da campanha neste processo. Legenda: o prompt orienta ~160 caracteres
(`MADDOX_SCENE_IMAGE_CAPTION_GUIDE`); o corte só acontece no teto de proteção de 500 (`MADDOX_SCENE_IMAGE_CAPTION_MAX`).

**Pedido manual.** `POST /api/maddox/campaigns/[id]/scene-images` (`maddox.play` + entrevista concluída + dono; 202). Reserva logo
(o placeholder aparece na última narração) e põe na fila da campanha uma geração curta do narrador (30 s, sem ferramentas) que devolve
`{ descricaoVisual, legenda, personagens, npcs }` (nomes fora da campanha são ignorados, com aviso); falhou → a última narração vira a
descrição, com todos os personagens. Erros: 403 (não dono), 409 `SCENE_IMAGE_BUSY`, `SCENE_IMAGE_LIMIT`, `AI_IMAGE_UNAVAILABLE`,
`NO_NARRATION`, `CAMPAIGN_NOT_ACTIVE`. **Retrato**: `POST /api/maddox/campaigns/[id]/npcs/[npcId]/portrait` (dono; NPC conhecido dos
jogadores; 409 `SCENE_IMAGE_BUSY` se o retrato dele já está sendo pintado).

**DTO e tela.** `sceneImages` (lista, na ordem do pedido) nas narrações e nos cards de fim de combate (`MaddoxGameSceneImageDto`:
status, URL, legenda, rótulo da situação, origem; nunca a descrição; `skipped` não chega). A imagem do Maddox e a pedida pelo dono podem
dividir a mesma narração; com alguma pronta, as que falharam saem da lista (uma falha nunca esconde uma imagem pronta); `npcs[].portraitGenerating`; `sceneImages` no estado da mesa
(`MaddoxSceneImageControlDto`: dono, pode pedir, motivo, gerando, restantes hoje, chave da campanha, pode pedir retrato). Na bolha:
placeholder "O Maddox está pintando a cena…", a imagem com a legenda (clique amplia no `GlassModal`) ou a linha da falha. Cabeçalho da
mesa: "Gerar imagem da cena" (só o dono; desabilitado com o motivo). "NPCs conhecidos": retrato e "Gerar retrato" (dono). As páginas
de mensagens já carregadas com "Carregar anteriores" só mostram a imagem nova depois de recarregar (as imagens novas são das narrações
recentes, que vêm no estado da mesa).

Sem permissão nova (`maddox.play` cobre a mesa e os dois pedidos; a configuração é da aba de IA, só administradores).

## Densidade das narrações e imagens no diário (DND-22)

**Densidade.** `campaign.density` (`MADDOX_DENSITY_LEVELS`: `concisa`, `breve`, `equilibrada` — padrão —, `detalhada`, `extensa`;
`MADDOX_DENSITY_LEVEL_DEFS` com rótulo, descrição, raridade, tamanho orientado e o que muda). Campanha antiga sem o campo é lida como
`equilibrada` (default do Mongoose e do DTO; sem migração). `POST /api/maddox/campaigns` e `PATCH /api/maddox/campaigns/[id]` aceitam
`density` (inválido = 400 "Escolha uma densidade válida"); o dono muda **a qualquer momento**, inclusive em andamento e com o rigor
travado (como `showCheckDc` e `sceneImages`), com auditoria (antes/depois). Vale a partir da próxima geração: o narrador relê a
campanha a cada tarefa; uma geração em curso termina com o valor anterior.

No prompt, a linha de tamanho (`narrationDensityLine`) vai no **texto da tarefa** (`narratorTaskText(task, { density })`), não nas
instruções: entra na abertura, na narração do turno, nas continuações (testes e rolagens) e na vez dos adversários, e **nunca** na
resposta a uma pergunta (que continua "em poucas frases") nem nas entrevistas. Assim a mudança vale no turno seguinte mesmo com a
sessão do OpenCode reaproveitada. O `MADDOX_NARRATOR_FORMAT` passou a pedir "parágrafos de prosa, no tamanho pedido na tarefa".
É orientação ao modelo, sem corte por `maxOutputTokens` (cortaria a narração e as chamadas de ferramenta): o modelo pode sair um pouco
da faixa.

Tela: `DensityCard` (cópia estrutural do `RigorCard`: slider com marcas, cor de raridade, descrição animada e duas colunas
"Tamanho por narração" e "O que muda") na criação (`CreateCampaignDialog`, sempre envia `density`) e na edição (`EditCampaignDialog`,
sempre habilitado; envia só se mudou). `DensityChip` ("Narração breve") na página e no card da campanha.

**Aba Imagens do diário.** `GET …/journal/images?kind=todas|cenas|retratos&cursor=` (`listJournalImages`; `maddox.play`, membro
ativo, página de 30 do mais recente, cursor `_id`; `kind` inválido = 400 com as opções). Só imagens `done` com URL: cenas
(`tool`, `combat-end`, `manual`; as mensagens da mesa são públicas) e retratos (`npc-portrait`) **só de NPCs com
`visibility: "players"`** — o retrato some se o NPC voltar a ser só do mestre. O DTO (`MaddoxJournalImageDto`: URL, legenda, rótulo da
situação, origem, turno, `messageId`, NPC) nunca traz a descrição enviada ao gerador, as referências nem a chave do storage. O resumo
ganha `counts.images` (badge da aba), com o mesmo filtro. A busca do diário procura também na **legenda** das imagens visíveis (grupo
"Imagens", com miniatura, link `?aba=imagens#imagem-<id>`).

Tela: aba `imagens` (`?aba=imagens`, filtro `GlassSelector` "Todas | Cenas | Retratos" em `?imagens=`), `JournalImageGallery`: grade
de cards com "Turno N", a origem (situação, "Pedido do dono", "Fim de batalha" ou "Retrato de <NPC>"), a figura da mesa
(`GameSceneImage`: legenda e ampliar) e "Ver no histórico" (`?aba=historico&msg=`) ou "Ver NPC"; âncora `#imagem-<id>` com destaque
e procura nas páginas seguintes, como as outras listas. Atualiza pelo `maddox.game.changed` (chaves sob `MADDOX_CAMPAIGNS_KEY`).
Imagens pendentes ou com falha continuam só na mesa e no histórico.

Sem permissão nova: criar/editar já exigem `maddox.play` e ser o dono; o diário exige `maddox.play` e ser membro ativo.

## Testes

`tests/backend/maddox/*` (configuração, roteiros, avatar, sessões, rotas, `campaigns.test.ts` com MongoDB em
memória, `campaign-routes.test.ts`, `grant-maddox-play.test.ts`) e `tests/frontend/maddox/*`
(`maddox-tab.test.tsx`, `maddox-campaigns.test.tsx`, `maddox-campaigns-realtime.test.tsx`; happy-dom).
Maddox 5 (ficha): `interview-character-build.test.ts` (ponta a ponta com o catálogo real em memória: Fiel nível 3 com card de PV e a
ficha campo a campo, 409 de escolhas e de PV, Mago com magias, refazer sem duplicar, Equilibrado com escolhas próprias, graus
narrativos), `character-build-rules.test.ts`, `tests/frontend/character-sheets/sheet-rules.test.ts` e
`tests/frontend/maddox/maddox-interview-hit-points.test.tsx`; fixture do catálogo em `tests/backend/maddox/helpers/sheet-catalog.ts`.
Maddox 8: `faithful-mode.test.ts` (**critério de aceite**: Fiel com povo inventado recusado, lista do mundo gravada,
`WORLD_OPTIONS_INVALID`, personagem só com raça/classe do mundo e `CHARACTER_NOT_IN_WORLD`; lista vazia = todo o catálogo; Narrativo
com cenário de anime e personagem inventado sem ferramentas nem recusas), `world-catalog.test.ts`, `interview-prompt.test.ts` e
`narrator-prompt.test.ts` (seção por grau), `maddox-mcp.test.ts` (ferramentas do mundo), `narrator-tactical-combat-campaign.test.ts`
(recompensa fora do catálogo recusada no Fiel) e `maddox-campaigns.test.tsx` (card do slider e linhas do mundo no lobby).
Maddox 2: `interview-prompt.test.ts`, `interviews.test.ts` (MongoDB em memória, IA/JEV/OpenCode mockados),
`interview-routes.test.ts`, `catalog-mentions.test.ts`, `catalog-markup.test.ts` e `tests/frontend/maddox/maddox-interview.test.tsx`.
Maddox 3: `game.test.ts` (MongoDB em memória, presença mockada: 1/2/5 jogadores, "Não fazer nada", pergunta, entrada no
meio, presença, pular, saída, concorrência, trava do mestre, paginação), `game-routes.test.ts`, `game-presence-auth.test.ts`
(API de presença e `/api/pusher/auth`), `tests/backend/integrations/channel-auth.test.ts` e
`tests/frontend/maddox/maddox-game.test.tsx` (mesa, happy-dom); o lobby com "Iniciar campanha"/"Entrar na mesa" em
`maddox-campaigns.test.tsx`.
Maddox 7: `narrator-tactical-combat-campaign.test.ts` (critério de aceite: Fiel com 3 personagens, iniciativa, Ação com Ataque Extra,
Ação bônus com a outra arma Leve e Palavra Curativa, Goblin com Ataques Múltiplos, Escudo, fim com recompensa na ficha, estado
conferido no banco), `tactical-combat.test.ts` (Outra ação pelo rigor, cancelar, pular/ausência, teste contra a morte, reações,
classificador), `combat-rules.test.ts`, `combat-options.test.ts`, `combat-monsters.test.ts` e
`tests/frontend/maddox/maddox-tactical-combat.test.tsx` (barra, menu ancorado, rastreador, cards; happy-dom).
Maddox 4: `narrator-campaign.test.ts` (**critério de aceite**: campanha narrativa com 2 jogadores e 6 narrações com o narrador
real sobre um `streamText` roteirizado — persistência de NPCs, locais, missões, checkpoint e condição dos personagens e o estado de
volta ao prompt; pergunta sem trocar de turno; falha do provedor), `master-tools.test.ts`, `narrator-prompt.test.ts`,
`narrator-opencode.test.ts`, `opencode-mcp.test.ts`, `maddox-mcp.test.ts` (token e rota), `action-validation.test.ts`,
`game.test.ts` (fila, streaming no barramento, pergunta em segundo plano, trava com geração ativa, `ACTION_INVALID` por rigor),
`game-routes.test.ts` (stream), `settings.test.ts` (URL do MCP); na tela, `maddox-game.test.tsx` (ao vivo, falhas, foco),
`maddox-game-stream.test.ts`, `maddox-interview.test.tsx` (foco) e `maddox-tab.test.tsx` (card do MCP).
Maddox 5: `game-checks.test.ts` (**critério de aceite**: campanha Fiel ao D&D, o narrador real pede Furtividade para a jogadora, só
ela recebe o pedido, a rolagem usa o motor com uma regra de dado e o modificador da ficha, o resultado volta na continuação e a
consequência é narrada; rolagem dupla, outro jogador, não membro, dono no lugar, CD visível, duas rolagens na rodada, saída do
jogador, falha da geração, teto de rodadas, campanha narrativa e o JEV "Pedir teste"), `check-modifier.test.ts`,
`master-tools.test.ts` e `maddox-mcp.test.ts` (`request_check`), `narrator-prompt.test.ts` (regra dos testes, resumo da ficha,
continuação), `game-routes.test.ts` (rota de rolagem), `campaigns.test.ts` (`showCheckDc`); na tela, `maddox-game.test.tsx` (card,
espera, "Rolar no lugar", repetição da rolagem, CD, cancelado, "Minha ficha", NPCs e o teste estático dos controles),
`maddox-game-stream.test.ts` (`check-rolled`), `maddox-campaigns.test.tsx` e `tests/frontend/dice-roller/dice-roller-panel.test.tsx`.
Maddox 6: `narrator-combat-campaign.test.ts` (**critério de aceite**: campanha narrativa com o narrador real — inicia, atualiza e encerra o
combate, conferindo o combate gravado, a ordem dos cards, o NPC morto, a memória `evento`, a condição do personagem, a imagem
`skipped` (imagens desligadas), o DTO sem segredos e o prompt/transcrição; recusas; falha da geração sem gravar; Rigoroso sem ferramentas;
Equilibrado com moedas e itens na ficha, item próprio com aviso e reaplicação sem duplicar; JEV "Início ou fim de combate"),
`narrator-prompt.test.ts` (regra, bloco, lembrete, MCP, nota do JEV, transcrição), `maddox-mcp.test.ts` (ferramentas no MCP),
`ensure-maddox-indexes.test.ts` (índice do combate ativo); na tela, `maddox-game.test.tsx` (cards, chip "Em combate" que aparece e some
pelo tempo real, NPC morto).
Atributos na entrevista (Maddox 5): `interview-ability-scores.test.ts` (fluxo completo com o entrevistador real sobre um
`streamText` roteirizado: card pedido, cinco rolagens no motor, envio, fala interna fora do DTO, bônus recusado/aplicado, consulta e a
ficha com base + bônus; conjunto padrão/compra de pontos, reiniciar, rolagens simultâneas, trava, entrevistador indisponível,
"Tentar de novo", geração que falha, card já aberto, reabrir com `prefill`, `novaRolagem`, grau narrativo e cenário),
`interview-scores.test.ts`, `interview-prompt.test.ts`, `interview-routes.test.ts` e `maddox-mcp.test.ts` (token de entrevista); na
tela, `maddox-interview-ability-scores.test.tsx`.
Catálogo: `catalog-tools.test.ts` (serviço real sobre o MongoDB em memória: lista por tipo sem inativas, acento, limite, resumo e
detalhe compactos, erros), `interview-ability-scores.test.ts` ("origem do bônus e o catálogo": busca e bônus de origem do catálogo em
Fiel, recusa em Fiel e Rigoroso com a lista, origem própria no Equilibrado, nome sem acento ou original, 409
`BACKGROUND_NOT_IN_CATALOG` na conclusão), `game-checks.test.ts` (narrador consulta em Narrativo e Fiel sem gravar),
`maddox-mcp.test.ts` (catálogo com token do narrador ou da entrevista) e os testes dos prompts.
Maddox 9: `journal.test.ts` (**critério de aceite**: NPCs, locais e um fato só do mestre, NPC público com `masterNotes`; nenhuma
resposta do diário traz o segredo e buscar por ele não acha nada; a busca acha local, NPC e narração sem acento, por pedaço e
pelas tags; grupo, missões, paginação, 400 e 404), `journal-search.test.ts`, `journal-routes.test.ts`, `master-tools.test.ts`
(`search_memories` sem acento, aviso de estado público), `narrator-prompt.test.ts`; na tela, `maddox-journal.test.tsx` (abas,
busca, estados vazios, histórico só leitura e destaque, grupo, links e o teste estático dos controles), `maddox-game.test.tsx`
(botões, NPC com link e busca rápida) e `maddox-campaigns.test.tsx` (botão do lobby).
Maddox 10: `scene-images.test.ts` (ferramenta com recusas e nomes canônicos, intervalo, teto, uma por turno e concorrência, referências
de aparência com imagens e dados, modelo sem imagens de entrada, falha do gerador, JEV, imagens presas, fim de batalha, pedido manual,
descrição indisponível, retrato pelo dono e pelo `save_npc`), `narrator-scene-image-campaign.test.ts` (**critério de aceite**: narrador
real pede a imagem do novo local, ela fica ligada à narração e o turno abre sem esperar; intervalo respeitado; situação inativa ou campanha
desligada sem a ferramenta; narração que falha sem imagem; resposta sem a ferramenta), `settings.test.ts`, `narrator-prompt.test.ts`,
`maddox-mcp.test.ts`, `game-routes.test.ts`, `ensure-maddox-indexes.test.ts`, `tests/backend/ai/image-lazy-providers.test.ts`
(referências só nos modelos que aceitam); na tela, `maddox-scene-images.test.tsx`, `maddox-game.test.tsx`, `maddox-tab.test.tsx` e
`maddox-campaigns.test.tsx`.
DND-22: `campaigns.test.ts` (densidade padrão, na criação, editada em andamento com auditoria, campanha antiga e schema),
`narrator-prompt.test.ts` (linha de tamanho nas narrações e não na resposta), `narrator-campaign.test.ts` (narrador real: densidade
editada vale na narração seguinte e não na resposta), `journal.test.ts` (aba Imagens: só prontas, sem retrato de NPC secreto nem dados
do gerador, filtro, paginação, contagem e busca pela legenda), `journal-routes.test.ts`; na tela, `maddox-campaigns.test.tsx` (slider
na criação e na edição, chip) e `maddox-journal.test.tsx` (galeria, links, filtro, vazio, destaque e busca).
