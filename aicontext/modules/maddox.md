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
das narrações e imagens no diário (DND-22)". A **DND-31 (#244)** — personagem criado pela entrevista, sem formulário, e o retrato
gerado ao confirmar a síntese — está em "Retrato do personagem (DND-31)". A **DND-55 (#292)** — popover no hover e retrato grande
no clique de qualquer avatar — está em "Avatares: popover e retrato grande (DND-55)".

Código: `src/features/maddox/` (`constants`, `schemas`, `types`, `script-draft`, `models/`, `server/`,
`hooks/`, `components/settings/`).

## Configuração (`/integracoes/ia?aba=agente-maddox`, só administradores)

Aba **"Agente Maddox"** da página Provedores de IA, em seções (`?secao=`). Geral, JEV e OpenCode formam
um único formulário (trocar de seção mantém o rascunho; o Salvar de qualquer uma grava tudo). Os
roteiros e as memórias salvam à parte.

| Seção | Conteúdo |
| --- | --- |
| Geral | Ativo; **Avatar** (upload/substituição pelo `GlassImageUploader` ou "Gerar com o Gerador de imagens" a partir da persona — 1:1, do peito para cima; só vale depois de salvar); modelo do **Maddox (narrador)** e do **Entrevistador** ("Mesmo do Maddox" = sem provedor próprio), cada um com blocos **"Por rigor"** (DND-32, abaixo); instruções de cada um com "Restaurar padrão" (as do **Entrevistador (instruções gerais)** valem para as duas entrevistas) |
| Entrevista: cenário / Entrevista: personagem | Roteiros versionados (abaixo), cada um com "Salvar nova versão do roteiro" e "Desfazer roteiro" |
| Imagens | Imagens nas cenas (Maddox 10): chave geral, situações fixas e personalizadas, intervalo, teto diário, proporção e estilo (seção "Imagens nas cenas (Maddox 10)") |
| JEV | Uma chave por decisão (`MADDOX_JEV_DECISIONS`): pergunta ou ação do jogador, validade de ação livre, pedir teste, início/fim de combate, conhecimento do mestre, fim da entrevista, gerar imagem na cena. Em uso: **"Fim da entrevista"** (Maddox 2), **"Validade de ação livre"** (Maddox 4, só Rigoroso e Fiel ao D&D), **"Pedir teste"** (Maddox 5, orientação ao narrador nos graus com testes) e **"Início ou fim de combate"** (Maddox 6, orientação ao narrador nos graus com combate narrativo), **"Custo de ação no combate"** (Maddox 7) e **"Gerar imagem na cena"** (Maddox 10, filtro da imagem pedida pelo narrador); as demais ainda sem uso |
| OpenCode | Política das sessões e lista das sessões ativas com "Excluir" (confirmação) |

A configuração fica em `ai_feature_settings` (feature `maddox`) com o schema `maddoxSettingsSchema`:
`enabled`, `main` (provedor, modelo, agente, variante, temperatura, tokens), `interviewer` (provedor,
modelo, agente, variante), `instructions`, `interviewerInstructions`, `avatar { url, persona }`,
`opencode { deleteOnCampaignEnd, directory, mcpUrl }`, `jev { [decisão]: boolean }`, `rigorModels { main[], interviewer[] }`. Campos novos
recebem o padrão ao carregar (`withMaddoxDefaults`). Salvar normaliza (agente só no OpenCode, amostragem
só onde o provedor aceita), confere modelo/variante/agente no catálogo (`assertCatalog`), audita
(`FeatureIA`) e avisa em tempo real (`ai-feature-updated`). Sem configuração ativa, a disponibilidade
explica o motivo em pt-BR.

### Modelo por nível de rigor (DND-32, #245)

A seleção de cada cartão (Maddox e Entrevistador) é o **padrão**. O botão curto **"Por rigor"** (`+`, no
cabeçalho do cartão) acrescenta um bloco (`MaddoxRigorModelBlock`) com o **slider de rigor** (só os níveis de
`MADDOX_RIGOR_LEVELS`, nas cores de raridade, como o `RigorCard`) e provedor, modelo, variante e agente do OpenCode
(`MaddoxModelFields`, os mesmos campos da seleção padrão; temperatura e tokens só no padrão do Maddox). Cada cartão
tem no máximo um bloco por nível: o bloco nasce no primeiro nível livre, o slider pula os níveis de outros blocos
na direção do movimento (marcas esmaecidas, `muted` em `SliderMark`) e não sai do lugar sem nível livre; com todos
usados, o botão fica desabilitado. Cada bloco tem "Remover".

- **Formato:** `rigorModels.main` e `rigorModels.interviewer` são listas `{ rigor, provider, model, agent, variant }`
  (`maddoxRigorModelSchema`). O schema recusa rigor repetido na mesma lista ("Já existe uma configuração para o
  rigor X") e bloco sem provedor ou modelo (mesmo com o Maddox desativado). Configurações antigas carregam as listas
  vazias, e o comportamento é o de antes. Salvar normaliza cada bloco e confere cada um no catálogo.
- **Resolução** (`src/features/maddox/model-resolution.ts`, módulo puro): narrador = bloco do rigor da campanha >
  padrão `main`; entrevistador = bloco dele > provedor próprio > ("Mesmo do Maddox") o modelo do narrador **no
  mesmo rigor**. Temperatura e tokens vêm sempre do padrão do Maddox, só se o provedor resolvido os aceita (bloco
  ou provedor próprio do entrevistador: sem amostragem). Sem rigor = padrão.
- **Pontos de uso:** `loadNarrator(rigor)` (narração, validação de ação livre, descrição da cena para imagem),
  `loadInterviewer(rigor)` (turnos e consolidação da entrevista) e `maddoxAvailability(settings, rigor)` na
  criação da campanha (409 se o modelo do rigor escolhido estiver indisponível). No OpenCode, a sessão da
  campanha recebe o modelo resolvido e é realinhada se o bloco mudar.
- O aviso de disponibilidade da aba reflete só o padrão do narrador.

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

O guia é **específico daquela entrevista** e se soma às instruções gerais do entrevistador (aba Geral), que valem
para as duas. **O código não define quantidade de perguntas por mensagem (DND-40):** o ritmo ("uma pergunta por vez",
"duas por vez"…) é o que estiver escrito nas instruções ou no guia; sem regra escrita, não há limite fixo. Os textos
padrão (Restaurar padrão) não trazem quantidade. Instruções e roteiros já gravados mantêm o texto que o dono escreveu
(sem migração).

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
| `maddox_campaign_memories` | **legado** (até a DND-21): memórias da campanha antes de irem para o Engramind; nada lê nem grava, só "Mover memórias" (aba Migração da integração Engramind), que as importa e apaga |
| `maddox_interview_scripts` | versões dos roteiros |
| `maddox_interviews` | entrevistas (Maddox 2): conversa (`messages`), versão do roteiro, status, trava `generating`, resultado consolidado, `build` (ficha) e `world` (povos e classes do cenário no Fiel); única por `{ campaignId, kind, memberId }` |
| `maddox_opencode_sessions` | sessões do OpenCode do Maddox |
| `maddox_scene_images` | imagens nas cenas (Maddox 10): origem, vaga (`auto`/`manual`/`portrait`; `discarded` = lápide de uma imagem perdida ao voltar a um turno, DND-44), situação, descrição (só servidor), legenda, referências, situação da geração, `counts` (ocupa a cota), URL, `discardedBy`; uma automática por turno (índice único parcial) |
| `maddox_campaign_snapshots` | retratos da mesa (DND-44): um por turno jogado (vez dos jogadores aberta) e o de origem da volta pendente; `kind: "start"` = cópia das fichas tirada em "Iniciar campanha" (DND-50, uma por campanha) |
| `maddox_memory_repairs` | exclusões de memória pendentes da perda definitiva de uma volta (DND-44) |

Os índices (inclusive os únicos que sustentam regras: `{ kind, version }` dos roteiros, uma sessão `active`
por campanha/finalidade/membro, `sessionId`, `{ campaignId, userId }` dos membros) são garantidos pela migração
**`ensure-maddox-indexes`** (`src/lib/db/migrations/`), já que o autoIndex não roda em models compilados antes
da conexão.

As memórias **de campanha** são diferentes das memórias **do agente** (canal `dndicas/maddox` no Engramind, lido
pelo narrador e pelo entrevistador; a aba mostra só o link para `/memorias`).

### Memórias de campanha no Engramind (DND-21)

As memórias das campanhas existem **só no Engramind** (sem cópia no MongoDB; detalhes em `engramind.md`,
`src/features/engramind/server/campaign-memories.ts`):

- canais `dndicas/maddox/campanhas/<campaignId>/jogadores` e `…/mestre` (`visibility`), criados **na criação
  da campanha** junto com as categorias `FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO` e `OUTRO` (`kind`);
- `save_memory` grava pelo tipo + título (chave `mx:<tipo>:<título>`), com a situação da missão, o turno e o instante da
  gravação (`gravado:<ms>`, DND-44) em tags;
  o marco do combate usa a chave do combate; com a rede fora, a gravação espera na fila temporária e o narrador é
  avisado;
- `search_memories` e o prompt do narrador leem os dois canais; o **Diário** lê só o canal dos jogadores (ordem
  da última alteração, cursor da rede). Sem a rede: prompt sem as memórias, erro acionável na busca do narrador e
  aviso no Diário;
- campanha `archived` arquiva os dois canais; saindo de `archived`, restaura;
- as memórias antigas da coleção `maddox_campaign_memories` são movidas e apagadas pela aba Migração da
  integração Engramind; até lá não aparecem.

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
| `/campanhas` | Campanhas em que sou **dono ou membro ativo** (`joined`), da mais recente; um card largo por linha (capa: a **última imagem de cena** da campanha — DND-35 —, senão `coverUrl`, sempre atrás do gradiente na cor do rigor; sem imagem, gradiente e espadas; chips de rigor/status/papel em cores de raridade, meu personagem, avatares dos membros, "atualizada há…"). Clicar abre a campanha (link esticado; os avatares abrem o retrato — DND-55). "Nova campanha" abre a criação |
| `/campanhas/[id]` | Cabeçalho, lobby (participantes e personagens), "Criar personagem" (link para a entrevista de personagem), "Gerar retrato (de novo)", "Editar" (dono), "Reiniciar campanha" (dono, campanha já iniciada, com confirmação — DND-50), "Sair da campanha" (jogador), "Remover" (dono, com confirmação) e o painel "Convidar jogadores" (dono) |
| `/campanhas/convite/[token]` | Resumo da campanha do link e "Entrar na campanha". Sem login vai ao login e volta; sem a permissão mostra "Acesso restrito" |

**Criação:** nome (3–80) e **slider de rigor** (`RigorCard`), cópia do card de criticidade do agente
adversário do Opex com o `Slider` copiado em `src/components/ui/opex/slider.tsx` (Radix, prop `color` para a
cor de raridade do nível). Abaixo do slider, duas colunas por nível: "Pelas regras do D&D" (`rules`) e
"Livre, na narrativa" (`free`), de `MADDOX_RIGOR_LEVEL_DEFS`. Passo 1 = Narrativo, último = Fiel ao D&D.
Com o Agente Maddox indisponível (`maddoxAvailability`, com o modelo do rigor escolhido), a criação responde **409 `MADDOX_UNAVAILABLE`** com o
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

**Personagem (esboço):** desde a DND-31 não há formulário de nome e retrato, nem para criar nem para editar.
"Criar personagem" leva à entrevista de personagem (desabilitado até o cenário ficar pronto) e o personagem
nasce quando ela começa (`ensureCharacterDraft`), **sem nome** (`name: ""`, a tela mostra "Personagem em criação")
e sem retrato. Um personagem por membro (`member.characterId`, ligação condicional resolve corridas: quem perde
apaga o seu e usa o do vencedor). O nome vem da entrevista e o retrato é gerado ao confirmar a síntese (seção
"Retrato do personagem (DND-31)"). Bloqueado em campanha encerrada/arquivada.

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
- `POST /api/maddox/campaigns/[id]/character/portrait` — `{}`: gera de novo o retrato do meu personagem (202; DND-31).
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
| Personagem | Cada membro, depois do cenário `done` (409 `SCENARIO_PENDING`). Começar cria o personagem sem nome (depois de validar o entrevistador: indisponível não deixa esboço); responder, repetir ou concluir sem ter começado = 409 `CHARACTER_DRAFT_REQUIRED`. Grava `character.interview.scriptVersion` e, se vazio, `campaign.scriptVersions.character` |
| Campanha encerrada/arquivada | 409 `CAMPAIGN_CLOSED` |
| Uma geração por vez | Trava `generating` condicional; ocupada = 409 `INTERVIEW_BUSY`; trava com mais de 5 min é retomada |
| Limite | 200 mensagens (409 `INTERVIEW_TOO_LONG`); cada resposta até 4.000 caracteres (Zod) |
| Concluída | Não reabre (409 `INTERVIEW_DONE`) |
| Pronto para jogar | `isMemberReadyToPlay` (entrevista `done`) → `member.ready` no DTO; `assertMemberCanPlay` responde 409 `INTERVIEW_REQUIRED`. **Toda ação de jogo chama `assertMemberCanPlay` no servidor** (iniciar a campanha, declarar, passar, perguntar, pular jogador — `server/game.ts`); o selo e os botões da tela não bastam |
| Nome e retrato depois da entrevista | Não são editáveis (DND-31): o nome é o da entrevista e o retrato o gerado; só a falha do retrato tem nova tentativa |
| Visibilidade | A conversa é só de quem é entrevistado; cenário, situação inicial e perfis ficam visíveis a todos os membros; o link da ficha só para o dono do personagem |

**Instruções** (`buildInterviewInstructions`): instruções do entrevistador + entrevista atual + rigor (colunas
`rules`/`free`) + no personagem o cenário, a situação inicial e os outros personagens (e, a partir de Equilibrado, o
pedido de raça/classe/origem/atributos) + o guia da **versão gravada** + os **tópicos ativos numerados na ordem
do roteiro** + o formato da resposta + a seção fixa **"Ritmo da conversa"** (`MADDOX_PACE_RULE`: a quantidade de
perguntas por mensagem é a das instruções e do guia; sem regra, nenhum limite fixo) + o protocolo de conclusão. A
abertura (`openingPrompt`) pede "a primeira rodada de perguntas seguindo as instruções e o guia", sem plural nem número. Modelo: o do entrevistador para o rigor da campanha (bloco "Por rigor" ou
provedor próprio) ou, em "Mesmo do Maddox", o do Maddox no mesmo rigor (com temperatura e tokens; DND-32). Indisponível = 409 `MADDOX_UNAVAILABLE`. Consumo medido na origem `maddox-interview`.

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
origem são cortadas em 2.000 caracteres ao gravar na ficha (`maxlength` dela) e o nome acima de 60 caracteres é cortado (abaixo de 2 conta como ausente).
A conclusão revalida `proposed` depois de pegar a trava (`NO_PROPOSAL` se outra aba enviou um ajuste) e grava o
cenário/perfil **antes** de marcar a entrevista como `done`: uma falha no meio deixa `proposed` e confirmar de
novo reaplica. Uma nova resposta só é gravada depois de o turno ser preparado (entrevistador, roteiro, sessão do
OpenCode): falha na preparação não deixa mensagem órfã.

- **Cenário:** `campaign.setting` (Markdown nas seções de `MADDOX_SETTING_SECTIONS`: universo, cânone, contexto,
  regras internas, tom), `campaign.openingSituation` e, se um nome foi combinado, a campanha é renomeada (auditado).
- **Personagem:** `character.profile` nas seções de `MADDOX_PROFILE_SECTIONS` (identidade, origem,
  personalidade, capacidades, equipamentos, relações, condição; vazias = "a definir durante a história") e o nome
  combinado — **obrigatório** (DND-31): sem nome na consolidação nem no personagem, 409 `CHARACTER_NAME_REQUIRED`, nada é
  gravado e a entrevista segue `proposed`. As instruções do entrevistador ganham a regra fixa `MADDOX_CHARACTER_NAME_RULE`
  ("## Nome do personagem") enquanto o personagem não tem nome. A conclusão grava `portrait.status = "pending"` junto com o
  perfil e dispara o retrato. A partir do rigor **Equilibrado** (`MADDOX_SHEET_RIGORS`) cria também a **ficha D&D**
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
card **"Cenário"** enquanto o cenário não está pronto (começar/continuar para o dono, espera para os jogadores; depois
ele vira o card da história, ver "Card da história no lobby (DND-37)"), chips da entrevista por participante, "Entrevista do personagem" (desabilitada até o cenário), selo "Pronto para jogar",
"Ver perfil" e "X de N prontos para jogar".

`src/lib/ai/stream.ts` ganhou `messages` (conversa) e `opencodeSessionId` (sessão fixa) no `AiStreamRequest`.

**Formato e menções do catálogo.** As instruções do entrevistador têm uma seção fixa "Formato da resposta"
(`MADDOX_RESPONSE_FORMAT`, no código, independente da aba), só de renderização (sem quantidade de perguntas): Markdown em blocos curtos, `###` por assunto, listas,
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

Ainda fora do escopo: pausar/encerrar a campanha, editar uma declaração enviada. Desfazer turnos já tem caminho (DND-44,
abaixo).

### Voltar a um turno (DND-44)

Código: `server/rewind.ts` (operações, perda definitiva e reparos), `server/turn-snapshots.ts` (retratos),
`rewind-plan.ts` (regras puras e textos), `models/discard-filter.ts` (marca de descarte), `models/maddox-campaign-snapshot.ts`,
`models/maddox-memory-repair.ts`, `src/features/engramind/server/campaign-rewind.ts` (memórias), `components/game/TurnsMenu.tsx`
e `RewindNoticeLine.tsx`. API: `GET/POST /api/maddox/campaigns/[id]/game/rewind` (lista; `{ turnNumber }` vai ao turno) e
`POST …/game/rewind/resume` (corpo `{}`), todas com `maddox.play` + dono (403) + `assertMemberCanPlay` (409
`INTERVIEW_REQUIRED`). Sem chave nova no Perfix.

| Regra | Comportamento |
| --- | --- |
| Retrato | Ao abrir a vez dos jogadores de um turno (fim do turno do mestre ou vez de um personagem no combate tático, `captureTurnSnapshot`), `maddox_campaign_snapshots` guarda: `state`, NPCs (com o token cifrado), `currentState`/`status` dos personagens, **fichas inteiras** (`CharacterSheet` + itens, ataques, traços, talentos e magias), combates ativos (e os ids de todos), `maddox_combat_preps`, as mensagens que ainda mudam (testes, rolagens, reações, ações, lembranças), `opex.run` dos Personagens Opex, a última mensagem (`boundaryMessageId`), o instante (`takenAt`) e o começo da narração (`excerpt`). Falha na captura só tira o turno da lista. Turnos jogados antes da DND-44 não têm retrato e não aparecem |
| Turnos disponíveis | 1 ≤ X < turno de origem, diferente do turno em que a mesa está, com retrato; do mais recente para o mais antigo. Turnos só dos adversários (combate tático) não abrem vez dos jogadores e não têm retrato. **"Desfazer turno"** vai ao maior turno disponível abaixo do atual (o −1 sempre que ele existir) |
| Bloqueios | Maddox narrando, testes/rolagens pendentes, pausa do combate ou fila da campanha ocupada = 409 `MASTER_TURN`; outra volta em curso = 409 `REWIND_IN_PROGRESS`; fora de `active` = 409 `CAMPAIGN_NOT_ACTIVE`; X inválido = 400 (Zod) ou 409 `TURN_UNAVAILABLE`; retomar sem volta pendente = 409 `NO_PENDING_REWIND`. **Com a narração parada por falha** (fase do mestre sem geração, `failedAt`), o dono pode voltar; retomar devolve a fase do mestre com a falha |
| Trava | A operação toma a trava do mestre (`turn.generating.rewind`, fase `master`) e roda na fila da campanha: declarações concorrentes recebem `MASTER_TURN`/`TURN_CLOSED` (nunca ficam órfãs) e uma segunda volta responde 409. Trava velha (reinício) é refeita pela retomada do turno do mestre (`recoverRewind`); as operações são idempotentes |
| Ir ao turno X | Memórias primeiro (abaixo); depois: apaga as ações feitas desde a chegada ao turno atual (declarações novas), tira da fila de gravações do Engramind as posteriores ao retrato, marca com `discardedBy` as mensagens depois do retrato e as imagens criadas depois dele (o que é até o retrato volta, dentro da volta), repõe o retrato e abre a **vez dos jogadores de X** (elegíveis = prontos agora; no combate, o membro da vez). Cancela os prazos do combate (`cancelCampaignTimers`), troca a sessão do narrador no OpenCode (`rotateNarratorSession`: a nova não carrega a conversa descartada), grava a linha `kind: "rewind"` "O dono voltou a mesa para o turno X", audita (`CampanhaMaddox`, `depois.rewind: "goto"`) e avisa a mesa |
| Volta pendente | `campaign.rewind { id, originTurn, originPhase, atTurn, positionAt, … }` + o retrato de origem (turno inteiro, memórias tocadas e gravações guardadas da fila). Faixa para todos: "A mesa voltou ao turno X. Os turnos X+1 a N serão perdidos quando o Maddox narrar de novo." |
| Retomar ("Voltar ao turno atual (N)") | Mesma sequência com o retrato de origem: tira todas as marcas desta volta, devolve o `turn` inteiro (fase, elegíveis, declarados, falha), as gravações da fila e as versões novas das memórias; linha "O dono retomou o turno N"; auditoria `depois.rewind: "resume"` |
| Descarte | `discardedBy` some de **todas** as leituras por um filtro no schema (mensagens e imagens): mesa, Diário (histórico, busca, imagens), transcrição do narrador e do Opex, testes e reações. Só a cota de imagens, a gravação do resultado de uma imagem em geração e o varredor de imagens presas (`includeDiscarded`) e as consultas pelo próprio `discardedBy` o enxergam: a imagem descartada durante a geração recebe `status`, `url` e `key` (a retomada a traz pronta); se já virou lápide, o arquivo gerado é excluído. A declaração descartada sai do índice único (`turnAction` vai para `discardedBy.turnAction`) |
| Perda definitiva | No começo da nova narração (`commitRewind` em `runMasterTurn`, dentro da fila e da trava): exclui as memórias nascidas no trecho (falha → `maddox_memory_repairs`, a narração segue e a rotina do Engramind tenta de novo), apaga as mensagens descartadas, as imagens viram lápide (`slot: "discarded"`, `counts` mantido: **a cota não volta**; arquivo excluído do S3), apaga o retrato de origem e os retratos posteriores, aposenta os agentes dos NPCs Opex que sumiram e encerra a volta (auditoria `depois.rewind: "commit"`). A numeração segue em X+1 |
| Lobby | "Em andamento · Turno N · fase" mostra o turno em que a mesa está |
| Tela aberta (DND-46) | As falas do Maddox que terminaram com a página aberta (narrações do trecho descartado, resposta de uma pergunta apagada) não voltam como bolhas ao vivo: só a geração mais nova que a última mensagem carregada espera a mensagem gravada. Sem recarregar a página, a mesa mostra o mesmo que depois de recarregar |

**Memórias.** Cada gravação do jogo leva `turno:<n>` e `gravado:<ms>` (relógio do dndicas; reservada, fora do Diário),
inclusive as dos Personagens Opex (`personagem-opex`) e dos NPCs Opex (`npc-opex`). Ir ao turno lê o histórico de cada
memória candidata (as gravadas depois do retrato e as já tocadas pela volta) e a leva à revisão de conteúdo
(`create`/`update`/`redact`) gravada até o `takenAt` do retrato: `revert` (texto, título, categoria, tags) e
`archive`/`restore` (situação). Sem revisão até ali = arquivada (criada depois) ou **excluída** (nascida de ação feita
depois da volta). Memórias antigas, sem `turno:` nem `gravado:`, nunca mudam. Rede fora: a operação responde 409
`ENGRAMIND_UNAVAILABLE` sem tocar no Mongo; o que já foi mudado é devolvido à posição atual na hora ou fica em
`campaign.memoryRepair` (refeito antes da próxima operação, da próxima narração e pela rotina). A troca de canal
(Jogadores ↔ Mestre) feita depois do turno não é desfeita.

Testes: `tests/backend/maddox/rewind.test.ts`, `rewind-combat.test.ts`, `rewind-plan.test.ts`,
`tests/backend/engramind/campaign-rewind.test.ts` e `tests/frontend/maddox/maddox-game-rewind.test.tsx`.

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
aparecem para todos na hora, salvo com "Ações dos outros jogadores: Ocultas", DND-36); só `me` muda por usuário.

**Tela `/campanhas/[id]/mesa`** (`pageAccess`): cabeçalho com rigor, "Turno N" e a faixa da fase ("Turno dos jogadores — X
de N jogador(es) online já declararam" / "Turno do mestre — o Maddox está narrando…"); conversa no padrão do chat do Opex
(divisor por turno, Maddox com avatar e cor do rigor, declarações com o retrato do personagem — as minhas à direita —,
pergunta e resposta ligadas, "Fulano não fez nada (pulado por …)", "Carregar anteriores" com cursor); campo no desenho do
campo da entrevista (`GameComposer`: caixa única `flex items-end`, texto `flex-1`, três botões de ícone redondos `h-8 w-8` à direita,
na ordem **Perguntar ao mestre** (com a borda premium de IA, DND-52), **Não fazer nada** e **Declarar** (enviar); Enter declara, também Ctrl/⌘+Enter, Shift+Enter quebra
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
| `search_memories`, `save_memory` | memórias da campanha no Engramind por tipo + título (chave `mx:<tipo>:<título>`): `local` (locais), `missao` (missões, com `status` ativa/concluída/falhou/abandonada — nasce `ativa`, tag `status:`), `evento` (marcos), `relacao`, `fato`, `outro`; turno na tag `turno:` |
| `update_character_state` | `character.currentState` (o perfil da entrevista não muda) |
| `suggest_actions` | Sugestões de ação por personagem no job, gravadas com a narração (`message.actionOptions`). Veja "Sugestões de ação (DND-30)" |

**Provedores.** Gemini, Anthropic, OpenAI, DeepSeek e OpenCode Go: `streamText` com as ferramentas (até 12 passos,
`MADDOX_NARRATOR_MAX_STEPS`; no OpenCode Go a chave de conversa é `maddox:<campanha>:narrator`). **OpenCode:** sessão `narrator` da campanha (`ensureMaddoxSession`), sem ferramentas na chamada;
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
`tool { liveId, running }`, `live-text { liveId, text }` (troca o texto ao vivo inteiro; DND-52), `live-end { liveId, messageId, error }` e `ping` (15 s). O mesmo fluxo chega a **todos** os
jogadores com a mesa aberta. O texto ao vivo passa pelo `createMarkupFilter` (marcação do catálogo nunca crua) e, ao gravar, as
menções são resolvidas com os nomes reservados da campanha **e dos NPCs**.

**Ação livre.** **Rigoroso e Fiel ao D&D** (`MADDOX_DECLARATION_VALIDATION_RIGORS`) validam a declaração **antes de gravar**: com
a chave JEV "Validade de ação livre" ligada decide o JEV (`noul`, motivo padrão); senão, uma geração curta e efêmera do narrador
devolve `{ valid, reason }`, com teto de 20 s (`MADDOX_VALIDATION_TIMEOUT_MS`, sinal no provedor e no JEV; passou = aceita).
Quem já declarou recebe **409 `ALREADY_DECLARED` antes** da validação (sem chamada de IA).
Inválida = **409 `ACTION_INVALID`** com o motivo: nada é gravado e a vez não é gasta. Falha do
validador aceita a declaração (aviso no log). **Narrativo, Flexível e Equilibrado** julgam na narração: a ação impossível vira
uma tentativa frustrada narrada com a causa na ficção. Perguntas e "Não fazer nada" nunca são validadas.

**Sugestões de ação** abaixo da última narração: seção "Sugestões de ação (DND-30)".

**Tela.** A mesa assina o stream (`useMaddoxGameStream`): reconecta sozinho com espera crescente (3 s, dobrando até 60 s;
sem linha nem `ping` por 45 s refaz a conexão) e **para** em 401/403/404; a fala do Maddox chega aos poucos numa bolha com
cursor e "Consultando as anotações da campanha…" enquanto ele usa ferramentas; a resposta ao vivo aparece ligada à pergunta; a
geração que terminou fica na tela até a mensagem gravada chegar (sem piscar) — e só enquanto ela é mais nova que a mensagem
mais recente carregada (`visibleLiveGenerations`, DND-46): a de uma mensagem que saiu da mesa numa volta a um turno não
volta, e o stream guarda só as últimas gerações terminadas. Nas gerações ao vivo, o divisor "Turno N" sai uma vez por turno
(comparado ao item anterior, gravado ou ao vivo). A faixa mostra "o Maddox teve um problema;
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
- **NPCs conhecidos**: card abaixo de "Na mesa" com nome e foto (ou iniciais) dos NPCs com `visibility: "players"`, **um NPC por
  linha** (DND-43: foto, nome, chip Opex, situação e ações na mesma linha; a lista do Diário também tem uma coluna). Os personagens
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

**Voltar a um turno (DND-44).** Cada vez de personagem é um turno com retrato: voltar a ela restaura a vez (`turn.combatActor`), a
iniciativa e o estado tático (PV, condições e recargas dos adversários, economia e condições dos personagens) e a ficha inteira (PV,
espaços, cargas, itens). Voltar a um turno anterior ao início do combate apaga o combate e a preparação dele. Os prazos do combate da
campanha (dado dos inimigos, pausa entre blocos, ausência e reações, estas com a chave `reaction:<campanha>:<mensagem>`) são
cancelados por `cancelCampaignTimers`. Turnos só dos adversários não têm retrato.

Código: regras puras em `combat-rules.ts` (vantagem/desvantagem por condição, crítico, dano com resistência/imunidade/vulnerabilidade,
PV temporários, 0 PV, morte instantânea, testes contra a morte 2024, CD da concentração, desempate da iniciativa, expressões de dados)
e `combat-options.ts` (o que o personagem PODE usar); tipos em `combat-types.ts`; Zod das rotas em `combat-schemas.ts`. Servidor:
`server/tactical-combat.ts` (estado, início, ordem, fila dos adversários, abertura da vez, ausência), `server/tactical-actions.ts`
(vez do jogador, rolagens, cancelar, encerrar, pular, morte), `server/tactical-master.ts` (ferramentas da vez dos adversários sobre
uma cópia de trabalho), `server/combat-reactions.ts` (janelas de reação), `server/combat-monsters.ts` (bloco de estatísticas),
`server/combat-classifier.ts` (custo das habilidades), `server/combat-sheet.ts` (leitura e escritas atômicas na ficha),
`server/tactical-options.ts`, `server/tactical-dto.ts`. Tela em `components/game/combat/` e `hooks/useMaddoxCombat.ts`.

**Estado (`maddox_combats`).** `mode: "tactical"`, `tactical { phase: initiative|running, round, activeIndex, order[], characters[],
surprise, queue[], nextKey, queueTurn, staleEndNarrations, block, acted[] }` e `rev` (cada gravação é condicional à versão: clique duplo e corridas
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
pronto com ficha (espera do turno do mestre, como os testes do Maddox 5; só quem rola o vê pendente) e um card `combat-roll`
**`enemy-initiative` por grupo** de adversários (público, "Aguardando os personagens"; fora de `turn.pendingCombat`). Os jogadores
rolam ao mesmo tempo; o modificador vem da ficha (desvantagem com `surpresa: "personagens"`). **DND-25:** só quando o último card de
personagem é rolado (ou cancelado porque o membro saiu) `rollEnemyInitiativeIfReady` (`tactical-combat.ts`, chamado por
`advanceAfterChecks`) reivindica cada card dos inimigos, rola um d20 por grupo (desvantagem com `surpresa: "adversarios"`: os dois
dados ficam em `selectedD20`, vale o menor), grava o total nas posições do grupo e emite `combat-rolled` de cada card — todos os grupos
rolam juntos na tela de todos, e o card mostra "d20 X + mod = total" quando o dado para (`EnemyInitiativeCard`). Só o servidor rola esse card: a rota de rolagem avulsa responde 409 `ENEMY_ROLL_BY_SERVER` (inclusive para o dono). A reivindicação segue a da rolagem avulsa (trava mais velha que `MADDOX_COMBAT_ROLL_CLAIM_STALE_MS` é retomada) e uma falha no meio libera as travas para a próxima chamada. O card guarda
`revealUntil` (`MADDOX_ENEMY_INITIATIVE_REVEAL_MS`, 2,5 s), que `hasRoundWaits` conta como espera: a ordem só fecha (total → Destreza
→ personagens antes → entrada), o card `combat { event: "order" }` ("Ordem de iniciativa") só é gravado e a continuação só narra o
começo depois dele (timer no processo; depois de um reinício, a retomada pelo `check`). Quem recarrega depois vê só o resultado.
Reforços de `update_combat` com a luta em andamento continuam rolados na hora, sem card.

**Motor da vez.** O motor do Maddox 3 continua: em combate, o **turno dos jogadores é a vez de UM personagem** (`turn.combatActor`,
`eligibleMemberIds` = só o membro dele) e o **turno do mestre** narra a vez que fechou e conduz, na ordem, os adversários até o próximo
personagem (`prepareMonsterQueue`, uma vez por turno do mestre, com o começo do turno de cada um: economia nova, flags e condições
vencidas, recarga; rodada nova quando a ordem volta ao topo). Sem esperas, `openCombatTurn` abre a vez do próximo personagem (começo do
turno dele; com 0 PV, o card do teste contra a morte). Personagem morto, estável ou que saiu é pulado; se o personagem da vez cair
durante a vez dos adversários, os seguintes agem num novo turno do mestre.

**Blocos dos adversários (DND-25).** O turno do mestre é uma sequência de gerações (rodadas do `checkRound`, uma por vez na fila):
primeiro a **narração do que já aconteceu** (a vez do personagem que fechou ou o começo da luta; `tactical.block = { kind: "character" }`,
`monster_action` recusado) e depois **um bloco por indivíduo** da fila, na ordem de iniciativa (`block = { kind: "npc", actorKey }`;
`monster_action` só aceita esse adversário). Sem nada a narrar antes (o turno caiu direto nos adversários) começa pelo primeiro bloco.
Ao fim de cada geração sem espera, `nextCombatStep` (`game.ts`) → `advanceBlock`/`nextBlockStep` (`tactical-combat.ts`, pura,
idempotente pela `startRound` do bloco) fecha o bloco (`tactical.acted`) e escolhe o seguinte (pula derrotado, com desfecho ou
incapacitado); havendo próximo, o turno faz a **pausa de leitura** (`turn.awaitingChecks` + `turn.pauseUntil`,
`MADDOX_NPC_BLOCK_PAUSE_MS` = 3 s; `advanceAfterChecks` recusa antes dela; timer no processo e retomada pelo `check`) e a continuação
gera o bloco. Salvaguarda ou reação dentro do bloco = espera normal: a continuação conclui **o mesmo** adversário (o teto de esperas
`MADDOX_COMBAT_WAIT_ROUNDS_MAX` vale por bloco, `block.waits`; o turno inteiro tem o teto de proteção `MADDOX_COMBAT_MASTER_ROUNDS_MAX`,
60). Depois do último bloco, `openCombatTurn` abre a vez do próximo personagem. **Nenhum personagem consciente** (todos com 0 PV,
mesmo morrendo) = os adversários restantes não agem e o servidor encerra na hora como `derrota`. Cada bloco é uma geração: a falha não
aplica nada daquele NPC e a nova tentativa rola de novo; os blocos já gravados ficam. No bloco de um NPC os cards das ações (os dados)
são gravados **antes** da narração dele. Gravações antigas sem `block` seguem o modo anterior (todos na mesma narração). Perguntas ao mestre continuam livres para qualquer membro
pronto durante a vez de outro (não mudam o turno); declarações de texto livre no combate respondem 409 `COMBAT_USE_ACTIONS`.

**Ausência.** Jogador da vez offline: `offlineSince` é marcado e a vez passa depois de `MADDOX_COMBAT_OFFLINE_GRACE_MS` (30 s; timer no
processo e retomada no `check`), com "Não agiu: o jogador estava offline" (`offlineSkip`). O dono pode pular a vez (`/game/skip`, com
auditoria). Saída do membro: o personagem sai da ordem (`left`), rolagens/reações/ações pendentes são canceladas e, se era a vez dele,
ela fecha e o turno do mestre segue. Mesa toda offline não avança sozinha (regra do Maddox 3).

**Vez do jogador (rotas, todas com `maddox.play`, membro `joined`, `assertMemberCanPlay` e "é a sua vez" no servidor):**

| Rota | Comportamento |
| --- | --- |
| `POST …/game/combat/actions` `{ economy, optionId, targets?, spellLevel?, skill?, freeText?, readyOptionId?, readyTrigger?, sneakAttack? }` | A opção precisa estar na lista recalculada da ficha (`OPTION_UNAVAILABLE`); alvo validado; opção sem os dados para resolver = 409 `OPTION_UNRESOLVABLE` antes de qualquer gasto; a economia é reservada primeiro (`ACTION_ALREADY_USED`) e só então espaço de magia, carga e item são gastos (gasto recusado devolve a economia); uma ação pendente por vez (`ACTION_PENDING`). "Outra ação" (ou habilidade de custo não identificado) passa pelo `validateDeclaration` com o contexto do combate: inválida = 409 `ACTION_INVALID` com o motivo, nada gasto |
| `POST …/combat/actions/[id]/roll` `{}` | Reivindica o passo antes de rolar (`combatAction.rollingStep`/`rollingAt`, troca condicional; a chamada concorrente recebe 409 `ACTION_RESOLVED`; trava mais velha que `MADDOX_COMBAT_ROLL_CLAIM_STALE_MS` (30 s) é tida como abandonada e a próxima tentativa assume; só o dono da reivindicação grava). Rola o próximo passo: ataque (vantagem/desvantagem pelas condições; acerto contra a CA do alvo, que não aparece; 20 natural = crítico com dados dobrados), dano (resistências; adversário a 0 PV = `defeated`), cura (sai dos 0 PV), magia de salvaguarda (o servidor rola a salvaguarda de cada alvo; metade no sucesso pelo texto/perfil), teste (Esconder = Furtividade CD 15 → Invisível; DND-49: sai depois do ataque ou de magia Verbal) |
| `DELETE …/combat/actions/[id]` | Cancela a ação sem rolagem e sem recurso gasto; a economia volta (`ACTION_NOT_CANCELLABLE`) |
| `POST …/combat/rolls/[id]/roll` `{}` | Reivindicada antes de rolar (`combatRoll.rolling`/`rollingAt`, mesma expiração; concorrente = 409 `ROLL_NOT_PENDING`). Iniciativa, teste contra a morte (encerra a vez), concentração, salvaguarda contra um adversário (aplica o dano pré-rolado), dano pedido pelo Maddox. O dono pode rolar no lugar (auditado) |
| `POST …/combat/reactions/[id]` `{ escolha }` | A reação escolhida ou `none`; o dono só pode recusar no lugar (auditado) |
| `POST …/combat/end-turn` `{ movimento? }` | Encerra a vez (409 com ação ou rolagem pendente); grava a declaração da vez com o resumo das ações e o "Movimento e posição" |

**O que o personagem pode usar** (`buildCombatOptions`, revalidado a cada ação): armas equipadas do catálogo (Força; Acuidade = o maior
entre Força e Destreza; Munição = Destreza) e o ataque desarmado — as propriedades vêm de `properties[].name` ou, quando ele está vazio
(o caso do catálogo, DND-41), do texto da menção em `properties[].description` sem o prefixo "Propriedade:" (`weaponProperties`); Versátil
gera "X (duas mãos)" com o dado do parêntese, sem escudo equipado e sem ataque com outra arma no turno; Arremesso gera "X (arremesso)", à
distância, com o mesmo modificador (`weapon:<id>:two-handed`, `weapon:<id>:thrown`; o id do item sai de `weaponItemId`); Ataque Extra pelo nome da habilidade (2/3/4 ataques na mesma Ação);
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
| `get_combat` | Ordem, rodada, "agem agora", próxima vez, PV/CA/condições/ações e a `descricao` de cada adversário (DND-42) |

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

**Prompt.** Regra "## Combate tático" (`tacticalCombatRule`: um adversário por vez, ferramentas antes do texto), bloco "## Combate
tático em andamento" (estado do `get_combat`, com `agemAgora` = só o adversário do bloco e `depois` = os seguintes), tarefa pelo bloco
(`tacticalTaskLines`: "nesta narração NENHUM adversário age" na narração da vez; "bloco de **Goblin 1**: SÓ ele age agora…" com o título
"vez de Goblin 1"; continuação do mesmo bloco "Conclua a narração dele"), resultados das esperas na continuação
(`waitRoundResults`) e a transcrição com os resumos dos cards. No OpenCode, a lista do MCP inclui `monster_action`, `apply_effect`,
`request_damage_roll`, `offer_reaction`. Desde a DND-42 a regra tática também orienta o adversário enfraquecido pela ficção (motivo na
`descricao` do `start_combat`/`update_combat` e `modo: "desvantagem"` em cada ataque dele, só quando a cena justificar) e o
`tacticalView` devolve a `descricao` (cortada em 200 caracteres) para a penalidade não se perder entre os blocos — a `condicao` em texto é
sobrescrita pela faixa de PV depois do primeiro dano. Veja "Dificuldade dos combates (DND-42)".

**DTO e tela.** `combat.tactical` (ordem com PV dos personagens, faixa "Ileso/Ferido/Muito ferido/Caído" dos adversários — sem PV,
salvo quando a campanha mostra o PV do lado (DND-53), e nunca a CA —, condições, concentração, morrendo/estável/morto, quem age), `turn.combatActor`, `turn.pendingCombat`, `me.combat` (vez, economia,
opções de Ação/Ação bônus, morrendo) e `combatAction`/`combatRoll`/`combatReaction` nas mensagens (rolagem pendente só para quem rola;
opções da reação só para quem reage). Stream: `combat-rolled` (todos repetem o dado), **`live-roll { liveId, roll }`** (DND-25: cada dado
de `monster_action`/`apply_effect` vai para a geração ao vivo do job — `MaddoxLiveGenerationDto.rolls`, também no `snapshot`; a bolha
`LiveNpcRolls` anima um de cada vez, ataque com Acertou/Errou/Crítico/Falha crítica e depois o dano, e só então mostra o texto da narração) e
**`combat-step-rolled { messageId, stepIndex, roll }`** (salvaguarda de um adversário rolada pelo servidor num card de ação de jogador:
o passo anima antes do resultado). Dados do servidor repetidos com `ReplayDie` (`DiceRollerPanel` só com `externalResult`). Tela: `InitiativeTracker` (coluna da direita e
faixa compacta no cabeçalho em telas pequenas), `CombatActionBar` (na minha vez substitui o campo: Ação, Ação bônus, economia,
"Movimento e posição", Encerrar turno, "Perguntar ao mestre"; um único painel ancorado ao botão que o abriu, `anchorLeft` limita ao
contêiner e à janela; categorias em `OptionTabs`, alvos/círculo/perícia em `GlassSelector`), `CombatWaitBar` ("Vez de Kael
(iniciativa 17) · Rodada 2"), cards `CombatActionCard` (dado inline, Acertou/Errou/Crítico, dano; ciclo do dado abaixo), `CombatRollCard`,
`CombatReactionCard` (contagem, "Não reagir", "Não reagir no lugar" do dono) e `CombatOrderCard`.

**Dado do card até sair de cena (DND-48).** A resposta de "Rolar" já traz a mesa nova (`setQueryData` no `useRollCombatStep`) com o
passo resolvido, no meio da animação. Por isso `CombatActionCard` e o card de rolagem avulsa (`CombatRollCard`, exceto a iniciativa dos
inimigos) seguram o dado no passo do clique com `useHeldRoll` (`components/game/combat/use-held-roll.ts`, decisão pura em `rollSlot`,
`roll-hold.ts`): o clique prende o passo; enquanto o dado rola, o passo aparece como "rolando…" sem total nem veredito (no card avulso,
sem o desfecho nem a cor); quando o dado para (`onRollSettled`) o resultado aparece; quando o palco termina de sair (`onStageHidden`,
depois de `MADDOX_CHECK_DIE_HIDE_MS`) o passo é liberado e surge o próximo "Rolar" (ou o dado sai do card). Falha da rolagem libera o
passo na hora; se o palco nunca avisar, o passo é liberado depois de `MADDOX_COMBAT_ROLL_HOLD_MAX_MS` (10 s). Quem assiste segue o mesmo
ciclo pelo `replay`: o dado fica no passo cuja `step.roll.rollId` é a da repetição (antes da mesa nova, no pendente) e, depois que o
palco sai, a mesma repetição (que continua no mapa do stream) não roda de novo no passo seguinte.

Sem permissão nova (`maddox.play` cobre). Fora do escopo: grid e alcance medido (o movimento é texto), ações lendárias e de covil,
XP e subida de nível, reações dos adversários além do ataque de oportunidade conduzido pelo Maddox, novo personagem depois da morte.

## Preparação da mesa de combate (DND-41)

Durante a iniciativa do combate tático, o Maddox prepara a mesa de **cada personagem, um por um** (inclusive os Personagens Opex): confere
ações, ações bônus, habilidades, recursos e danos contra a ficha inteira, corrige a ficha quando ela está errada e guarda o que muda nas
opções. Sem permissão nova (`maddox.play` e ser membro cobrem).

Código: parte pura em `combat-prep.ts` (`applyCombatPrep`, `detectSneakAttack`, `sneakEligible`, `onlyFreeBonus`) e o contrato da resposta
da IA em `combat-prep-schemas.ts` (validação tolerante, item a item: `parseList`); servidor em `server/combat-prep.ts` (agendamento, job,
retomada, decisões do dono, contexto da ficha `loadPrepSheet`, `interpretPrep`, `mergeOverlay`), `server/combat-prep-ai.ts` (chamadas de IA,
mockadas inteiras nos testes), `server/combat-sheet-writes.ts` (gravação na ficha) e `server/combat-adjustments.ts` (pedido de ajuste).

**Modelo `maddox_combat_preps`** (um por `combatId` + `actorKey`, único; fora do `maddox_combats` para não disputar o `rev` com os
jogadores): `status` (`pending | running | ready | failed | skipped | discarded`), `turnNumber`/`waitRound` da iniciativa, `error` (motivo
completo; no DTO só para o dono da campanha), `overlay { modify[], remove[], add[], suppress[] }`, `riders[]` (ataque furtivo), `changes[]`
(o que era, o que ficou, o motivo, `applied`) e `adjustments[]` (pedidos de ajuste).

**Fluxo.** `createTacticalCombat` cria uma preparação por personagem com ficha e `scheduleCombatPreps` põe um job `combat-prep` por
personagem na fila serial da campanha (rodam depois da narração que abriu o combate, enquanto os jogadores rolam). O job lê a ficha
inteira (atributos, proficiências, ataques, itens com as propriedades do catálogo, características de classe e espécie, talentos, magias,
recursos), a lista base completa (`ignoreResources`) e o ataque furtivo detectado, chama a revisão com o modelo do narrador no grau da
campanha e as instruções configuráveis (texto gerado gravado inteiro até o teto técnico `MADDOX_COMBAT_PREP_TEXT_CEILING`, folgado acima
do que o prompt pede; a tela quebra a linha), confere a resposta contra a lista e a ficha (id desconhecido, valor fora da faixa ou recurso que a
ficha não tem = descartado, com log) e grava. **A ficha mudou durante a preparação** (carimbo `readSheetStamp`: `updatedAt` da ficha + hash
das coleções filhas) = a revisão roda de novo sobre o dado novo (até `MADDOX_COMBAT_PREP_CONFLICT_RETRIES`). Combate encerrado ou membro que
saiu = `discarded`, nada gravado; o descarte de quem sai (`discardMemberPrep`) e o job que encontra a preparação já descartada também
fecham a ordem quando era a última pendente. IA indisponível ou erro do provedor (teto técnico `MADDOX_COMBAT_PREP_TIMEOUT_MS`) = `failed`.

**A ordem espera.** `finishInitiativeIfReady` não fecha a ordem com preparação `pending`, `running` ou `failed`; `hasRoundWaits(pendingOnly)`
conta a preparação da rodada como espera (a continuação do mestre não entra). Sem tempo limite. Ao terminar a última, o job chama
`finishInitiativeIfReady` e `advanceAfterChecks`. Retomada depois de um reinício: o `check` chama `scheduleCombatPreps`, que reenfileira as
pendentes e as `running` sem job vivo há mais que `MADDOX_COMBAT_PREP_STALE_MS`.

**Falha.** Só o dono da campanha recebe o motivo (`combat.tactical.preparation.failures`) e decide, com auditoria: `POST
…/game/combat/preps/[prepId]/retry` ("Tentar de novo": volta para a fila) e `POST …/game/combat/preps/[prepId]/skip` ("Seguir sem
preparação": a ficha usa a lista base, já com o cálculo corrigido e o ataque furtivo detectado pelo servidor). Os demais veem só o selo
"Falhou" e "Aguardando o dono da campanha"; outro jogador recebe 403 `OWNER_ONLY`.

**Gravação na ficha** (lista fechada de operações, `combatSheetChangeSchema`): atributo, proficiência em salvaguarda e perícia, atributo de
conjuração, espaços de magia, cargas de recurso, ataques (`characterattacks`: criar, alterar, remover), características e talentos
(criar, alterar), magia (preparada, círculo), item equipado e texto acrescentado ao fim de um campo de características. O modelo vê só um
trecho de cada característica e talento (`MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX`): descrição maior que o trecho, ou com menções, não é
reescrita — a correção é acrescentada ao fim. Cada operação é condicional ao valor atual, auditada (entidade `FichaPersonagem`, antes
completo, depois, motivo, `by: "maddox"` e `requestedBy`; o usuário da auditoria é quem pediu o ajuste, ou o dono da campanha na
preparação automática) e avisa a ficha aberta
(`publishSheetPatched`/`publishCollectionChanged`). Uma criação ligada a uma opção acrescentada (`ref`/`fromChange`) entra em
`overlay.suppress` para a lista base não a mostrar duas vezes.

**Lista do turno.** `loadCharacterOptions(states, campaignId, combatId)` recalcula a lista base com a economia e os recursos ao vivo e
aplica a preparação `ready`/`skipped` por cima (`applyCombatPrep`): a IA não é chamada de novo; acréscimos só aparecem com a economia livre
e com carga, item ou espaço de magia disponível; a opção ajustada traz `adjusted.reason` ("Ajustado pelo Maddox: …"). A revalidação de
`POST …/combat/actions` usa a mesma lista.

**Card privado** `combat-prep` ("Sua mesa está pronta"; `content` vazio, fora da transcrição e do Diário): `visibleTo` só o entrega ao
dono do personagem (o do Personagem Opex, ao dono da campanha). Sem mudanças, o card diz isso.

**Pedido de ajuste** (`POST …/game/combat/adjustments { economy, optionId, text }`): só o dono do personagem, só na vez dele
(`loadMyCombatTurn`), com a mesa preparada (`PREP_NOT_READY`), numa opção que existe (`OPTION_UNAVAILABLE`); Personagem Opex não pede. Não
gasta Ação nem Ação bônus. Entra em `adjustments` como `pending` e vira um job `combat-adjust` na fila (dois pedidos em ordem; o segundo vê
o primeiro). O JEV "Pedido de ajuste fora das regras" (chave desligada por padrão) recusa na hora o que claramente burla; senão, o narrador
decide (`accept` corrige a opção e a ficha pelas mesmas regras; `refuse` não muda nada), sempre com o motivo. Aceito sem nenhuma mudança
aplicável (id errado, valor fora da faixa) vira falha, com a mensagem genérica para o jogador tentar de novo. Correção parcial do ataque
(`modify` sem `light`, `ranged`, `damageType` ou `finesse`) herda esses campos da opção. Falha da IA = mensagem
genérica para o jogador; o motivo técnico só para o dono da campanha.

**Ataque furtivo.** Detectado pelo servidor pela classe (Ladino/Rogue) ou pela característica "Ataque Furtivo" (menção ou registro),
⌈nível/2⌉d6; a preparação só corrige os dados com fonte confirmada no catálogo (DND-49). Vira `attack.riders` nas opções de arma com
Acuidade ou à distância (a arremessada só com Acuidade; reações ficam fora). Desde a DND-49 o furtivo é **perguntado depois do acerto**
(seção DND-49 abaixo); a marcação antes do ataque (`sneakAttack` em `POST …/combat/actions`, `ataqueFurtivo` do Opex) saiu.

**Configuração.** Mesma feature `maddox` do narrador: `combatPrepInstructions` e `combatAdjustInstructions` (aba Agente Maddox → Geral →
"Combate tático", com "Restaurar padrão"); o formato da resposta é fixo no código. Origens de consumo `maddox-combat-prep`,
`maddox-combat-adjust` e `maddox-sneak-attack`.

**Tela.** `CombatWaitBar` ("O mestre está preparando o combate"; travada: "Aguardando o dono da campanha"), `InitiativeTracker` (selos
"Aguardando", "Preparando…", "Pronto", "Falhou", também na faixa compacta), `CombatPrepBlockedNotice` (dono: motivo, "Tentar de novo" e
"Seguir sem preparação" com confirmação), `CombatPrepCard`, e no `CombatActionMenu` o "Ajustado pelo Maddox", o aviso "Ataque furtivo
(+Xd6): se o ataque acertar e a regra permitir, você escolhe somar antes do dano" (ou "já usado neste turno"), o pedido de ajuste com o resultado e os avisos de falta (`combatMenuNotices`: sem armas, sem
habilidades, só "Outra ação" na Ação bônus). Hooks `useRetryCombatPrep`, `useSkipCombatPrep`, `useRequestCombatAdjustment`.

Fora do escopo: personagem que entra no combate depois que ele começou (hoje a lista de personagens é montada na abertura).

**Testes.** `tests/backend/maddox/combat-prep.test.ts` (parte pura), os blocos DND-41 de `tests/backend/maddox/tactical-combat.test.ts`
(espera, falha e decisões, gravação, card, conflito, descarte, ajuste, furtivo) e `tests/frontend/maddox/maddox-combat-prep.test.tsx`.
Alteração de regra simulada na resposta mockada precisa de fonte: no mock, chame `readCatalog(input, tipo, id, entidade)`
(`tests/helpers/combat-prep-mock.ts`) e mande `source: { ref: "Tipo:id", quote }` com um trecho dessa entidade.
Testes que abrem combate tático mockam `@/features/maddox/server/combat-prep-ai` com `combatPrepAiModule`
(`tests/helpers/combat-prep-mock.ts`, padrão "sem mudanças") e esperam `waitForCombatPreps()` (o `settleCampaign` já espera).

## Catálogo como fonte, maestrias, furtivo depois do acerto, Esconder-se e PV (DND-49)

Em todos os graus com combate tático (`MADDOX_TACTICAL_COMBAT_RIGORS`). Sem permissão nova (`maddox.play` e ser membro cobrem a rota do
furtivo).

**Preparação e "Pedir ajuste" consultam o catálogo por ferramentas.** `reviewCombatSheet` e `reviewAdjustment` (`server/combat-prep-ai.ts`)
rodam com `search_catalog`/`get_catalog_entity`: na AI SDK, `buildCatalogAiTools({ onResult, onError })` no laço `generateText` (até
`MADDOX_COMBAT_PREP_MAX_STEPS`/`MADDOX_COMBAT_ADJUST_MAX_STEPS`; vale o texto do último passo); no OpenCode, pelo MCP `dndicas-maddox` com o
**token de catálogo** (`createMaddoxCatalogToken`, domínio de assinatura `maddox-catalog:` em `master-turn-token.ts`): só abre as duas
ferramentas de catálogo, vale enquanto o job da fila roda e a execução (`runId`) está aberta (`openCatalogRun`/`closeCatalogRun`). Tetos:
`MADDOX_COMBAT_PREP_TIMEOUT_MS` 6 min e `MADDOX_COMBAT_ADJUST_TIMEOUT_MS` 4 min. Nenhum texto de regra entra no prompt: o `sheetText` ganha
a seção **"Referências do catálogo"** (`server/catalog-references.ts`) com tipo + id + nome de tudo que a ficha cita (menções de classe,
subclasse, espécie, origem, características, notas, proficiências com armas; ids de catálogo de características, talentos e magias; o
`catalogItemId` dos itens e a Regra da maestria de cada item), só entre documentos `status: "active"`; o resto sai como "sem
correspondência no catálogo".

**Registro das consultas** (`server/catalog-reads.ts`): cada `get_catalog_entity` da execução guarda `Tipo:id` e o texto normalizado da
entidade compacta que o modelo viu (sem acento, caixa e pontuação). **Fonte obrigatória** (`source: {"ref":"Tipo:id","quote":"trecho"}`,
`requiresCatalogSource` em `combat-prep-schemas.ts`) em: `sheetChanges` de atributo, proficiência de salvaguarda ou perícia, atributo de
conjuração, espaços de magia, cargas, `attack-upsert`, `weapon-mastery`, `trait-upsert`, `feat-upsert` e `spell-update` que muda o círculo; `modify` com `attack`, `save`, `heal` ou `economy`; `add` com
ataque, salvaguarda ou cura; e `sneakAttack`. Rótulo, detalhe, alvo, remoção, texto acrescentado e equipar não exigem. Sem `source`, com
`ref` não lido nesta execução, com `quote` fora do texto ou com `quote` curto demais (menos de 3 palavras e de 15 caracteres normalizados) = recusada (`dropped`), e o card mostra a linha com "recusada" e o motivo ("Não
confirmada no catálogo do DnDicas: …"). Modelo que não consultou nada e teve alteração recusada = aviso no topo do card ("O Maddox não
consultou o catálogo…"; falha da ferramenta: "A consulta ao catálogo do DnDicas falhou…"). O `sneakAttack: { dice: null }` sem fonte não
apaga mais o furtivo do servidor.

**Decisão do dono D2 (economia e ações padrão).** A troca de economia (Ação ↔ Ação bônus) exige fonte. As opções do servidor
`standard:*` (Esconder-se, Esquivar…), `unarmed`, `opportunity`, `free` e `ready` não aceitam `modify` nem `remove` na preparação nem no
ajuste ("Recusada: esta opção segue a regra fixa do servidor…"), e um `add` que repete o ataque de maestria (Ágil, Trespassar, "outra
mão") é recusado: o servidor resolve.

**Pedido de ajuste.** Mesmas ferramentas e mesma exigência. Recusa sem nenhuma consulta ao catálogo (nem leitura nem busca; buscar e não achar a regra conta como consulta, `searches` no registro) não vale: o servidor pede de novo exigindo a consulta (`mustConsult`); recusando outra vez sem ler, o pedido fica `error` ("não examinado": o jogador vê a mensagem genérica para tentar de novo; o dono vê o motivo) e o log registra. Aceito com tudo recusado por falta de fonte = o pedido fica `refused` com o
motivo do catálogo ("…A opção continua como está."). Cada ajuste guarda `catalogRefs` e `droppedWithoutSource`.

**Registro e auditoria.** `maddox_combat_preps` grava `catalogRefs` (as refs lidas) e `droppedWithoutSource`; os logs `[maddox] mesa do
personagem preparada` e `[maddox] pedido de ajuste aceito/recusado` trazem `refs`, `refsCount`, `catalogFailures` e `droppedWithoutSource`.

**Maestrias de arma** (`weapon-mastery.ts`: chaves `nick | vex | sap | topple | graze | push | slow | cleave`, `masteryKeyFromName`,
`masteryLimit`). A ficha guarda `weaponMasteries: [{ catalogItemId, mastery }]` (sem edição no editor da ficha nesta etapa). A arma só tem
maestria nas opções quando o item do catálogo tem a menção "Maestria: …" e o item está em `weaponMasteries` (`combat-sheet.ts`).
Preenchimento: a consolidação da entrevista (`initialWeaponMasteries` em `sheet-builder.ts`, só catálogo: característica "Maestria em/com
Arma(s)" até o nível; armas do equipamento com maestria, em ordem; o catálogo não marca arma simples/marcial, então vale o equipamento
escolhido) e a preparação, que propõe `{"type":"weapon-mastery", catalogItemId, mastery, source}` quando a ficha não tem nenhuma.
**Decisão do dono D1 (limite):** a coluna de maestria da tabela de progressão da classe; sem ela, o número escrito no trecho da
característica lida ("dois tipos de armas"); sem número, a proposta é recusada ("limite de maestrias não encontrado no catálogo"). Acima
do limite, ou maestria diferente da do item, também.

Regras no combate (`combat-options.ts`, `combat-rules.ts`, `tactical-actions.ts`; efeitos em `masteryNotes` e no resumo da ação):
- **Ágil (Nick):** depois do ataque com arma Leve na ação Atacar, o ataque extra da propriedade Leve com a arma que tem Ágil aparece na
  lista de **Ação** (`offhand:<id>`, "outra mão · Maestria Ágil") e não gasta a Ação bônus; uma vez por turno (`economy.lightExtraUsed`),
  acertando ou errando o primeiro. Sem Ágil, o ataque extra segue na Ação bônus. Uma só arma Leve com quantidade 1: nada. O Opex faz o
  ataque Ágil sozinho, no último alvo, antes de encerrar a vez.
- **Afligir (Vex):** acerto com dano > 0 grava `flags.vex { targetKey, round }` no atacante; o próximo ataque contra aquele alvo tem
  vantagem ("Maestria Afligir"), até o fim do próximo turno; o uso gasta.
- **Drenar (Sap):** acerto grava `flags.sapped` no adversário; a próxima jogada de ataque dele (`monster_action`) tem desvantagem; sai
  no início do próximo turno de quem drenou.
- **Derrubar (Topple):** acerto → o servidor rola a salvaguarda de Constituição do alvo, CD 8 + modificador usado + proficiência (passo
  `save` no card); falha = Caído. Alvo já Caído: nada.
- **Garantido (Graze):** erro → o passo de dano vira dano igual ao modificador usado, do mesmo tipo; modificador ≤ 0, nada.
- **Empurrar, Lentidão, Trespassar:** Empurrar fica registrado no resumo (o Maddox narra); Lentidão grava `flags.slowed` (não acumula,
  aparece em `get_combat`); Trespassar libera `economy.cleave` depois de um acerto corpo a corpo e a opção `cleave:<id>` na Ação, uma vez
  por turno, contra **outro** inimigo (`CLEAVE_SAME_TARGET`), sem somar o modificador ao dano (salvo negativo); o resumo diz que o
  jogador declara o alvo a 1,5 m e o Maddox pode recusar pela cena.
Cancelar a ação devolve `lightExtraUsed`/`cleaveUsed`; voltar um turno restaura o combate do snapshot (economia e flags juntos).

**Ataque furtivo depois do acerto.** Ao acertar com a opção que tem o rider (`combatAction.sneakRider`), sem o furtivo usado no turno e
sem desvantagem (vantagem vale direto; sem vantagem, a conferência do aliado a 1,5 m), o servidor insere o passo `sneak-choice` antes do
dano. O humano vê "Somar ataque furtivo (+Xd6)" e "Não somar" (`POST …/combat/actions/[actionId]/sneak { add }`, só o dono da ação,
`chooseSneakAttack`); rolar antes de responder = 409 `SNEAK_CHOICE_PENDING`. Somar põe os dados no passo de dano; `sneakAttackUsed`
continua marcado quando esse dano é rolado. O Opex soma sozinho (`resolvePendingAction`). Sair do turno sem responder segue o fluxo de
ausência (a ação pendente é cancelada).

**Esconder-se e a vantagem na tela.** A condição `invisible` com `source: "Esconder"` sai depois de uma jogada de ataque (a vantagem vale
para o ataque que revela) ou ao conjurar magia com componente Verbal (`OptionSpell.verbal`, do catálogo). Invisível de outra origem
fica. "Fazer barulho" e "ser encontrado" ficam com o Maddox (`apply_effect`). O passo de ataque grava `modeReasons` (prévia ao declarar e
o valor da rolagem); o card mostra "Vantagem: atacante invisível" (ou "Normal: vantagem e desvantagem se anulam (…)") e os dois d20 com o
mantido em destaque, e o rolador já vem no modo certo.

**PV fora do combate.** Ferramenta do narrador `update_character_hit_points` (`server/hit-points.ts`, regra pura em `hit-points-ops.ts`),
nos graus `MADDOX_SHEET_RIGORS`, recusada com combate tático ativo (usar `apply_effect`): `curar` (`dados` que o servidor rola ou `valor`),
`definir`, `estabilizar`, `acordar` (estabilizado → 1 PV), `descanso-curto` (`dadosDeVida`, cada dado + modificador de Constituição) e
`descanso-longo` (PV máximos, PV temporários e testes contra a morte zerados; os dados de vida gastos não mudam). Motivo obrigatório; personagem
morto recusa; PV limitado ao máximo. Grava na ficha (auditoria `FichaPersonagem`, `origin: "narrator-hit-points"`, tempo real) e põe na
mesa a mensagem `kind: "hit-points"` ("PV de X: 0 → 1 (motivo)", na transcrição como "ficha"). A instrução `MADDOX_HIT_POINTS_RULE` do
narrador manda chamar a ferramenta antes de narrar alguém a 0 PV acordando, agindo ou se recuperando.

**Decisão do dono D3 (checagem ao abrir o combate).** Roda no job da preparação do próprio personagem, antes da revisão da ficha (a ordem
de iniciativa já espera esse job): personagem com `hpCurrent = 0` e vivo → `reviewDownedCharacter` lê o `currentState` e a narração
recente e devolve `{decisao: "manter" | "aplicar", operacao, motivo}`. "aplicar" usa o mesmo serviço da ferramenta (`origin:
"combat-open"`, atualiza `hpZero`/`stable` no combate); "manter" põe "X segue caído com 0 PV (motivo)". Uma vez por preparação
(`downedCheckedAt`). Sem ninguém a 0 PV, não há IA; falha ou fim do prazo (`MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS`) = o combate segue sem
mudança, só log.

**Testes.** `tests/backend/maddox/combat-prep-catalog.test.ts` (fontes, D1/D2, Ladino 1 + Adaga, maestrias nas opções, PV puros),
`tests/backend/maddox/combat-prep-ai.test.ts` (ferramentas na AI SDK e token no OpenCode), o bloco DND-49 de
`tests/backend/maddox/maddox-mcp.test.ts` (token de catálogo), os blocos DND-49 de `tests/backend/maddox/tactical-combat.test.ts`
(furtivo, maestrias, Esconder-se, PV, checagem ao abrir, Referências do catálogo, consolidação) e
`tests/frontend/maddox/maddox-dnd49-combat.test.tsx` (escolha do furtivo, motivo da vantagem).

## Injetar Lembrança (DND-25)

Todos os graus. Código: `server/reminders.ts`, `POST …/game/reminders` `{ texto }` (Zod `maddoxReminderSchema`: 1 a
`MADDOX_REMINDER_MAX_CHARS` = 500, sem outros campos; `maddox.play`), `components/game/InjectReminderButton.tsx` (ao lado de "Gerar
imagem da cena", `GlassPopover` com "Injetar Lembrança", o placeholder `MADDOX_REMINDER_PLACEHOLDER`, contador "N/500" e "Enviar"
desabilitado vazio ou acima do limite; botão desabilitado com o motivo de `reminderBlockReason`), `ReminderLine.tsx` e
`useInjectMaddoxReminder`.

- **Envio:** membro `joined` (`loadAsMember`), campanha `active` (409 `CAMPAIGN_NOT_ACTIVE`) e `assertMemberCanPlay` (409
  `INTERVIEW_REQUIRED`). Grava a mensagem `kind: "reminder"` (`content` = texto; `reminder { status, jobId, … }`), audita (`CRIAR`,
  com o tamanho) e avisa a mesa. **Não** é declaração, não muda o turno e vale dentro e fora de combate, inclusive na vez de outro.
  Sem edição nem exclusão; várias por narração.
- **Consumo:** no começo de cada **narração** (não nas respostas a perguntas) `claimReminders` reivindica as pendentes para o job
  (`reminder.jobId`; também as de um job que já não roda) — a enviada durante a geração fica para a seguinte; no combate tático cada
  bloco é uma narração. A tarefa ganha "## Lembranças dos jogadores (considere nesta narração)" com `[id curto] **Personagem**: texto` e
  a orientação (contexto, não muda as regras; no Rigoroso e no Fiel a ficha prevalece). As lembranças ficam fora da transcrição.
- **Decisão:** ferramenta `resolve_reminder { lembranca, guardar, tipo?, titulo?, texto?, visibility? }` (AI SDK e MCP) guarda a decisão
  no job. Depois de gravar a narração, `commitReminders` grava as escolhidas com `saveCampaignMemory` (canal dos jogadores ou do mestre;
  tag `lembranca`; rede fora = fila `engramind_pending_writes`) → `saved` ("Guardada como memória"); as demais → `discarded` ("Usada só
  neste turno"). Geração que falha devolve as lembranças a `pending` (`releaseReminders`); `commitReminders` nunca lança (falha ao gravar a situação = aviso no log e as lembranças voltam a esperar, sem refazer a narração gravada). Sem narração, fica "Aguardando o Maddox".
- **Tela:** linha discreta para toda a mesa "{Personagem} lembrou o Maddox: “…”" com o aviso da situação abaixo.

Sem permissão nova (`maddox.play` cobre).

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

**Voltar a um turno (DND-44).** Com a mesa de volta a um turno, o que veio depois sai do Diário (histórico, busca e imagens) pelo
filtro de descarte, e as memórias voltam à versão do turno (as criadas depois ficam arquivadas e não aparecem). Retomar o turno de
origem devolve tudo.

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
falas da mesa (`narration`, `declaration`, `question`, `answer`, sem as respostas que falharam; com as declarações ocultas da
DND-36, as dos outros jogadores ficam de fora pela mesma regra do chat), grupo (nome, perfil e condição) e
situação atual. Termo de 2 a 100 caracteres (fora disso, 400). Até 20 por grupo (`hasMore`), cada um com um trecho de ~160
caracteres em texto corrido (sem `{{Tipo:Nome}}` nem ênfase do Markdown). O `search_memories` do narrador usa o mesmo regex.

API (todas `GET`, `maddox.play`, usuário efetivo):

- `GET /api/maddox/campaigns/[id]/journal` — resumo: situação atual, cenário, missões ativas, contagens, `myMemberId` e avatar do Maddox.
- `GET …/journal/npcs?cursor=` e `GET …/journal/memories?kind=&status=&cursor=` — página de 30, do mais recente (cursor `_id`;
  inválido = 400; `kind` inválido = 400 com as opções). Missão sem situação gravada conta como `ativa`.
- `GET …/journal/party` — personagens do grupo.
- `GET …/journal/search?q=` — busca.
- O histórico usa `GET …/game/messages` (sem `before` = página mais recente).

Índice novo (pela `ensure-maddox-indexes`): `{ campaignId, visibility, _id: -1 }` em `maddox_npcs`. As anotações
do Diário vêm do Engramind (seção "Memórias de campanha no Engramind").

**Tela `/campanhas/[id]/diario`** (`pageAccess`): cabeçalho da campanha (`CampaignChatHeader`, cor do rigor, "Voltar à mesa"),
card de busca com espera de 300 ms e resultados agrupados (Situação atual, NPCs, Locais, Missões, Outras anotações, Grupo,
Histórico da mesa) com o termo destacado; abas `IntegrationTabs` (`?aba=historico|npcs|locais|missoes|anotacoes|grupo`):
histórico em modo leitura (`GameMessageList readOnly`: nenhum card é "meu", então nada de rolar, cancelar ou reagir;
`?msg=<id>` carrega até 10 páginas atrás da mensagem e a destaca, depois avisa "Mensagem muito antiga"), NPCs (um por linha; morto esmaecido),
locais, missões (filtro por situação em `GlassSelector` com as cores de raridade, na URL `?situacao=` — o link de um resultado
da busca o zera), anotações (`?tipo=evento|relacao|fato|outro`) e grupo. NPCs e anotações abertos por link fora da primeira
página: a lista carrega as páginas seguintes até o item (até 10, `MADDOX_JOURNAL_SEEK_PAGES`) e depois avisa "Item muito antigo:
use “Carregar mais”". Ao lado, "Situação atual" (`JournalStateCard`, o mesmo da página da campanha: campos com ícone, "Decisão aguardada" em
destaque, chip "atualizada no turno N" e as missões ativas) e o cenário com "Ver o cenário completo" animado (`AnimatedExpand`). Cada item tem âncora
(`#npc-…`, `#anotacao-…`, `#personagem-…`) e fica em destaque quando aberto por link. Em dia pelo `maddox.game.changed`
(as chaves ficam sob `MADDOX_CAMPAIGNS_KEY`).


**Card da história no lobby (DND-37).** Em `/campanhas/[id]`, o `CampaignStoryCard` (`components/campaigns/`) substitui o
antigo card do cenário:

| Situação | Card |
| --- | --- |
| Cenário não concluído | Card "Cenário" com a entrevista (dono) ou a espera (jogadores), como antes; o resumo do Diário não é buscado |
| Cenário pronto, sem situação registrada | `TableTutorialCard` "Como funciona a mesa": ciclo do turno em 3 etapas (o Maddox narra → cada jogador declara → o Maddox resolve), réplica do campo com os botões reais (`AskMasterButton`, `PassTurnButton`, `DeclareButton` de `game/composer-buttons.tsx`), "Injetar Lembrança", "Diário" (`JournalLinkButton`) e, só para o dono, "Gerar imagem da cena"; "Ver mais dicas" animado com as regras do turno e os atalhos (Enter declara, Shift+Enter quebra a linha) |
| Situação registrada (algum campo público ou `updatedTurn`, `hasJournalState`) | `JournalStateCard` com o conteúdo longo recolhível (`collapsible`) |

- A fonte é a mesma do Diário (`useMaddoxJournalSummary(campaignId, enabled)` → `GET …/journal`, só os campos públicos); a
  troca tutorial → situação acontece pelo `maddox.game.changed` que o lobby já escuta. Carregando = esqueleto; erro sem
  dados = aviso discreto com "Tentar de novo" (o resto da página continua). Dados já carregados têm precedência: uma falha
  num refetch mantém a situação na tela.
- O tutorial também aparece com a mesa já iniciada quando o narrador ainda não registrou a situação (o registro é opcional):
  nesse caso o chip vira "Mesa em andamento · Turno N" e o texto não fala em "antes do primeiro turno".
- Os botões da demonstração ficam numa moldura `inert` + `aria-hidden` + `pointer-events-none`, com callbacks vazios: não
  recebem foco nem clique.
- O texto do cenário saiu do lobby: o rodapé do card tem o link "Ver o cenário completo" para o Diário.
- "Ver mais" anima a altura com `framer-motion` (`AnimatedExpand` em `components/AnimatedExpand.tsx`, botão com
  `aria-expanded`/`aria-controls`, só aparece quando o conteúdo passa da altura recolhida) e respeita `useReducedMotion`.
  A medição acontece antes da pintura (`useLayoutEffect`) e a primeira altura entra sem animação, então o conteúdo longo já
  nasce recolhido. Recolhido, o conteúdo fica `inert` (sem foco por teclado nem leitura por leitor de tela, inclusive a
  prévia visível); o botão expande. Os
  cards desses estados usam `GlassCard animate={false}`: o `GlassCard` animado troca a `div` por `motion.div` depois de
  montar e remonta os filhos, o que zeraria o estado do "ver mais".

**Pontos de entrada.** Na mesa, "Buscar no diário" (diálogo com a mesma busca; o resultado leva ao diário na aba e no item) e
"Diário" no cabeçalho; cada NPC do painel "NPCs conhecidos" abre o NPC no diário. No lobby, "Diário" depois que a campanha começa.
Sem atalho de teclado: Ctrl/⌘+K já é a busca global do app.

**Aba Imagens e legendas na busca (DND-22).** Ver "Densidade das narrações e imagens no diário (DND-22)".

## Imagens nas cenas (Maddox 10)

Código: `server/scene-images.ts` (regras, cota, reserva, geração em segundo plano, pedidos do dono, DTO), `server/scene-image-references.ts`
(referências), `server/scene-image-appearance.ts` (aparência dos personagens, DND-33), `server/scene-image-hints.ts` (JEV), `server/scene-image-describer.ts` (descrição para o pedido manual),
`server/combat-image.ts` (fim de batalha), ferramenta `request_scene_image` e `save_npc.gerarRetrato` em `server/master-tools.ts`,
retrato automático (`scheduleAutoNpcPortraits`, chamado pelo `save_npc` e por `linkCombatant` em `server/combat.ts`, DND-43),
coleção `maddox_scene_images` (`models/maddox-scene-image.ts`), `components/game/GameSceneImage.tsx`, `SceneImageButton.tsx`,
`NpcPanel.tsx`, `components/campaigns/SceneImagesField.tsx`, `components/settings/MaddoxSceneImagesCard.tsx`,
`hooks/useMaddoxSceneImages.ts`. Usa o **Gerador de imagens** já integrado (`generateAndStoreDndImage`).

**Capa na lista de campanhas (DND-35).** `listMyCampaigns` (`server/campaigns.ts`) preenche `lastSceneImageUrl` (só na DTO da
lista; o detalhe não tem o campo nem roda a consulta) com **uma** agregação para todas as campanhas da lista (índice `{ campaignId, createdAt }`): só `status: "done"` com `url`, sem `npc-portrait`, a mais
recente pela data do pedido (`createdAt`, desempate por `_id`). O `CampaignCard` mostra a imagem atrás do gradiente do rigor (com véu
escuro), cai na `coverUrl` e, sem nenhuma (ou se a imagem não carregar), nas espadas. Imagem nova aparece na próxima carga da lista
(não há evento próprio). Falha da agregação loga aviso e devolve a lista sem imagens.

**Configuração** (`settings.sceneImages`, seção "Imagens" da aba; padrão tudo desligado, menos o retrato automático; configuração
antiga recebe o padrão): `enabled`, `autoPortraits` ("Retrato automático de NPC", padrão **ligado**, DND-43; só age com `enabled`), `situations` (fixas, `MADDOX_SCENE_IMAGE_SITUATIONS`: abertura da campanha, novo local ou cenário, fim de batalha, clímax ou
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
| `npc-portrait` | `save_npc { gerarRetrato: true }`, **retrato automático** ou **"Gerar retrato"** do dono | `gerarRetrato`: só na narração, situação "Retrato de NPC", chave da campanha, NPC conhecido dos jogadores e sem retrato (uma vez). Automático: ver abaixo. Dono: só o teto | `npc.portraitUrl` |

**Retrato automático (DND-43).** Com `enabled` e `autoPortraits` ligados e a chave da campanha ligada (independe da situação "Retrato
de NPC"), `scheduleAutoNpcPortraits` pede o retrato de todo NPC **conhecido dos jogadores, sem retrato e sem pedido anterior**
(`pending`, `generating`, `done` ou `failed`: uma tentativa por NPC; a nova fica no "Gerar retrato" do dono). Gatilhos: `save_npc` que
deixa o NPC com `visibility: "players"` (criação, mudança de visibilidade ou atualização de NPC já conhecido e ainda sem retrato —
**decisão do dono** no planejamento da DND-43: os NPCs legados ganham retrato aos poucos, conforme o Maddox os atualiza; cada um
uma vez, dentro do teto diário) e
o NPC registrado ao abrir um combate (`linkCombatant`, já nasce conhecido; o NPC existente só ligado ao combate não dispara). Pede na
hora, sem rascunho, dentro ou fora da narração (pergunta, Opex); o retorno do `save_npc` traz `retrato: "pedido automaticamente…"`
e, nesse caso, o `gerarRetrato` da mesma chamada não pede outro. O slot `portrait` só conta no **teto diário**: o intervalo
`minNarrationsBetween` e a regra de uma por turno não se aplicam. Gerador indisponível, teto ou erro: o NPC é salvo, nada é gerado e o
motivo vai ao log (`origin: "auto"`, `trigger: "save_npc" | "combat"`). A mesa fica sabendo pelo aviso do job que salvou o NPC e de
novo quando o retrato fica pronto. Com a chave ligada, a regra "## Imagens da cena" diz ao narrador que o NPC conhecido ganha retrato
sozinho (no lugar da orientação do `gerarRetrato`).

**Ferramenta.** Validação restritiva: situação inexistente ou inativa, personagem desconhecido, NPC desconhecido ou só do mestre e
entidade fora do catálogo recusam com a lista das opções e nada é guardado; `combat-end`/`npc-portrait` pela ferramenta, segunda imagem
na narração, resposta a pergunta, cota esgotada e Gerador indisponível também recusam com o motivo. O pedido fica no job (como os
testes) e só vira imagem **depois** que a narração é gravada (`scheduleDraftImages` em `runMasterTurn`): narração que falha não gera
nada. Oferecida à AI SDK só quando há situação ativa pedida pelo narrador; no MCP `dndicas-maddox` existe sempre e recusa pelo
contexto. A regra **"## Imagens da cena"** (`sceneImagesRule`) lista as situações ativas e, fora da cota, avisa "AGORA: … Não peça
imagem nesta narração."; com "Retrato de NPC" ativa, orienta o `gerarRetrato`. `save_npc` salva o NPC de qualquer jeito: o retorno
`retrato` diz se o retrato foi pedido ou por quê não. A regra e a ferramenta pedem que a descrição siga o perfil e a ficha (sem inventar cabelo, olhos ou
pele), e a regra de persistência manda registrar mudanças visíveis de aparência em `update_character_state`, para entrarem nas próximas
imagens (DND-33).

**Frequência.** Contam as imagens com `counts: true` (`pending`, `generating`, `done`); `failed` e `skipped` liberam a vaga. Intervalo
(só automáticas): a última automática precisa estar `minNarrationsBetween` turnos do mestre antes. Uma automática por turno: índice
único parcial `{ campaignId, turnNumber, slot }` com `counts: true, slot: "auto"` (a duplicata vira `skipped`). Teto: todas as origens
nas últimas 24 h; a reserva reconta depois de gravar e descarta (`skipped`, `daily-limit`) o que passou em pedidos simultâneos.

**Referências de aparência.** Os **dados** de quem aparece vão no pedido ao gerador e as **imagens cadastradas** vão como referência
(`prompt: { text, images }` da SDK `ai`), até 6, na ordem personagens (retrato da campanha ou, sem ele, a foto da ficha) → NPCs (retrato)
→ catálogo (`image`). Imagens do storage são lidas pela chave (`/api/upload?key=`), externas por `fetch` (10 s, 5 MB); a que falha sai
com aviso. Modelos que aceitam imagens de entrada: Gemini `*-image*` e OpenAI `gpt-image-*` (`imageModelSupportsReferences`); nos
demais (Imagen, `dall-e-*`), só os dados, com aviso no log.

**Aparência dos personagens (DND-33, `scene-image-appearance.ts`).** Vale para `tool`, `combat-end` e `manual` (o retrato de NPC não
leva). Por personagem, só o que é visual e está registrado: campos da ficha (raça, classe, idade, altura, peso, cabelo, olhos, pele,
aparência — HTML vira texto), as seções **"Identidade e aparência"** e **"Equipamentos e recursos"** do perfil da entrevista, a condição
atual e as **anotações da campanha no Engramind** sobre a aparência: busca pelo nome em `searchCampaignMemories` só no canal dos
**jogadores** (nunca as do mestre), filtrada no código — a anotação precisa citar o nome como palavra inteira e ter um termo de aparência
(`MADDOX_APPEARANCE_TERMS`: palavra inteira, também no plural, ou radical explícito com `*` — "olho" não casa "olhou", "capa" não casa "capaz"; decisão do plano: vocabulário fixo) —, até 3 por personagem (400 caracteres cada), com
prazo de 5 s; rede fora ou prazo estourado = sem anotações (aviso no log), a imagem segue. As anotações entram como "Mudanças
registradas na história (valem sobre a ficha quando a contradizem)". Campo vazio não aparece e personagem sem dados sai como
"aparência não registrada: não invente traços marcantes como fatos": nada é deduzido. As seções não visuais do perfil (origem,
personalidade, capacidades, relações) não vão ao gerador.

**Pedido ao gerador** (`buildSceneImagePrompt`), nesta ordem: abertura e **estilo da mesa** (inalterados), **"## Cena a retratar (o que
acontece AGORA)"** (momento + descrição), **"## Aparência de quem aparece (obrigatória)"** (o bloco acima, com a regra "detalhes não
listados ficam livres, mas nunca contradizem os listados"), a linha das imagens anexadas, os demais dados em JSON (campanha — nome,
cenário, local —, NPCs com a descrição pública — nunca `masterNotes` —, entidades do catálogo compactas), a **"Conferência final da
aparência"** (uma linha por personagem: cabelo, olhos, pele, raça) e "Sem texto, letras…". O retrato de NPC mantém "Quem é: …" + JSON.

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
descrição, com todos os personagens. Essa geração (DND-33) recebe nas instruções o bloco de aparência de todos os personagens ativos e
a descrição pública dos NPCs conhecidos, com a regra de copiar a aparência registrada e não atribuir cabelo, olhos, pele, marcas ou
roupas que não estejam lá; o pedido é o **último turno em destaque** (`lastTurnContext`/`lastTurnBlock`): "## ÚLTIMO TURNO (turno N) —
retrate ESTE momento" com as declarações, os testes (motivo, CD e "sucesso"/"falha"; pendente = "sem resultado ainda"; cancelado não entra), as ações
de combate (o `combatAction.summary` do card; cancelada não entra) e os trechos de narração do turno em ordem (sem os que falharam; teto de 8.000 caracteres, cortando do mais antigo) e o último trecho como "MOMENTO A RETRATAR"; a narração
do turno anterior vem depois, em "## Antes disso (só contexto, NÃO retrate)" (até 1.500 caracteres). Erros: 403 (não dono), 409 `SCENE_IMAGE_BUSY`, `SCENE_IMAGE_LIMIT`, `AI_IMAGE_UNAVAILABLE`,
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

## Sugestões de ação (DND-30)

Código: ferramenta `suggest_actions` (`MADDOX_ACTION_OPTIONS_TOOLS` em `server/master-tools.ts`), rascunho no job
(`setDraftActionOptions`/`takeDraftActionOptions` em `server/game-live.ts`), gravação em `runMasterTurn` (`server/game.ts`),
`actionOptionsView` (`game-view.ts`), `components/game/GameActionOptions.tsx`. Constantes `MADDOX_ACTION_OPTIONS_MAX`,
`MADDOX_ACTION_OPTION_GUIDE` e `MADDOX_ACTION_OPTION_TEXT_MAX` (`constants.ts`).

**Geração.** O próprio Maddox sugere, na narração, algumas ações para cada personagem com `suggest_actions { opcoes: [{ personagem,
acoes[] }] }`: sem chamada extra de IA. A orientação vai no **texto da tarefa** (`MADDOX_ACTION_OPTIONS_TASK_LINE`, via
`narratorTaskText(task, { actionOptions })`), como a densidade, para valer com a sessão do OpenCode reaproveitada. A ferramenta é
oferecida (AI SDK: `buildMaddoxAiTools({ actionOptions })`; OpenCode: listada no bloco do MCP `dndicas-maddox`) só nas narrações
fora do combate tático; nunca nas respostas a perguntas. Se o modelo não chamar, a narração fica sem sugestões. Desde a DND-52, a
linha pede a chamada **antes de escrever a narração** (escrita única), não mais "no fim".

| Regra | Comportamento |
| --- | --- |
| Onde vale | Só na narração do turno do mestre (`meta.kind === "narration"`); resposta a pergunta e combate tático ativo recusam com o motivo |
| Personagem | Nome comparado sem acento e sem caixa entre os personagens ativos com entrevista concluída; desconhecido = erro com a lista |
| Tamanho | Até `MADDOX_ACTION_OPTIONS_MAX` por personagem, repetidas saem; texto acima do teto de proteção é cortado e o retorno avisa (`truncated`), nunca recusa |
| Repetir a chamada | Substitui as sugestões daquele personagem na narração |
| Gravação | Com a narração (`actionOptions: [{ memberId, characterId, characterName, options }]`); narração que falha não grava nada |
| Testes pedidos | Se a mesma narração pediu testes, o turno dos jogadores não abre: as sugestões são descartadas (log informativo) |

**DTO.** `MaddoxGameMessageDto.actionOptions` (só nas narrações) traz **apenas a lista do personagem de quem vê**; as dos outros
nunca saem do servidor. Mensagens antigas sem o campo = `null` (sem migração). Não entram na transcrição do narrador.

**Tela.** Bloco "Sugestões do Maddox" logo abaixo da bolha da **última** narração, só quando ela é do turno atual, o turno dos
jogadores está aberto fora do combate tático e o jogador está pronto e elegível (`actionOptionsView`). Cada sugestão é um botão
(`aria-label` "Declarar: …") que envia `{ kind: "declaration", content }` pelo mesmo `onSend` do campo — inclusive a validação
dos graus Rigoroso e Fiel ao D&D (`ACTION_INVALID` mostra o motivo acima do campo e as sugestões continuam clicáveis). Durante o
envio os botões travam; depois de declarar ficam desabilitados com a escolhida marcada (`data-chosen`). Somem quando o turno do
mestre começa ou chega a narração seguinte. O campo de texto livre continua igual. O diário (só leitura) não mostra o bloco.

Sem permissão nova (`maddox.play` cobre a mesa).

## Retrato do personagem (DND-31)

Código: `server/character-portrait.ts` (prompt puro `buildCharacterPortraitPrompt`, `scheduleCharacterPortrait`,
`runCharacterPortrait`, `expireStaleCharacterPortraits`, `retryCharacterPortrait`), rota
`POST /api/maddox/campaigns/[id]/character/portrait`, hook `useRetryMaddoxCharacterPortrait`.

- **Quando:** uma única vez, em segundo plano, logo depois de confirmar a síntese da entrevista de personagem (a conclusão não
  espera a imagem). Estado em `character.portrait { status: null | pending | generating | done | failed, error, startedAt,
  completedAt }`; `portraitStatus` no DTO do personagem.
- **Pedido:** Gerador de imagens (`generateAndStoreDndImage`), 1:1, do peito para cima, sem imagens de referência: nome, campanha,
  estilo visual da mesa (`settings.sceneImages.style`), aparência consolidada (raça/classe/subclasse das escolhas da ficha,
  aparência, idade, altura, peso, olhos, pele, cabelo) e as seções identidade, origem, capacidades e equipamentos do perfil (menções
  viram texto; "a definir" fica de fora). Arquivo em `maddox/campaigns/{id}/characters/{personagem}-{ts}`; consumo na origem
  `maddox-character-portrait`; teto de 120 s (`portraitTiming.timeoutMs`, encurtado nos testes), que aborta o pedido ao gerador.
- **Resultado:** `portraitUrl` (substitui inclusive o retrato enviado no fluxo antigo) e a `photo` da ficha D&D ligada. Como tudo lê
  `portraitUrl`, o retrato vira o avatar no lobby, no card da lista, no perfil, na mesa (falas, testes, combate, iniciativa, "Na
  mesa"), no diário e serve de referência de aparência nas imagens de cena. Sem retrato, o `MemberAvatar` cai na foto do usuário
  e, por último, nas iniciais. Avisa o lobby (`maddox.campaign.changed`) e, com a campanha em jogo, a mesa (`publishGameChanged`).
- **Falha** (gerador indisponível, erro ou teto): `failed` com "Não foi possível gerar o retrato do personagem.", sem tocar no
  `portraitUrl`. `pending`/`generating` há mais de 5 min fora do processo (reinício) vira `failed` na leitura da campanha.
- **Nova tentativa** ("Gerar retrato de novo"; "Gerar retrato" para personagem antigo concluído sem imagem): só o dono do
  personagem, com `maddox.play`, entrevista concluída e campanha aberta; reserva condicional (`failed`, ou sem status e sem
  imagem → `pending`), então dois cliques geram uma vez. Com retrato pronto ou gerando = 409 `PORTRAIT_NOT_RETRYABLE`; antes da
  entrevista concluída = 409 `INTERVIEW_REQUIRED`.
- **Auditoria** (`CampanhaMaddox`): personagem criado pela entrevista, retrato gerado, com falha e nova tentativa.

Sem permissão nova: tudo exige `maddox.play` e ser o dono do personagem.

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

## Dificuldade dos combates (DND-42)

**Campo.** `campaign.combatDifficulty` (`MADDOX_COMBAT_DIFFICULTY_LEVELS`: `muito-facil`, `facil`, `equilibrado` — padrão
`MADDOX_COMBAT_DIFFICULTY_DEFAULT`, o do meio —, `dificil`, `mortal`; `MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS` com rótulo, descrição, raridade
common → legendary, `rules[]`/`free[]` no formato do card de rigor e `encounter`, o texto enviado ao narrador). É o **balanceamento dos
adversários** contra o grupo (quantidade, força e condições), não o rigor das regras, e só **vale** nos graus com combate tático
(`MADDOX_TACTICAL_COMBAT_RIGORS`: Rigoroso e Fiel ao D&D). Campanha antiga sem o campo é lida como `equilibrado` (default do Mongoose e
do DTO; sem migração). `POST /api/maddox/campaigns` e `PATCH /api/maddox/campaigns/[id]` aceitam `combatDifficulty` opcional em
**qualquer** grau (o valor não se perde se o grau mudar no lobby; inválido = 400 "Escolha uma dificuldade de combate válida"); o dono
muda a qualquer momento, inclusive em andamento e com o rigor travado, com auditoria (`antes`/`depois`). Sem permissão nova
(`maddox.play` e dono da campanha).

| Passo | Raridade | Orientação (resumo) |
| --- | --- | --- |
| Muito fácil | common | Bem menos adversários e mais fracos (2 goblins para 4 personagens de nível 1); nunca ameaça real |
| Fácil | uncommon | No máximo 3 goblins para 4 personagens de nível 1, **ou** os 4 enfraquecidos pela cena (bêbados, sonolentos), com desvantagem nos ataques |
| Equilibrado | rare | Encontro médio pelo orçamento de XP do Guia do Mestre: 4 goblins para 4 personagens de nível 1 |
| Difícil | veryRare | No limite do orçamento de XP: mais adversários ou monstros mais fortes |
| Mortal | legendary | Acima do orçamento, com risco real de morte |

**Prompt.** `combatDifficultyLine(level)` vai no **texto da tarefa** (`narratorTaskText(task, { combatDifficulty })`), como a densidade,
para valer já no próximo combate mesmo com a sessão do OpenCode reaproveitada. O narrador (`narrator.ts`) só a envia nos graus táticos
e nunca nas respostas às perguntas. Nas narrações **sem combate tático em andamento** (`!task.tactical`, onde `start_combat` pode ser
chamado) vai a linha completa: ela manda contar os personagens e o nível antes de escolher quantidade e monstro e lembra que no Fiel ao
D&D os monstros vêm só do catálogo (o ajuste é pela quantidade, pela escolha do monstro e pelas condições). Nas narrações **com combate
em andamento** (`task.tactical`) vai a versão curta `combatDifficultyReinforcementLine`: reforços (`update_combat`) só se a ficção pedir, e
o encontro somado (os de pé mais os novos) continua no nível escolhido. A mudança de nível vale para a montagem do próximo combate e para
os reforços seguintes. **Decisão do dono:** a desvantagem dos adversários é só orientação de
prompt (sem campo nem regra nova no motor) e precisa fazer sentido narrativo — a linha e a regra tática exigem motivo na cena e proíbem
enfraquecer todos os adversários em todo combate; sem motivo, a dificuldade baixa pela quantidade ou por um monstro mais fraco. O
adversário enfraquecido tem o motivo na `descricao` (que volta no `get_combat`/`tacticalView`) e ataca com `modo: "desvantagem"` no
`monster_action`. Não é validador: o modelo pode errar a conta.

**Tela.** `CombatDifficultyCard` (cópia estrutural do `DensityCard`: slider com 5 marcas, cor de raridade, descrição animada e as
colunas "Nos encontros" e "Fica com o Maddox", rodapé "valendo a partir do próximo combate") na criação (`CreateCampaignDialog`) e na
edição (`EditCampaignDialog`), **só** quando o rigor do formulário é tático (`useWatch("rigor")`); a criação envia `combatDifficulty`
só nos graus táticos, a edição só se mudou. `CombatDifficultyChip` ("Combate fácil") no card da lista e na página da campanha, só nos
graus táticos.

## Declarações dos outros jogadores ocultas (DND-36)

**Configuração.** `campaign.hidePlayerActions` (padrão `false`; campanha antiga sem o campo = visíveis, sem migração). Card "Ações dos
outros jogadores: Visíveis | Ocultas" (`PlayerActionsField`, `GlassSelector`) na criação e em "Editar campanha", em todos os graus.
`POST /api/maddox/campaigns` e `PATCH /api/maddox/campaigns/[id]` aceitam `hidePlayerActions` (o POST só o envia quando ligado; o PATCH só
quando mudou); o dono muda **a qualquer momento**, com auditoria (antes/depois). O detalhe da campanha devolve o campo.

**Regra** (`src/features/maddox/player-actions-visibility.ts`, única para o chat e a busca): com o campo ligado, uma mensagem
`kind: "declaration"` de **outro** membro fica oculta para quem lê. Nunca ocultas: a própria declaração, "não fez nada", perguntas ao
mestre e respostas, narrações, cards e ações do combate tático e o **resumo da vez do combate** — que também é `declaration`
(`recordCombatTurn`, "Encerrar turno"). O resumo é marcado com `combatTurn: true` em `maddox_campaign_messages`; os gravados antes da
marca são reconhecidos pelo começo do texto (`COMBAT_TURN_SUMMARY_PATTERN`, "Vez de … (rodada do combate)").

**Leitura.** Só na leitura: o banco guarda o texto inteiro e o narrador o recebe completo. `messagesDto` (estado da mesa e
`GET …/game/messages`, também o histórico do Diário) entrega a mensagem oculta na mesma posição, com `content: ""` e
`hiddenAction: true` (o texto não sai do servidor); a tela (`GameMessageList`) mostra a linha discreta "Fulano declarou sua ação."
(`data-testid="game-action-hidden"`, mesmas classes do `game-pass`). A busca do Diário aplica `hiddenPlayerActionsFilter(memberId)`
na consulta, antes do limite. Vale para todos os membros, inclusive o dono. Desligar devolve os textos a todos.

Sem permissão nova: a configuração exige ser o dono e a leitura, `maddox.play` e ser membro.

## PV dos adversários e destaque do 1 natural (DND-53)

**Configuração.** `campaign.showEnemyHp` (inimigos) e `campaign.showAllyHp` (aliados NPC), ambos padrão `false` (campanha antiga sem o
campo = só a faixa, sem migração). Card "PV nos combates" (`CombatantHpField`, um `GlassSelector` por lado: "Estado por texto" |
"Mostrar PV") na criação e em "Editar campanha", **só nos graus táticos** (`MADDOX_TACTICAL_COMBAT_RIGORS`); o servidor aceita os campos
em todo grau, para não perder o valor. O POST só envia o lado ligado; o PATCH, só o lado que mudou. O dono muda **a qualquer momento**,
inclusive no meio de um combate, com auditoria (antes/depois); o detalhe da campanha devolve os dois campos.

**Leitura no servidor.** `tacticalSnapshot(..., hpVisibility)` (`server/tactical-dto.ts`; `combatantHpVisibilityOf(campaign)` em
`getGameState`) preenche `hp: { current, max, temp }` do combatente só quando o lado dele está ligado e mantém o `band`; desligado,
`hp: null` e os números não saem do servidor. O card "Ordem de iniciativa" (`combatEventDto(..., "order")`) nunca leva os números. A CA
nunca entra no DTO. 0 PV continua `defeated`/"Caído". Vale na próxima leitura do estado (o `updateCampaign` emite
`maddox.campaign.changed` e a mesa recarrega), sem reiniciar o combate. O Personagem Opex lê o mesmo estado: a linha do adversário vira
`PV atual/máximo` em vez de `estado: <faixa>` (`situationOf` em `server/opex-table.ts`). O mestre continua recebendo os números pelo
`get_combat`, como sempre.

**Tela.** `InitiativeTracker`: com `hp`, a mesma barra dos personagens (`HpBar`, cor `hpColor`) no lugar da faixa, e o chip "Caído"
(`initiative-fallen`) quando o combatente está derrotado; na faixa compacta, `atual/máx` na cor da barra (`initiative-strip-hp`), só
dos combatentes do mestre.

**1 natural.** Sem mudança de regra (`attackOutcome().fumble` erra). No `CombatActionCard`, `attackFumbled(step)` (`combat-visuals.ts`:
passo `attack` feito com o d20 mantido em 1, lido do próprio dado, vale para cards antigos) liga o `CriticalHighlight` em
`critical-failure` e o `criticalBoxShadow` vermelho (`data-highlight` no card). O 20 natural continua verde e tem prioridade, mas
cada ataque tem o próprio card. A linha "1 natural"/"20 natural" (`combat-step-natural`) usa a cor de `CRITICAL_STAGE_CONFIG`. Sem
destaque para dano, teste contra a morte, iniciativa ou rolagens que não sejam de ataque; o `GameCheckCard` segue com o próprio
destaque. Nos dados ao vivo, `monster_action` emite o veredito `fumble` e o `LiveNpcRolls` mostra "Falha crítica!" em vermelho
(`live-roll-verdict`), separado de "Errou".

Sem permissão nova: a configuração exige ser o dono da campanha e a leitura, `maddox.play` e ser membro.

Testes: `campaigns.test.ts` (padrão, criação, edição auditada, 403), `tactical-combat.test.ts` ("DND-53": DTO desligado/por lado,
mudança no meio do combate, card da ordem sem números, veredito `fumble`), `opex-combat.test.ts` (linha do adversário),
`campaign-reset.test.ts` (campos preservados), `maddox-campaigns.test.tsx`, `maddox-tactical-combat.test.tsx` e
`maddox-dnd25-combat.test.tsx`.

## Personagens Opex (DND-26)

Personagens controlados por IA que o dono adiciona à campanha e que jogam como os outros: entrevista com o Maddox, ficha,
retrato, mesa, testes e combate.

**Voltar a um turno (DND-44).** As memórias do canal individual são gravadas com `turno:<n>` e `gravado:<ms>` e acompanham a volta
como as da campanha (arquivadas, revertidas, reativadas ou excluídas), com o token do próprio Opex. `opex.run` volta com o retrato.

**Permissão.** `maddox.opex` (`MADDOX_OPEX_PERMISSION`) só para **adicionar** (`POST /api/maddox/campaigns/[id]/opex` e o botão
"Adicionar Personagem Opex", via `canAddOpex` no GET do detalhe). Remover, "Tentar de novo", "Pular", aprovar e o retrato exigem
`maddox.play` e ser o dono. Migração `grant-maddox-opex` (uma vez, perfil `user` + padrão).

**Configuração** (seção "Personagem Opex" da aba, `?secao=personagem-opex`): `opexCharacter` (provedor/modelo; `provider: null` =
"Mesmo do Maddox"), blocos `rigorModels.opexCharacter[]`, `opexCharacterInstructions` com "Restaurar padrão"
(`DEFAULT_MADDOX_OPEX_CHARACTER_INSTRUCTIONS`), no mesmo Salvar; memórias globais (`MaddoxOpexMemoriesCard`) salvam à parte.
Resolução: `resolveOpexCharacterModel` (bloco do rigor → próprio → modelo do Maddox no rigor). Disponibilidade:
`maddoxOpexAvailability`.

**Membro** (`maddox_campaign_members`): `kind: "opex"`, `userId` sintético `opex:<memberId>` (`opexUserIdFor`) — os serviços que
acham o membro pelo `userId` funcionam sem regra nova — e `opex: { ownerUserId, prompt, interviewMode, addedAt, run, engramind }`.
`realUserIds` tira os ids sintéticos dos canais do Pusher e da busca de usuários; `notifyInterviewChanged` de um Opex avisa o dono.
A ficha fica com o dono (`sheetOwnerUserId`, "Minhas fichas"); o retrato e a foto da ficha também (`runCharacterPortrait`).
Sem presença: conta sempre como presente (combate, ausência, reações). DTO: `kind`, `opex: { interviewMode, status, error, prompt
(só o dono) }`; `status` = `interviewing | awaiting-approval | failed | ready` (entrevista "em andamento" sem execução viva há mais de
`MADDOX_OPEX_STALE_MS` vira `failed`). O `error` bruto (texto do provedor) só vai ao dono; os demais recebem a mensagem genérica
(vale também para `turn.opexActor.error` na mesa).

**Adicionar** (`server/opex.ts`): dono, campanha fora de `ended/archived` (409 `CAMPAIGN_CLOSED`), cenário pronto (409
`SCENARIO_PENDING`) e modelo disponível (409 `MADDOX_UNAVAILABLE`, a mensagem da criação). Sem limite. Não bloqueia "Iniciar campanha";
pronto no meio do jogo entra no turno seguinte (lista de elegíveis). Provisiona o Engramind e agenda a entrevista em segundo plano.
Remover usa `removeMember` (a mesma confirmação) e chama `onOpexRemoved` (arquiva as memórias).

**Entrevista** (`server/opex-interview.ts`), pelas mesmas funções de um jogador (`startInterview`, `sendInterviewMessage`,
`submitAbilityScores`, `submitHitPoints`, `completeInterview`) com a identidade do Opex:
- *Autônoma*: single-flight por membro (`opex-runtime.ts`); o Opex responde cada fala (JSON `{resposta}`), escolhe o método dos
  atributos (rolagem = as 5 rolagens no servidor, depois distribui) e os PV (rola os níveis com "rolagem"), e confirma a síntese.
  Conclusão recusada por algo corrigível (`CHARACTER_NAME_REQUIRED` etc.) vira pedido de ajuste ao entrevistador (até 2). Falha →
  `opex.run = failed` com o motivo; `POST …/opex/[memberId]/interview/retry` continua de onde parou (refaz a fala do Maddox que falhou).
- *Ao vivo*: cada resposta vira `interview.opexDraft` (`generating | ready | failed`, `kind` message/ability-scores/hit-points); nada
  vai ao entrevistador antes de `POST …/interview/draft/approve` (vazio = como está; `{content}` ou o card editado, NDJSON da fala do
  Maddox) ou `…/draft/regenerate {orientacao}`. A síntese espera `…/interview/complete`. Tela fechada = pausa ("Aguardando sua
  aprovação" no lobby). "Pedir ajuste" na síntese também vira rascunho: enquanto ele existe, o painel de aprovação toma o lugar
  do card de confirmação. Um rascunho `generating` sem execução viva (reinício) é descartado e gerado de novo. Página `/campanhas/[id]/entrevista/opex/[memberId]` (`OpexInterviewPage`, `OpexDraftPanel`), só o dono.
- Retrato: o fluxo da DND-31; "Gerar retrato de novo" do dono em `POST …/opex/[memberId]/portrait`.

**Decisões** (`server/opex-player.ts`, `server/opex-prompt.ts` puro): geração efêmera com JSON validado por Zod e uma nova tentativa,
teto `MADDOX_OPEX_GENERATION_TIMEOUT_MS`. Instruções = configuração + papel de jogador + memórias dos 3 canais + campanha + personagem
(ficha) + prompt base. Consumo: `maddox-opex-interview`, `maddox-opex-turn`, `maddox-opex-combat`.

**Mesa** (`server/opex-table.ts`): `driveOpex` roda depois de cada `publishGameChanged` (single-flight por campanha):
- turno fora do combate: em `evaluateTurn`, quando os humanos presentes terminam (com ao menos uma ação humana), o primeiro Opex
  elegível que não agiu, **na ordem de adição**, vira `turn.opexActor`; a vez entra na fila da campanha (`scheduleOpexTurn`). Até
  `MADDOX_OPEX_QUESTIONS_MAX` (3) perguntas — a resposta é gerada **no job do Opex** (`answerQuestion`, nunca um job esperando outro) —
  e depois declara ou "não faz nada" (`recordTurnAction`). Rigoroso/Fiel: declaração recusada volta com o motivo (até 2), depois
  "não fez nada". Humanos que ainda não agiram recebem 409 `OPEX_TURN`. Com "Ocultas", a transcrição do Opex não traz as declarações
  dos outros, e as dele ficam ocultas para os humanos (mesma regra da DND-36);
- testes e rolagens do Opex (`check`, iniciativa, morte, concentração, salvaguarda, dano, ataque de oportunidade): rolados
  automaticamente por `rollCheck`/`rollCombatRoll`/`rollCombatAction` (o card animado vai a todos);
- reações: o Opex escolhe entre as opções; falha = não reage (`decideReaction("none")`), sem travar;
- vez no combate tático: opções de `myCombatDto` → `submitCombatAction` → `rollCombatAction` até resolver → `endCombatTurn`; opção
  recusada volta uma vez com o motivo;
- falha do agente: fora do combate `turn.opexActor.failedAt/error`; no combate `opex.run = { failed, stage: "table" }`. A mesa espera o
  dono: `POST …/game/opex/[memberId]/retry` ou `…/skip` ("não fez nada" / `skipCombatTurn`), auditados. Remover o Opex da vez libera.
- DTO: `turn.opexActor` (`memberId`, `characterName`, `failed`, `error`, `combat`), `participant.opex`, `message.opex`, `slot.opex`,
  `journal party.opex`. Tela: `OpexChip` (lobby, lista, "Na mesa", chat, diário, ordem de iniciativa), faixa `opexBannerText`,
  `OpexFailureBanner` (dono) e o balão "<Nome> está agindo…" no chat (DND-45, abaixo).
- **Vez do Opex no chat (DND-45).** `opexActingView(state)` (`game-view.ts`) devolve o Opex da vez (`turn.opexActor` na fase
  `players`, inclusive no combate tático, com o retrato do participante) ou `null` em falha, no turno do mestre e fora do jogo.
  `GameMessageList` (prop `opexActing`) desenha um único balão `data-testid="opex-acting"` no fim da conversa, no mesmo estilo do
  "O Maddox está narrando…" (`SpeakerBubble` com retrato, nome, `OpexChip` e as bolinhas de `WritingIndicator`); ele deriva só do
  estado do jogo, então não duplica em re-render nem em reconexão. O diário (só leitura) nunca mostra o balão. A falha continua só
  na faixa e no `OpexFailureBanner`.
- **Lateral sem chip de situação para o Opex (DND-45).** Por decisão do dono, que contraria o "manter o indicador lateral" da
  especificação da DND-45, o painel "Na mesa" (`TurnPanel`) não mostra nenhum chip de situação para Personagens Opex (nem
  "Aguardando", "Agindo…", "Parado", "Declarou"…); os estados `acting`/`stuck` saíram de `seatStatus`. O "Pular" do dono continua.

**Memórias**: ver `aicontext/modules/engramind.md` › Personagens Opex.

## NPCs Opex (DND-27)

NPC importante da campanha com **agente de IA próprio** (memória no Engramind) que decide o que ele fala e faz nas narrações em que
aparece (inclusive no combate narrativo) e na vez dele no combate tático. O Maddox resolve e narra a partir da decisão.

**Consultas paralelas (DND-44).** `consultar_npc_opex` reserva a vaga do teto de consultas por narração pelo **nome pedido**, antes
da leitura do NPC, e a reserva passa para a chave do NPC quando ele é lido: chamadas do mesmo NPC no mesmo passo reaproveitam
uma consulta só, o teto segue a ordem em que o narrador pediu (não a ordem em que o banco respondeu) e o narrador do combate
enxerga a mesma decisão.

**Voltar a um turno (DND-44).** As memórias do NPC (`gravar_memoria_npc_opex`, decisões e a memória inicial da promoção) levam
`turno:<n>` e `gravado:<ms>` e acompanham a volta com o token do NPC (o do retrato de origem quando o NPC sumiu da mesa). O NPC criado
depois do turno some da mesa e do contexto; volta ao retomar e é apagado na perda definitiva, que também aposenta o agente dos NPCs
Opex que deixaram de existir. Canal sem acesso (token revogado) é ignorado.

**Dados** (`maddox_npcs.opex`): `{ active, promotedAt, promotedBy ("system:maddox" ou o dono), retiredAt, retiredReason
(maddox | owner | death), engramind }`, índice `{ campaignId, "opex.active" }`. Nada é apagado ao desfazer (`active: false`).

**Regras** (`server/opex-npcs.ts`, único lugar): `promoteOpexNpc` recusa NPC inexistente (404 `NPC_NOT_FOUND`, com a lista), morto
(409 `NPC_DEAD`), campanha `ended/archived` (409 `CAMPAIGN_CLOSED`), limite 0 (409 `OPEX_NPC_DISABLED`) e limite atingido (409
`OPEX_NPC_LIMIT`); já Opex não muda. Gravação condicional + recontagem (duas promoções simultâneas acima do limite: a última é
desfeita). Em segundo plano: provisiona o agente e grava a memória inicial (`waitForOpexNpcWork` nos testes). `retireOpexNpc` (recusa
campanha encerrada, exceto a morte) desliga a marca e aposenta o agente. `retireOpexNpcIfDead`: `save_npc { status: "dead" }` e o
fim do combate (passo "npcs" de `afterCombatEnded`). Promover ou desfazer **não cria mensagem**: só `publishGameChanged` (o chip
aparece ou some).

**Configuração** (seção Personagem Opex): modelo e instruções do Personagem Opex (`loadOpexModel`); `opexNpcLimit` (`null` = sem
limite, 0 desliga; baixar não desfaz ninguém) no mesmo Salvar; card "Memórias globais dos NPCs Opex" à parte.

**Ferramentas do Maddox** (`master-tools.ts`, AI SDK e MCP `dndicas-maddox`): `promover_npc_opex {npc}`, `desfazer_npc_opex {npc}`,
`gravar_memoria_npc_opex {npc, titulo, texto}` (canal do NPC, sem acionar o agente; vale na próxima consulta) e
`consultar_npc_opex {npc, situacao, pergunta?}` — só nas narrações (na resposta a perguntas recusa e a AI SDK nem a oferece;
`buildMaddoxAiTools({ opexNpcs })`). A consulta (`decideOpexNpcScene`, JSON `{fala, acao, memorias}`, uma tentativa,
`MADDOX_OPEX_NPC_TIMEOUT_MS`) reaproveita a decisão do mesmo NPC no job (a promessa em andamento fica no job antes do primeiro `await`, então chamadas paralelas
do mesmo passo também reaproveitam e a vaga no teto é reservada na hora) e tem teto `MADDOX_OPEX_NPC_CONSULTS_PER_NARRATION`. Falha
(provedor, tempo, JSON inválido) devolve `{ falhou: true, nota }` sem o motivo e registra `addDraftOpexNpcFailure` no job.
Prompt do narrador: `[NPC Opex]` no bloco dos NPCs e a seção "NPCs Opex" na tarefa das narrações (`opexNpcsTaskSection`).

**Agente** (`opex-prompt.ts`, `opex-player.ts`): instruções da seção Personagem Opex + `MADDOX_OPEX_NPC_ROLE_RULE` (papel de NPC) +
regra de memórias + memórias dos 2 canais + campanha + nome e descrição pública (as notas do mestre só pela memória inicial).
Consumo: `maddox-opex-npc` e `maddox-opex-npc-combat`.

**Combate tático**: no bloco `npc` não retomado de um combatente ligado a NPC Opex vivo, `consultTacticalOpexNpc` (`narrator.ts`)
consulta o agente antes da geração com as ações da ficha (`stats.actions`, Ataques Múltiplos) e as genéricas (Disparada, Esquivar,
Desengajar, Fugir), os alvos com a faixa de PV e a situação; `opexNpcCombatSchema` só aceita ação entre as opções (duas
tentativas). A decisão vai em `block.opexDecision` → linha "O NPC Opex {nome} decidiu: …" da tarefa. Falha = o Maddox decide como
antes; nada fica pendente no banco, e a falha também fica no cache do job (`consultar_npc_opex` para o mesmo NPC na mesma geração
devolve a falha sem tentar de novo). No bloco `npc`, a seção "NPCs Opex" sai da tarefa (o servidor já consultou). Aliados e adversários seguem a mesma regra.

**Linha de falha**: `runMasterTurn` grava `takeDraftOpexNpcFailures` na própria narração (`opexNpcFailures: [{ npcId, npcName,
error }]`). `messagesDto` só serializa `opexNpcFailures: [{ npcName, reason }]` para o dono (`MessagesViewer.isOwner`), no estado da
mesa e no histórico, e só as de NPCs que os jogadores conhecem (visibilidade lida na hora: a de um NPC só do mestre aparece quando
ele fica conhecido); `OpexNpcFailureLine` desenha "O NPC Opex {nome} não respondeu; o Maddox decidiu por ele nesta narração." e o
motivo. O motivo completo vai também ao log.

**Dono**: `POST`/`DELETE /api/maddox/campaigns/[id]/npcs/[npcId]/opex` (`maddox.play` + `maddox.opex`; 403 "Você não tem permissão
para cuidar de NPCs Opex."), `promoteOpexNpcAsOwner`/`retireOpexNpcAsOwner`: quem não participa 404, jogador 403, NPC só do mestre
404; auditadas (`{ npcOpex, nome, acao }`); devolvem o estado da mesa. `canManageOpexNpcs` (estado da mesa e resumo do Diário) =
dono com `maddox.opex`, pelas permissões da requisição (`optionalAccess`, respeita "Visualizar como"; fora de requisição, `false`).

**DTOs e telas**: `opex` em `MaddoxGameNpcDto`/`MaddoxJournalNpcDto` (as listas já são só de NPCs conhecidos), nos combatentes do
card de combate, no slot da iniciativa e no autor do card de ação (`knownOpexNpcIds`: Opex **e** conhecido). `NpcPanel` e
`JournalNpcList` mostram o `OpexChip` e, com `canManageOpexNpcs`, `OpexNpcActions` (confirmações "Promover {nome} a NPC Opex?" /
"Remover Opex de {nome}?", botões "Promover"/"Remover Opex" e "Cancelar"; NPC morto não tem "Promover"). Hook
`useMaddoxOpexNpcActions`.

**Memórias**: ver `aicontext/modules/engramind.md` › NPCs Opex.

## Parcelas das rolagens (DND-47)

Toda rolagem do Maddox leva as parcelas nomeadas do modificador dentro do próprio `roll` (`DiceRollResponse.modifierParts`), então o card gravado, o replay do stream (`combat-rolled`, `live-roll`) e a recarga mostram a mesma conta no tooltip do total (`DiceResultTooltip`, ver `dice-roller.md` › "Tooltip com a conta da rolagem"). O motor alinha a soma ao modificador da expressão (`alignModifierParts`): a conta sempre fecha no total do servidor. Helpers em `src/features/maddox/roll-parts.ts`.

| Rolagem | Parcelas |
|---|---|
| Teste pedido pelo Maddox (`game-checks.ts`) | `partsFromCalc(checkModifier(...).parts)` (atributo, Prof., especialização); rolagens antigas sem parcelas usam `check.modifierParts` no card |
| Ataque com arma do personagem | `attack.bonusParts` da opção (`combat-options.ts`: atributo usado — Força, Destreza ou o maior na Acuidade — e "Proficiência") + "Exaustão" |
| Dano da arma | `attack.damageParts` (o atributo; na outra mão, só se negativo) |
| Ataque desarmado | Força + Proficiência |
| Ataque mágico | atributo de conjuração + Proficiência + "Bônus mágico" (o que sobrar de `spellAttackBonus`) |
| Cura de magia | atributo de conjuração (`heal.parts`) |
| Opção alterada pela preparação (`applyCombatPrep`) | as parcelas da lista base + "Ajuste da preparação do Maddox" com a diferença do bônus/dano |
| Teste de perícia no combate | partes de `sheetSkill` + Exaustão |
| Iniciativa do personagem | partes de `sheet.initiative` (gravadas no `combatRoll.modifierParts` pendente) |
| Concentração | partes de `sheetSave(constituição)`; sem ficha, "Salvaguarda de Constituição" |
| Salvaguarda de personagem pedida pelo adversário | "Salvaguarda de <Atributo>" |
| Ataque / dano / salvaguarda / iniciativa de adversário | "Bônus de ataque" / "Modificador de dano" / "Salvaguarda de <Atributo>" / "Iniciativa" |
| Dano ou cura livres do Maddox (`apply_effect`, dano pedido) | "Modificador de dano" / "Modificador de cura" |
| PV por nível na entrevista | "Constituição" |

Os passos guardam as parcelas em `CombatActionStep.modifierParts` e as rolagens avulsas em `IMaddoxCombatRoll.modifierParts` (campos `Mixed`, sem migração); `rollExpression(expr, { modifierParts })` as repassa ao motor. Dano crítico e ataque furtivo só acrescentam dados: as parcelas não mudam.

## Reiniciar campanha (DND-50)

Código: `server/campaign-reset.ts` (operação, limpeza, retomada, memórias pendentes), `server/sheet-restore.ts` (ajuste da
ficha pelo Maddox, "Tentar de novo", bloqueio do início), `server/sheet-restore-ai.ts` (chamada de IA, mockada inteira nos
testes), `sheet-restore-schemas.ts` (lista fechada), `server/turn-snapshots.ts` (`captureStartCopy`, `addToStartCopy`,
`restoreSheets`), `server/game-live.ts` (`cancelCampaignJobs`) e `src/features/engramind/server/campaign-rewind.ts`
(`purgeCampaignMemories`). API: `POST /api/maddox/campaigns/[id]/reset` e `POST …/reset/sheets/[characterId]` ("Tentar de
novo"), ambas com `maddox.play` + dono (403 no serviço). **Sem chave nova no Perfix.**

Na tela da campanha, o **dono** vê **"Reiniciar campanha"** ao lado de "Editar" quando a campanha está **Ativa, Pausada,
Encerrada ou Arquivada** (`canReset` no detalhe; nunca no lobby, na entrevista nem na mesa). O diálogo: título **"Reiniciar
campanha?"**, corpo **"A história jogada, o diário, os NPCs, os combates, as imagens de cena e as memórias da campanha serão
apagados. Os personagens voltam à ficha do fim da entrevista. Membros, cenário e configurações são mantidos. Essa ação não pode
ser desfeita."**, botões "Cancelar" e "Reiniciar campanha" (textos em `MADDOX_RESET_TEXTS`).

| Item | Depois do reinício |
| --- | --- |
| Nome, rigor, capa, densidade, dificuldade de combate, imagens de cena (configuração), mostrar CD, ocultar declarações | Preservado |
| Cenário, situação inicial, entrevista de cenário, mundo, nível/estágio iniciais, versões de roteiro | Preservado |
| Membros e link de convite | Preservado (quem saiu ou foi removido continua fora) |
| Personagens Opex, perfil, retrato e entrevista dos personagens | Preservados (os Opex seguem com o agente; só a execução da mesa, `opex.run` de `stage: "table"`, volta a `idle`) |
| Ficha | Volta à do fim da entrevista (abaixo) |
| `currentState`, `currentStatePublic`, `status` do personagem | `""`, `false`, **`active`** (também para mortos, aposentados e inativos) |
| Mensagens (Diário), estado da história, turno, volta pendente, `memoryRepair` | Apagados / zerados (turno 0, fase do mestre, sem travas; `startedAt: null`) |
| NPCs, combates, `maddox_combat_preps`, retratos de turno e de origem, `maddox_memory_repairs`, `engramind_pending_writes` | Apagados (a cópia `start` fica) |
| Imagens de cena e retratos de NPC | Viram registros sem arquivo (`slot: "discarded"`, `url`/`key` nulos, `discardedBy.rewindId = "reset:<id>"`): somem da tela e do S3, mas **seguem no teto diário** |
| Memórias no Engramind | Excluídas nos canais Jogadores e Mestre e nos canais individuais dos Personagens e NPCs Opex; depois, os agentes dos NPCs Opex apagados são aposentados |
| Sessão do narrador no OpenCode | Trocada (`rotateNarratorSession`): a próxima partida começa com sessão nova |

**Fluxo.** O serviço decide a origem das fichas antes de apagar qualquer coisa, troca a campanha para `lobby` num
`updateOne` condicional (com `reset { id, status: "cleaning", previousStatus, byUserId, memories: "pending", npcTokenBoxes }`,
turno e estado zerados) — o motor só anda com `status: "active"`, então nenhuma ação nova é aceita a partir daí —, interrompe
a mesa (`cancelCampaignJobs`: aborta o sinal do job em andamento, que deixa de ser job ativo — o token de turno do MCP e as
ferramentas param de valer, e `runMaddoxTool` recusa gravações de um job interrompido —, descarta os jobs que esperavam a vez e
encerra as gerações ao vivo com `live-end`; `cancelCampaignTimers`; espera até 5 s as execuções vivas dos Personagens Opex) e
roda a limpeza na fila da campanha, depois do job interrompido: a fila só libera a vaga quando o job interrompido termina
(o que ele ainda gravava sai na limpeza), com folga de teto `MADDOX_JOB_ABORT_GRACE_MS` (15 s, aviso no log) para um job que
ignore o sinal. A narração e a resposta interrompidas não gravam nada (`withGenerationTimeout` corre contra o sinal do job e
confere `isActiveMaddoxJob` antes de gravar); a decisão do Personagem Opex recebe o mesmo sinal (`decideOpex({ signal })`) e
para na hora, sem declaração, pergunta, memória nem falha registrada. Campanha **arquivada**
restaura os canais das memórias antes de apagar os NPCs. No fim: `reset.status: "done"`, auditoria `CampanhaMaddox`
(`depois: { reset: "lobby", fichas: { <personagem>: "copia" | "maddox" | "sem-ficha" } }`), aviso `maddox.campaign.changed`
a todos os membros e `notifyJournalChanged`.

**Idempotência e falhas.** Repetir o reinício com a campanha já no lobby não dá erro: refaz a limpeza que não terminou
(`reset.status: "cleaning"`; a leitura do detalhe também a retoma em segundo plano depois de um reinício do processo) ou só as
memórias pendentes. Com o Engramind fora, a campanha fica no lobby (`reset.memories: "pending"`, `lastError` só no banco e no
log); a rotina de sincronização das memórias (`processPendingResetPurges`) e o próximo reinício tentam de novo, e **"Iniciar
campanha" tenta de novo e recusa** com 409 `ENGRAMIND_UNAVAILABLE` **"A rede de memórias está indisponível: as memórias da
partida anterior ainda não foram apagadas. Tente de novo em instantes."** enquanto não conseguir (assim nada da partida antiga
entra na nova). Durante a limpeza, o início responde 409 `RESET_IN_PROGRESS` "O reinício da campanha ainda está em andamento.".
Recusas do reinício: jogador 403 "Só o dono da campanha pode reiniciá-la.", quem não participa 404, lobby/entrevista nunca
iniciada 409 `CAMPAIGN_NOT_STARTED` "A campanha ainda não começou: não há o que reiniciar.".

**Mesa aberta.** O estado da mesa traz `resetAt` quando a campanha saiu de `active` por um reinício: a mesa redireciona para
`/campanhas/[id]?aviso=reiniciada` e a tela da campanha mostra **"O dono reiniciou a campanha."** uma vez (o parâmetro sai da
URL). Sem tempo real, a próxima ação da mesa recebe 409 `CAMPAIGN_NOT_ACTIVE`, a leitura é refeita e o redirecionamento acontece.

### Restauração da ficha

| Fonte | Quando | Como |
| --- | --- | --- |
| 1. Cópia do início | "Iniciar campanha" guarda a ficha de cada personagem com entrevista concluída (`captureStartCopy`, snapshot `kind: "start"`, substituída a cada início e **preservada** no reinício). Quem conclui a entrevista com a campanha já iniciada entra na cópia (`addToStartCopy` em `completeCharacter`) | `restoreSheets` repõe a ficha com itens, ataques, traços, talentos e magias; `photo` fica com o `portraitUrl` atual do personagem |
| 2. Retrato do 1º turno | Campanhas iniciadas antes do DND-50 (sem a ficha na cópia) | A ficha do retrato do turno 1 entra na cópia do início **antes** da limpeza (repetir o reinício encontra a mesma origem) e é reposta como na fonte 1 |
| 3. Ajuste pelo Maddox | Sem cópia e sem retrato | O personagem fica com `sheetRestore { resetId, status: "pending" }` e um ajuste roda em segundo plano (`runOpexOnce("sheet-restore:<id>")`): o servidor calcula a ficha da entrevista **sem gravar** (`computeCharacterSheet`, o mesmo construtor da conclusão), o Maddox (modelo do narrador no grau) compara com a atual e devolve só a lista fechada `sheetRestoreChangeSchema` — `field` (o campo volta ao valor da referência), `remove` (registro atual pelo `id`) e `restore` (registro da referência pelo `ref`); **os valores vêm sempre da referência**. Alteração inválida, `id`/`ref` desconhecido ou campo sem valor é descartada; cada aplicada é auditada (`FichaPersonagem`, `origin: "campaign-reset"`) e avisa a ficha aberta |

Enquanto houver ajuste `pending`, "Iniciar campanha" fica desabilitado com a dica **"O Maddox está ajustando as fichas."** (e o
servidor responde 409 `SHEETS_ADJUSTING` com o mesmo texto, para outra aba). Se o ajuste de um personagem falhar, a ficha dele
fica como estava, o início é liberado para ele e **só o dono** vê o aviso **"O Maddox não conseguiu ajustar a ficha de
<personagem>. A ficha ficou como estava."** com **"Tentar de novo"**, que refaz só esse personagem. O motivo técnico fica no log
e no banco, nunca no DTO. Ajuste `pending` sem execução viva é retomado na leitura do detalhe; preso há mais de
`MADDOX_SHEET_RESTORE_STALE_MS` (10 min), vira falha. Personagem sem ficha (graus narrativos) só tem condição e status zerados.

**Escolhas da entrevista (DND-51).** O ajuste nunca remove o que a entrevista registrou (`interviewProtectionOf`,
`choseInInterview`):
- pelo nome exato: as escolhas do `build` (truques, magias, `extraSpells`, talentos, estilo de luta) e os registros da referência
  (magias e ataques — inclusive o ataque comum da arma da entrevista);
- pelo texto, para entrevistas antigas: magias, talentos, características e o ataque automático de um truque
  (`notes: "auto:spell:<id>"`) citados nas falas do **jogador**, na síntese final do Maddox (`proposal`) ou nos textos de
  características da referência. As opções que o Maddox listou no meio da conversa não protegem nada.

Também nunca troca o atributo de conjuração por "nenhum" quando a referência não o registra. O caso que motivou a regra: a entrevista de uma Ladina
yuan-ti com Iniciado em Magia não conseguia gravar as magias (só as de classe eram aceitas), a ficha as recebeu depois e o ajuste
as apagou por "não constar na referência".

## Pergunte ao mestre corrige a campanha (DND-51)

O "Pergunte ao mestre" é o canal de correção: nos graus com ficha, a resposta à pergunta recebe as ferramentas de leitura e
correção da ficha (`MADDOX_SHEET_FIX_TOOL_NAMES`, em `MADDOX_SHEET_FIX_TOOLS` de `server/master-tools.ts`, implementadas em
`server/question-sheet-tools.ts`) e as regras fixas `MADDOX_SHEET_FIX_TASK_RULES` na tarefa (`narrator-prompt.ts`):

| Ferramenta | O que faz |
| --- | --- |
| `get_character_sheet` | A ficha inteira com os ids (o mesmo texto da preparação, `loadPrepSheet`) e as opções de combate que ela gera |
| `get_character_interview` | As escolhas gravadas na entrevista (`buildSummary`, com `magiasExtras` e `atributoConjuracao`), as falas do jogador e a síntese final |
| `update_character_sheet` | A lista fechada `combatSheetChangeSchema` (atributos, atributo de conjuração, espaços, cargas, ataques, características e talentos — incluir, corrigir e remover —, magias — `spell-add` pelo catálogo, com o ataque do truque, `spell-update`, `spell-remove` —, itens — `item-add`, `item-equip`, `item-quantity`, `item-remove` —, maestria e anotações), sem limite de alterações por chamada |
| `update_character_hit_points` | PV (`origin: "question"`, auditado com `requestedBy`). No combate tático, só pelo dono da campanha (`ownerRequest`); o jogador comum recebe a mesma recusa do narrador |
| `update_character_state` / `apply_effect` | Condição na história e efeitos no combate |

- **Execução da pergunta** (`server/question-runs.ts`): `aiMaddoxMaster.answer` abre `openQuestionRun` para o job da resposta (fechado
  no fim). As ferramentas só funcionam dentro dele. Quem perguntou corrige só o próprio personagem; o dono da campanha corrige
  qualquer um. A auditoria (`FichaPersonagem`, `origin: "question"`) fica em nome de quem perguntou (`requestedBy`). A ficha aberta é
  avisada em tempo real (`CharacterSheetPusherService`) e a mesa ganha a linha pública `kind: "sheet-change"` ("Ficha de X
  corrigida:" e uma linha por alteração, com o motivo; `SheetChangeLine`), que entra na transcrição do narrador como `[ficha]`.
- **Limites do jogador comum** (`withPlayerLimits`; o dono faz tudo): acrescentar item ou aumentar a quantidade só até o
  equipamento da entrevista (itens ganhos entram pela narração). Com `catalogItemId`, vale o item gravado (id e nome do catálogo,
  nunca o `name` do modelo); sem catálogo, a quantidade atual soma as linhas da ficha com o mesmo nome. `item-add` de item fora
  do catálogo que a ficha já tem (`sameItemName`) aumenta a quantidade em vez de criar outra linha; tirar característica ou talento só com a fonte do catálogo.
  Diminuir quantidade, remover ou equipar item e as demais correções seguem com as travas de fonte e de escolha.
- **Fonte do catálogo**: as leituras do catálogo do job entram no registro `job:<jobId>` (AI SDK pelos hooks de
  `buildCatalogAiTools`; OpenCode pelo token de turno em `handleCatalog`). Correção de regra sem fonte lida é recusada, como na
  preparação.
- **Escolha do jogador** (`player-choice.ts`, `server/sheet-choice-rules.ts`): o atributo de conjuração de uma regra com lista
  ("Inteligência, Sabedoria ou Carisma", `offersCastingAttributeChoice` no texto da fonte lida) e a magia escolhida de uma lista
  (a regra não a nomeia, `ruleNamesSpell`) só passam com `choice.quote`. Esse trecho precisa estar numa mensagem do jogador (a
  conversa da pergunta ou as falas dele na entrevista) e citar o valor gravado. Com a ficha sem atributo de conjuração, qualquer
  `spellcasting-attribute` é escolha do jogador, seja qual for a fonte citada. Sem o trecho, a alteração é recusada com
  `faltaEscolhaDoJogador` e a orientação de perguntar. Vale também na preparação do combate e no "Pedir ajuste". Magia nomeada
  pela regra ("Você sabe Rajada de Veneno") não é escolha.
- **Ida e volta**: uma nova pergunta do mesmo jogador no mesmo turno responde automaticamente à última resposta do Maddox a ele
  (`replyToId`, `lastAnswerTo` em `game.ts`). A tarefa da resposta leva a conversa (`questionThread`, até 12 mensagens). Nada disso
  gasta a Ação, fecha o turno ou repete o cabeçalho do turno (perguntas e respostas não abrem divisor).

**Preparação do combate pergunta.** A resposta da revisão pode trazer `question: { text }`. Se o Maddox propõe uma escolha do
jogador sem a escolha dele, o servidor faz a pergunta (`fallbackQuestion`). Nesse caso, nada é gravado: a preparação vai para
`awaiting-player` (segura a ordem como `BLOCKING`; selo **"Pergunta ao jogador"**) e o card privado `combat-prep` mostra a pergunta,
o campo de resposta e o prazo (`CombatPrepQuestionCard`). Respondida ou vencida, enquanto a preparação roda de novo, o card mostra
"Resposta enviada" ou "Prazo encerrado" (`question.settled: false`); só com a preparação pronta ele diz "Sua mesa está pronta". O
prazo vencido tira o campo de resposta do card na hora. Se a preparação parar sem concluir, o card fica num estado final, sem
spinner e sem o campo (`question.halted`): `discarded` quando o combate termina ou o personagem sai (`discard`,
`discardCombatPreps`, `discardMemberPrep`) e `failed` quando a execução falha. "Tentar de novo" volta o card a "concluindo"; "Seguir sem preparação" o encerra (`halted: null`, `settled: true`). A resposta chega por `POST
/api/maddox/campaigns/[id]/game/combat/preps/[prepId]/answer` (`{ text }`; responde o dono do personagem e, pelo Personagem Opex, o
dono da campanha; auditada). A preparação volta para a fila com a resposta no prompt e sem nova pergunta. Sem resposta em
`MADDOX_COMBAT_PREP_ANSWER_TIMEOUT_MS` (3 min; testes mudam `combatPrepTiming.answerMs`), a preparação conclui sem a escolha (o
campo continua vazio) e o card avisa `MADDOX_COMBAT_PREP_EXPIRED_NOTICE`. Depois de um reinício do processo, o prazo vencido é
conferido em `scheduleCombatPreps`.

**Entrevista grava as magias da espécie e dos talentos.** `update_character_build` aceita `magiasExtras` (`[{ fonte, magia }]`,
fonte = a espécie ou um talento do personagem; gravadas em `build.extraSpells`) e `atributoConjuracao` (a escolha do jogador, em
`build.spellcastingAttribute`). O `faltando` cobra as magias da espécie e dos talentos que concedem magia e, havendo magia extra sem
atributo da classe, o atributo de conjuração. A detecção usa só termos de magia (truque, magia, círculo, feitiço); espécie ou
talento que o texto faz parecer conceder magia sem conceder é declarado em `semMagiasExtras` (`build.noExtraSpellSources`). A ficha (`computeCharacterSheet`) recebe essas magias, o ataque dos truques com dano
e o atributo escolhido quando a classe não conjura.

Testes: `question-sheet-fix.test.ts` (o pedido do relato aplicado e refletido nas opções de Ação, a recusa sem a escolha, a fonte,
quem corrige quem, a leitura e a conversa), `player-choice.test.ts` (parte pura e operações novas), o bloco DND-51 de
`tactical-combat.test.ts` (pergunta, resposta e prazo), de `game.test.ts` (conversa), de `interview-character-build.test.ts`
(magias extras e atributo) e de `sheet-restore.test.ts` (o reinício mantém as escolhas) e, na tela, o bloco DND-51 de
`maddox-combat-prep.test.tsx`.

## Borda premium e narração escrita uma vez (DND-52)

**Botão.** `AskMasterButton` (`components/game/composer-buttons.tsx`) tem o tratamento dos botões premium de IA, igual ao
"Entender com IA" (`EntityAIUnderstandButton`): `motion.button` com o anel gradiente `from-blue-500/20 via-purple-500/20
to-blue-500/20 bg-[length:200%_auto] animate-gradient` em `p-[1.5px]`, miolo em vidro escuro (`bg-black/40 backdrop-blur-[4px]`,
`group-hover:bg-slate-900/40`), ícone `HelpCircle` (mantido por decisão do dono) `text-blue-400` → `group-hover:text-white`,
`whileHover` 1.08 / `whileTap` 0.94 e `focus:ring-2 focus:ring-blue-500/40`. Mesmo diâmetro dos outros botões (`h-8 w-8
rounded-full`, miolo `rounded-full`). Desabilitado: `opacity-50`, sem ponteiro, sem animação e sem escala; com
`prefers-reduced-motion`: `motion-reduce:animate-none` (anel parado) e sem escala (`useReducedMotion`). O tutorial da campanha
(`TableTutorialCard`) usa o mesmo componente.

**Causa da narração duplicada.** A investigação (campanha `6af1283c9fab85d05645fff7`) mostrou que o texto já era **gravado**
duplicado e que cada caso vinha de **uma única geração** (um só registro em `ai_consumption_logs`, sem `failedAt`, `segment` 0),
pelo AI SDK (`opencode-go`): o modelo escrevia a cena, chamava ferramentas (`update_campaign_state` e outras, que o prompt pedia
"antes de concluir" e "no fim") e reescrevia tudo na etapa seguinte; `generateWithTools` somava as etapas com `\n\n`. Não era
nova tentativa, sessão do OpenCode, continuação nem a tela.

**Correção no prompt (escrita única).** `MADDOX_WRITE_ONCE_RULE` (no `MADDOX_NARRATOR_FORMAT`, nos dois modos e nas respostas):
chamar primeiro todas as ferramentas e escrever o texto **uma única vez**, sem texto antes nem entre as chamadas, nunca repetindo
nem reescrevendo. Por decisão do dono, o modelo não reescreve, pois a reescrita dobra os tokens de saída. A `MADDOX_PERSISTENCE_RULE` agora diz "Antes de
escrever a narração, grave o que mudou" e "Grave antes de escrever a narração, nunca no meio nem depois dela"; `suggest_actions`,
`update_campaign_state` e `request_check` pedem a chamada antes do texto nas próprias descrições.

**Defesa no servidor.** `dropRewrittenParagraphs` (`narration-dedupe.ts`, puro) compara os parágrafos (sem marcação `{{Tipo:Nome}}`,
menções, caixa e pontuação) pelo coeficiente de Dice sobre pares de palavras: com semelhança ≥ `MADDOX_REWRITE_SIMILARITY` (0,5)
ou igualdade depois de normalizar, o parágrafo `j` é a reescrita do `i`. Parágrafos com menos de `MADDOX_REWRITE_MIN_PAIRS` (6)
pares de palavras nunca contam, nem iguais: falas e pausas curtas ("— Corram!", "Silêncio.") se repetem de propósito e o
conteúdo novo entre elas fica; saem os
parágrafos de `i` até `j - 1` (a primeira versão e o que veio entre as duas) e fica a versão escrita depois das ferramentas. Repete
até não sobrar repetição. Nos textos reais, as reescritas mediram de 0,61 a 1,00 e parágrafos distintos até 0,25. `generate`
(`server/narrator.ts`) aplica a defesa ao texto final nos dois caminhos (AI SDK e OpenCode), em narrações, continuações e
respostas, antes de resolver as menções; quando algo sai, registra `warn` "[maddox] narração reescrita depois das ferramentas:
primeira versão descartada" com `campaignId`, `turnNumber`, `kind` e `dropped` (sem o texto).

**Tela ao vivo.** `liveText` roda a mesma defesa sobre o texto visível a cada trecho com quebra de linha, só nos parágrafos já
fechados (`splitOpenParagraph`: o trecho depois da última quebra de parágrafo, ainda em escrita, nunca é comparado, porque pode ser
o começo igual de um parágrafo anterior), e no fim sobre o texto inteiro; se algo sai,
chama `sink.replace(texto)` (`MaddoxMasterSink.replace`, opcional; `LiveSink.replace` em `game-live.ts`), que troca o `live.text`
(também no `snapshot` de quem reconecta) e emite `live-text { liveId, text }`. `reduceGameStream` troca o texto do item, e o
`settled` herda o texto corrigido: a bolha ao vivo termina igual à mensagem gravada. A quebra de parágrafo no fim do texto é
mantida, para os próximos trechos seguirem no parágrafo novo.

**Falha no meio.** Inalterado: o texto parcial de uma geração que falha nunca é gravado (`live-end` com `error` tira a bolha), e a
nova tentativa depois de `MADDOX_MASTER_RETRY_MS` começa do zero.

Mensagens já gravadas com duplicação não são corrigidas (a defesa vale para as novas).

Testes: `narration-dedupe.test.ts` (os 7 textos reais duplicados de `fixtures/narration-rewrites.ts`, narrações legítimas
intactas, bloco repetido, continuação, frases curtas parecidas e iguais com cena nova no meio, parágrafo em escrita, marcação e
quebra final), `narrator-rewrite.test.ts` (narrador real sobre
`streamText` roteirizado: reescrita depois de `update_campaign_state` grava só a reescrita e a tela converge via `live-text`;
continuação legítima inteira; bloco entregue duas vezes; falha com texto parcial e nova tentativa; 10 narrações seguidas com uma
falha no meio sem parágrafo repetido; parágrafo em escrita igual ao começo de um anterior e falas curtas repetidas sem `live-text`
nem corte; instruções com a escrita única), `narrator-prompt.test.ts` (regras novas nos dois modos e a
linha do `suggest_actions`), `maddox-game-stream.test.ts` (`live-text`) e, na tela, `ask-master-button.test.tsx` (anel, miolo,
movimento reduzido, desabilitado, clique e os outros botões sem anel).

## Avatares: popover e retrato grande (DND-55)

Todo avatar do módulo — jogador, Personagem Opex, NPC (inclusive NPC Opex) e o próprio Maddox — passa por `MemberAvatar`
(`components/campaigns/campaign-visuals.tsx`), que monta `MemberPortraitAvatar` (`components/campaigns/member-portrait.tsx`).
Vale em toda a mesa (diário do chat, cards de ação, rolagem e teste, iniciativa, "Na mesa", "NPCs conhecidos"), no Diário (NPCs,
grupo, busca), nas entrevistas, na página da campanha, no perfil do personagem e na lista de campanhas.

| Interação | Comportamento |
|---|---|
| Hover (só ponteiro `mouse`) | Abre o popover depois de `MADDOX_PORTRAIT_HOVER_OPEN_MS` (200 ms); retrato de ~176 px (`object-cover`) em vidro, borda na `color` do avatar, nome e a linha de contexto. Fecha `MADDOX_PORTRAIT_HOVER_CLOSE_MS` (150 ms) depois que o ponteiro sai do avatar **e** do popover — dois sinais de presença separados (`portrait-hover.ts`, decisão pura), então ir do avatar ao popover não fecha. Também fecha ao rolar qualquer contêiner, com Esc e ao abrir o retrato grande. Radix Popover (`side="right"`, vira perto das bordas, `collisionPadding` 8, largura `min(14rem, 100vw − 16px)`, `z-[100]`), montado só aberto e sem roubar o foco |
| Clique, toque, Enter/Espaço | O avatar é um `<button>` nativo (`aria-label="Ver retrato de <nome>"`, `aria-haspopup="dialog"`); o clique faz `preventDefault` + `stopPropagation` e abre o retrato grande: diálogo Radix escuro, imagem `w-[min(90vw,90vh)]` em `object-contain`, nome e contexto abaixo. Fecha com X ("Fechar retrato"), Esc, Enter e clique fora; o foco fica preso no diálogo e volta ao avatar. Eventos do portal não sobem pela árvore do React até o pai |
| Sem retrato (ou imagem que não carrega) | Popover e retrato grande mostram as iniciais grandes na cor do avatar e "Sem retrato" — nunca vazio |
| Toque | Não há hover: o toque abre direto o retrato grande |

**Contrato do `MemberAvatar`:** `className` (tamanho, margens, `grayscale` do NPC morto) vai para o botão, então o avatar ocupa o
mesmo lugar de antes; `context` é a linha "quem é"; `interactive={false}` devolve o avatar estático (sem botão). Os rótulos ficam em
`constants.ts`: `MADDOX_AVATAR_CONTEXT` ("Mestre da mesa", "Personagem", "Seu personagem", "Personagem Opex", "NPC", "NPC Opex",
"Dono", "Jogador"), `npcAvatarContext(status, opex)` ("NPC · Morto"), `messageAvatarContext({ opex, mine })` (falas, ações, rolagens
e testes da mesa) e `memberAvatarContext({ opex, role, playerName })` ("Jogador · Ana", lobby, "Na mesa" e lista).

**Nunca dentro de link ou de outro botão.** Por ser um botão, o avatar não fica aninhado em navegação: no painel "NPCs conhecidos"
ele é irmão do link do diário; na busca do Diário fica numa camada `absolute` sobre a linha (o link ganha `pl-[3.125rem]`); no card
da lista de campanhas o link "Abrir a campanha …" é esticado (`absolute inset-0`, anel de foco no card por `has-[…:focus-visible]`),
o conteúdo é `pointer-events-none` e os avatares ficam `pointer-events-auto` numa camada acima. No perfil do personagem (`CharacterProfileDialog`) o avatar fica
ao lado do `GlassModalTitle`, fora dele, para o nome do diálogo ser só o do personagem. Ao pôr um avatar novo dentro de algo
clicável ou de um título, use o mesmo padrão. Fora do Maddox, `UserMini` já abre a foto pelo `GlassImage`; nenhuma outra tela do módulo usa avatar
de fora.

Testes: `tests/frontend/maddox/portrait-hover.test.ts` (a decisão do hover, inclusive entrar no popover antes de sair do avatar) e
`maddox-member-avatar.test.tsx` (textos literais de `messageAvatarContext`/`memberAvatarContext`/`npcAvatarContext`, contexto ao passar
o mouse no `TurnPanel` e no chat da mesa, nome do diálogo do perfil, hover por papel, atraso, tolerância, rolagem, toque, clique, as quatro formas de fechar, teclado,
sem retrato e imagem quebrada, propagação bloqueada, `className`, painel de NPCs e busca do Diário fora do link); o card da lista em
`maddox-campaigns.test.tsx`.


## Progressão de nível (DND-56)

Graus com ficha (`MADDOX_SHEET_RIGORS`) escolhem na criação o modo `progression.mode`: **Marco** (padrão; campanhas antigas sem o campo também) ou **Experiência**. No Editar campanha o modo aparece só para leitura (`ProgressionModeField`). Estado no documento da campanha: `progression.declared[]` (níveis declarados, com motivo, gatilho e `offMilestone`), `progression.pendingMilestone` (marco positivo ainda não declarado, vira orientação da próxima narração), `levelUps[]` (uma subida por personagem e nível: `pending`/`deciding`/`waiting-combat`/`failed`/`done`, com `gains`) e `chapters[]`. Serviço central: `server/level-ups.ts`.

- **Ferramentas do mestre** (`master-tools.ts`, execução em `server/progression-actions.ts`): `declare_level_up` (só narração e modo Marco; grupo inteiro vai para maior nível + 1, iguala quem está abaixo; recusa durante combate tático, acima do 20, já declarada), `end_chapter` (todos os graus; no grau com ficha, roda a decisão do marco), `grant_experience` (só modo Experiência, sem teto), `evaluate_level_milestone` (só no "Pergunte ao mestre"; positiva aciona a subida, negativa explica). O que a geração pede fica no rascunho do job (`MaddoxDraftProgression` em `game-live.ts`) e é gravado por `commitProgression` depois da fala (narração e resposta).
- **Decisão do marco** (`server/level-milestone.ts`): com a chave JEV `level-milestone` ligada nas configurações, o JEV decide (cenário, personagens ativos, nível do grupo, acontecimento); senão, ou se o JEV falha, uma geração curta do narrador (`level-up-ai.ts`). Gatilhos: fim de combate (`afterCombatEnded`), missão concluída, capítulo encerrado, "Avaliar marco".
- **Experiência**: XP dos monstros do combate tático pelo ND (`XP_BY_CR`, `server/combat-experience.ts`, uma vez por combate: `experienceGranted`), dividida entre os personagens que participaram; desfechos que contam: morto, derrotado, capturado, rendeu-se, fugiu, poupado. Cada limiar cruzado gera uma subida (acumuladas em ordem); durante combate tático ficam `waiting-combat` até `releaseCombatLevelUps` no fim.
- **Chat**: cards `level-up` (status por personagem, ao vivo pelo estado da mesa; o que cada um ganhou), `experience` e `chapter` (`ProgressionCards.tsx`). O jogador vê o aviso "Subir de nível" no cabeçalho da mesa e o wizard abre sozinho uma vez (`GameLevelUps.tsx`); a subida não segura turno nenhum. `state.me.levelUps` traz as do próprio personagem e, para o dono, as de Personagens Opex com falha (motivo só para o dono).
- **Personagem Opex** (`server/level-up-opex.ts`): o Opex decide as escolhas (`decideOpex`, com as opções do motor no prompt) e o servidor aplica sem clique; uma nova tentativa; depois disso, `failed` e o dono conclui no wizard da ficha do Opex.
- **Diário**: aba Capítulos (`GET …/journal/chapters`) e capítulos na busca. Reinício (`campaign-reset.ts`) zera a progressão; voltar a um turno restaura `progression`/`levelUps`/`chapters` pelo retrato do turno.
- A ficha de campanha só sobe com a subida pendente (ver `aicontext/modules/character-sheets.md`); a trava de nível e XP fica dentro de `patchSheet`/`patchSheetWithAccess` (`assertCampaignPatchAllowed`, erro `CampaignSheetPatchError` → 409), então vale também para o Owlbear e para o `update_sheet` do Agente Opex. Perfix: reutiliza `maddox.play`.
- Subida do Opex interrompida: o degrau guarda `decidingAt`; `autoLevelUps` trata `deciding` sem execução neste processo (reinício) como `pending` e decide de novo, ou marca `failed` para o dono se o Opex saiu da mesa.
- Testes: `tests/backend/maddox/level-progression.test.ts` mocka `server/level-up-ai`, `server/settings` e `decideOpex`/`loadOpexModel` de `opex-player`; `tests/backend/character-sheets/level-up.test.ts` cobre o motor.

## Testes

`tests/backend/maddox/*` (configuração, roteiros, avatar, sessões, rotas, `campaigns.test.ts` com MongoDB em
memória, `campaign-routes.test.ts`, `grant-maddox-play.test.ts`; Personagens Opex: `opex-interview.test.ts`,
`opex-table.test.ts`, `opex-combat.test.ts`, `opex-prompt.test.ts`, `grant-maddox-opex.test.ts`; NPCs Opex: `opex-npc-tools.test.ts`,
`opex-npc-combat.test.ts`, `opex-npc-routes.test.ts` e `tests/backend/engramind/opex-npcs.test.ts`) e `tests/frontend/maddox/*`
(`maddox-tab.test.tsx`, `maddox-campaigns.test.tsx`, `maddox-member-avatar.test.tsx`, `maddox-campaigns-realtime.test.tsx`, `maddox-opex.test.tsx`, `maddox-opex-npc.test.tsx`; happy-dom).
Reiniciar campanha (DND-50): `campaign-reset.test.ts` (reinício completo — o que apaga e o que preserva —, só o dono, fases aceitas,
duas vezes seguidas, limpeza interrompida retomada, Engramind fora com início recusado e rotina, narração em andamento interrompida
sem gravar e job da fila descartado, narração interrompida no meio da gravação, job preso liberado pela folga com o próximo job executando, teto da espera pelos Opex, `resetAt` no estado da
mesa), `opex-table.test.ts` (Personagem Opex decidindo no momento do reinício), `sheet-restore.test.ts` (as três fontes da ficha, cópia de quem
entra depois, bloqueio do início durante o ajuste, falha num personagem com "Tentar de novo" só dele e sem o motivo no DTO, ajuste
preso, personagem sem ficha), `campaign-routes.test.ts` (rotas), `tests/backend/engramind/campaign-rewind.test.ts` (exclusão de todas
as memórias) e, na tela, `maddox-campaign-reset.test.tsx` (botão, diálogo, bloqueio, aviso de falha, aviso da mesa) e
`maddox-game.test.tsx` (redirecionamento da mesa, sem o botão na mesa).
Modelo por rigor (DND-32): `model-resolution.test.ts` (ordem de resolução e o pulo do slider), `settings.test.ts`
(formato, validação, catálogo, disponibilidade por rigor), `narrator-opencode.test.ts`, `interviews.test.ts`,
`action-validation.test.ts`, `campaigns.test.ts` e, na tela, `maddox-tab.test.tsx` ("modelo por rigor").
DND-36: `player-actions-visibility.test.ts` (tabela da regra), `game.test.ts` (oculta só para os outros, autor vê o texto, lista do
mesmo tamanho, histórico, resumo do combate com e sem a marca, narrador com o texto completo, ligar e desligar),
`tactical-combat.test.ts` (o "Encerrar turno" grava `combatTurn`), `journal.test.ts` (busca), `campaigns.test.ts` (criação, PATCH,
auditoria, schema) e, na tela, `maddox-game.test.tsx` e `maddox-campaigns.test.tsx`.
DND-31: `interviews.test.ts` (personagem criado ao começar, corrida de duas abas, entrevistador indisponível sem esboço, nome
obrigatório com 409 e reaplicação, nome longo cortado, retrato gerado uma vez com o pedido certo e a foto da ficha substituída,
falha e nova tentativa concorrente, teto de tempo com gerador que não responde, personagem antigo sem imagem, retrato preso, personagem sem nome fora de "Outros personagens da mesa"), `interview-prompt.test.ts` (regra do nome),
`campaigns.test.ts` (`ensureCharacterDraft`), `campaign-routes.test.ts` (rota do retrato), `maddox-campaigns.test.tsx` ("Criar
personagem" vai à entrevista, sem edição, "Personagem em criação", gerando/pronto/falhou) e `maddox-interview.test.tsx`. Os testes
que só precisam de um nome antes da consolidação usam `tests/helpers/maddox-character.ts` (`nameMaddoxCharacter`); os de ficha
mockam `scheduleCharacterPortrait` (o retrato é coberto em `interviews.test.ts`).
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
DND-25: `tactical-combat.test.ts` ("iniciativa dos inimigos depois dos personagens": um card por grupo, rolagem só depois do último
personagem, `revealUntil` segurando a ordem, desvantagem, saída do último pendente; "um bloco por adversário": narração da vez, um bloco
por goblin com os cards antes da narração, `live-roll`, pausa, derrotado sem bloco, NPC só com narração, todos com 0 PV = derrota,
falha de um bloco), `narrator-tactical-combat-campaign.test.ts`, `reminders.test.ts` (narrador real: recusas, auditoria, turno
intacto, lembrança no prompt, guardada no canal do mestre e descartada, enviada durante a narração, falha da geração, resposta não
consome, fila da rede), `game-routes.test.ts` (rota), `narrator-prompt.test.ts` (blocos e seção das lembranças); na tela,
`maddox-dnd25-combat.test.tsx` (popover, linha, card dos inimigos, dados ao vivo em sequência, passo do servidor, stream). Os testes
encurtam os tempos com `shortenCombatTiming` e esperam a mesa com `settleCampaign` (`tests/helpers/maddox-sequence.ts`).
DND-30: `narrator-action-options-campaign.test.ts` (narrador real: sugestões gravadas com a narração e cada jogador só com as
dele, clique = declaração e as novas na narração seguinte, descarte com testes pedidos, narração que falha, resposta sem a
ferramenta), `master-tools.test.ts` (`suggest_actions`: nomes, repetidas, teto, corte, recusas e o filtro da AI SDK),
`narrator-prompt.test.ts` (linha da tarefa e bloco do MCP), `maddox-mcp.test.ts`; na tela, `maddox-game.test.tsx` (bloco só na
última narração do turno aberto, envio, desabilitado com a escolhida, `ACTION_INVALID`, campo livre e `actionOptionsView`).
DND-22: `campaigns.test.ts` (densidade padrão, na criação, editada em andamento com auditoria, campanha antiga e schema),
`narrator-prompt.test.ts` (linha de tamanho nas narrações e não na resposta), `narrator-campaign.test.ts` (narrador real: densidade
editada vale na narração seguinte e não na resposta), `journal.test.ts` (aba Imagens: só prontas, sem retrato de NPC secreto nem dados
do gerador, filtro, paginação, contagem e busca pela legenda), `journal-routes.test.ts`; na tela, `maddox-campaigns.test.tsx` (slider
na criação e na edição, chip) e `maddox-journal.test.tsx` (galeria, links, filtro, vazio, destaque e busca).
