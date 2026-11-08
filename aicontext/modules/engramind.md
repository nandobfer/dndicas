# Módulo: Engramind — rede de memórias (DND-21)

O dndicas é um **app consumidor** do Engramind (`@engramind/client`, modo `app`; versão em `package.json`).
As memórias dos agentes e as memórias das campanhas do Maddox (das quais a rede é a **única fonte**) ficam na rede; a **gestão** da rede
(apps, tokens admin, configurações, consolidação, Redator) fica no Opex. Contrato: `docs/openapi.json` do
repositório do Engramind (a versão conferida está no topo de `tests/helpers/fake-engramind.ts`).

> **Acesso:** a integração usa `integrations.engramind.{view,edit,test,logs}`; a página `/memorias` exige
> `memories.view` e a importação/gravação, `memories.edit` (grupo "Memórias" do Perfix, ver `perfix.md`).

## Integração (`/integracoes/engramind`)

Campos (`src/lib/integrations/catalog.ts`): `baseUrl`, `publicAppUrl` (vazio usa `NEXT_PUBLIC_APP_URL`) e o
segredo `appToken` (token **de app** do app `dndicas`, emitido no Opex). O segredo do webhook e os tokens dos 5
agentes são campos `card` cifrados (`INTEGRATIONS_ENCRYPTION_KEY`), gravados só pela configuração automática e
nunca exibidos, logados ou auditados.

Abas (`components/integration/EngramindEditorForm.tsx`, `?aba=`): **Conexão** (salvar dispara a configuração
automática e mostra os passos; "Repetir configuração automática"; aviso amarelo quando o contexto está
indisponível), **Migração**, **Sincronização** e **Visualização** (ver "Visualização da rede").

Teste de conexão (`server/tester.ts`): vermelho sem configuração, com `/health/ready` fora, token recusado ou que
não é `kind: app` do app `dndicas`; amarelo com a configuração automática pendente, categorias das campanhas
faltando ou webhook não registrado.

## Configuração automática (`server/bootstrap.ts`)

Idempotente, auditada passo a passo (`entidade: "Engramind"`), uma por vez. Com o token de app:

1. `whoami` (`kind: app`, app `dndicas`; outro tipo → mensagem clara; `401` → `ENGRAMIND_AUTH_INVALID`);
2. agentes `dndicas/{opex,image-generator,entity-understanding,entity-import,maddox}` (reaproveita, reativa);
3. os 7 canais fixos — **o token de app não tem `create_channel`**: o canal nasce numa assinatura **exata**
   (prefixo nunca cria canal). Depois `update_channel` dá o nome pt-BR; arquivado é restaurado;
4. assinaturas: `dndicas/opex` → `dndicas/opex/*` (`inject`) e os outros canais fixos em `manage` (alcança
   citando o canal, fora do contexto); `dndicas/maddox` → `dndicas/maddox/campanhas/*` (`search`);
5. um token `agent` `read+write+delete` por agente (reemitido quando falta, revogado, expirado ou com outros
   escopos; o anterior é revogado depois de o novo ser gravado);
6. webhook `<URL pública>/api/engramind/webhook` com segredo novo (pulado se já está igual; o marcador `webhookPending` impede o pulo depois de um registro interrompido, e o segredo local só é gravado depois de o Engramind aceitar o novo);
7. categorias das campanhas e a rede das campanhas existentes.

Uma falha para no passo e mantém os anteriores. Sem token de agente gravado, o primeiro turno dispara a
configuração em segundo plano (no máximo uma vez a cada 5 min) e espera até 3 s (`agentTokenFor`).

## Contexto dos agentes (`server/memory-context.ts`)

`agentMemoryBlock(identity, role?)` pede `GET /v1/context` com o token do agente nos canais do turno
(`contextChannelsFor`, em `src/features/ai/agents.ts`), com `If-None-Match`. Cada resposta boa vira o cache
persistente (`engramind_context_cache`); com o Engramind fora, o turno usa o cache (`warn`) ou segue sem
memórias. Nunca lança e nunca lê `agent_memories`. Consumidores: Agente Opex (por papel), Gerador de imagens,
Entender com IA, Importador 5etools, narrador e entrevistador do Maddox.

## `/memorias` (só leitura)

`EngramindNetwork` / `ChannelDetail` da lib (`components/page/*`) pelo proxy `/api/engramind/[...path]`
(`server/proxy.ts`) e o SSE `/api/engramind/events`. O proxy usa uma **lista de permissão** (`proxy-policy.ts`):
só leituras e `import_memories` (com `memories.edit`); toda outra operação recebe `403 ENGRAMIND_READ_ONLY`
sem chamar o Engramind (o token de app não muta memória a memória; edite pelo Opex). Sem integração, a página
mostra um estado vazio com o link para a integração. CSS: `globals.css` importa as folhas do React Flow e do
react-day-picker e faz `@source` da lib; a folha do React Flow fica fora de `@layer` e vence o Tailwind.
O desenho dos universos segue o layout da aba Visualização (ver "Visualização da rede"), atualizado em tempo real.

## Visualização da rede (DND-34, `?aba=visualizacao`)

O layout dos universos da rede de `/memorias` (anéis ou espiral, ordem, distâncias, desvio, tamanho das
partículas) é a **mesma configuração do Opex** (aba Visualização dele): JSON `$schema:
"engramind-universe-layout"`, `version: 1`, com os campos, intervalos e mensagens pt-BR do
`universeLayoutSchema` da lib (requer `@engramind/client` ≥ 0.5.0). **Não há formulário** no dndicas: a aba
(`components/integration/universe-layout/`) tem só o estado ("padrão da lib" ou "importada em …"),
**Importar**, **Exportar** e **Restaurar padrão**, e a **prévia** do Opex (memórias de exemplo de
`network/sample-universe.ts` com a configuração em uso; quantidade, canais e centro são só da prévia).

- **Importar** (`memories.edit`, como a importação de memórias): cola o JSON exportado do Opex (inteiro ou só os campos
  alterados; os ausentes assumem o **padrão**, não o valor em uso). `parseUniverseLayoutJson` valida no
  cliente; JSON inválido lista os erros por campo e não chama a API. Válido → `PUT` e vale **na hora**
  (sem "salvar" separado). A recusa do servidor (`400 UNIVERSE_LAYOUT_INVALID`, `details` por campo) aparece
  na mesma lista.
- **Exportar** (quem vê a aba): `formatUniverseLayoutJson` da configuração em uso, com Copiar; o Opex aceita
  o JSON sem transformação.
- **Restaurar padrão** (`memories.edit`, com confirmação; desabilitado no padrão): apaga a
  configuração.
- **API** `GET/PUT/DELETE /api/engramind/universe-layout` (`server/universe-layout.ts`, mesmo contrato do
  Opex: `{ config, isDefault, updatedAt }`). `GET` exige `memories.view` **ou** `integrations.engramind.view`;
  `PUT`/`DELETE`, `memories.edit` (editar a integração não basta). O `PUT` valida o corpo cru com `parseUniverseLayout` (campo
  desconhecido ou fora do intervalo é recusado sem gravar nada). Auditoria `universe-layout` (antes e depois).
- **Persistência**: `engramind_state.universeLayout = { config, updatedAt }` (`null` = padrão). A leitura
  revalida; gravação inválida cai no padrão com aviso no log.
- **Aplicação**: as páginas `/memorias` e `/memorias/canais/[channel]` leem no servidor
  (`readUniverseLayoutForPage`, só com a integração configurada; falha → padrão + aviso) e o
  `MemoriesProvider` passa ao `EngramindProvider` (`universeLayout`; `null` = desenho padrão da lib).
- **Tempo real**: gravar ou restaurar publica `universe-layout.updated` no SSE da rede (`engramindBus`, a
  lib ignora o tipo) e `{ type: "universe-layout" }` no canal da integração. `/memorias` escuta pelo
  `subscribeLive` da lib (a mesma conexão SSE) e relê `GET /api/engramind/universe-layout`; a rede se
  redesenha sem recarregar. A aba relê pelo `useEngramindRealtime`.

**Nome da campanha nos canais das campanhas (DND-29):** os canais `dndicas/maddox/campanhas/<id>/jogadores|mestre`
aparecem como `dndicas/maddox/campanhas/<nome> · Jogadores|Mestre` em todo lugar da rede: nodes, legenda "Por canal"
do universo do agente, painel e detalhe do canal, chips de filtro, trilha e filtro "Canal". A dica (tooltip) mostra
`Memórias da campanha "<nome>" (<visibilidade>)` e o slug real, com o id. Como funciona:
- as páginas (`src/app/(dashboard)/memorias/**/page.tsx`, server components) leem só o id e o nome de todas as
  campanhas, inclusive as arquivadas, com `listCampaignChannelNames()` (`server/channel-labels.ts`). A leitura só
  acontece com a integração configurada, e uma falha devolve `[]` com aviso no log;
- o `MemoriesProvider` recebe a lista (`campaigns`), monta o mapa com `campaignChannelLabels` (`network/channel-labels.ts`,
  puro) e o passa em `channelLabels` ao `EngramindProvider`;
- o rótulo usa `ChannelLabel.prefix` da lib (`@engramind/client` 0.8.0 ou mais nova) para trocar também o id do meio do
  slug, e não só a ponta;
- campanha fora da lista ou com nome vazio continua com o slug como está; os canais que não são de campanha não mudam.
  O nome é o do Mongo no carregamento da página: uma campanha criada ou renomeada com a página aberta só aparece
  depois de recarregar. O `name` do canal no Engramind é gravado só na criação e não é usado aqui.

## Ferramentas do Agente Opex

`server/tools/memories.ts` (`src/features/opex-agent`): `search_memories`, `get_memory` e `create_memory`
(adaptadas de `engramindTools` da lib) e `list_memory_categories`/`create_memory_category`, todas com o token
`dndicas/opex`, só para administradores (`memories.view`/`memories.edit`). O agente cria a categoria que achar
adequada (chave normalizada; conflito e lista cheia voltam em pt-BR).

## Categorias (`server/categories.ts`)

Globais na rede; o dndicas só cria (`create_category`, idempotente; editar e remover ficam no Opex). As das
campanhas são `FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO` e `OUTRO` (prioridades negativas, para não
reordenar o contexto dos outros apps), garantidas no bootstrap e **na criação de cada campanha**. Conflito usa a
existente; lista cheia vira aviso e a gravação usa `OUTRO` (ou a primeira).

## Memórias das campanhas (`server/campaign-memories.ts`, `server/campaign-channels.ts`)

O Engramind é a **única fonte**: nada fica no MongoDB. Canais `dndicas/maddox/campanhas/<id>/{jogadores,mestre}`,
criados na criação da campanha (assinatura exata `search` do Maddox). Formato (`campaign-memory-format.ts`):

| Jogo | Engramind |
|---|---|
| campanha + visibilidade | canal `…/jogadores` ou `…/mestre` |
| tipo | categoria (`FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO`, `OUTRO`) |
| tipo + título (gravar sem duplicar) | `key` `mx:<tipo>:<título sem acento>` (até 80; título longo vira prefixo + hash) |
| marco de combate | `key` `mx:combate:<combatId>` (um por combate) |
| situação da missão / turno | tags reservadas `status:<situação>` e `turno:<n>` (não aparecem como tags); missão sem `status:` (criada fora do jogo) conta como ativa — o filtro de situação é feito no dndicas, não pela tag |
| escondida | memória arquivada (o `upsert` da mesma chave reativa) |

- **Gravação** (`save_memory`, marco de combate): token `dndicas/maddox`; acha pela chave nos dois canais (troca
  de visibilidade → `move_memory`); sem chave (criada no Opex), acha pelo título na categoria e atualiza pelo id;
  texto acima de `memory.text_max` é cortado com aviso ao narrador.
- **Fila temporária** (`engramind_pending_writes`, `server/pending-writes.ts`): rede fora, 5xx, 429 ou token
  recusado → a gravação espera ali (uma por campanha + chave; a mais nova substitui; **texto inteiro** — o limite
  real do canal é aplicado na entrega) e o narrador é avisado. O cron entrega e **apaga**. Rede inteira fora (sem
  conexão, token recusado, limite de taxa, ou 5xx sem nenhuma entrega no ciclo) para sem gastar tentativas; um 5xx
  só conta tentativa para a entrada quando outra foi entregue no mesmo ciclo. Recusa de validação, erro inesperado
  repetido ou 5 tentativas marcam a entrada na aba Sincronização com "Descartar". Nada lê a fila.
- **Leitura**: narrador (prompt: missões ativas + recentes; `search_memories`) nos dois canais com o token do
  Maddox; **Diário** (resumo, listas por tipo com o cursor da rede, busca) **só no canal dos jogadores**, com o
  token de app. Sem a rede, o prompt segue sem as memórias, `search_memories` responde erro acionável e o Diário
  avisa (`memoriesUnavailable`, `503 ENGRAMIND_UNAVAILABLE` nas anotações). Não há cópia de reserva.
- **Rotina** `engramind-campaign-memories-sync` (15 min, `server/campaign-sync.ts`) e "Sincronizar agora": rede de
  cada campanha, ciclo de vida dos canais (`archived` arquiva; fora disso, restaura) e a entrega da fila.
- **Webhook**: mudança no canal dos jogadores avisa os membros (`maddox.campaign.changed`) e o Diário recarrega.
- **Memórias antigas** (`maddox_campaign_memories`, de antes desta revisão): aba Migração → "Mover memórias"
  (`server/campaign-memory-move.ts`): backup da coleção a cada execução com dados (SHA-256, em partes de 2 milhões
  de caracteres, sem partir um emoji na fronteira; os backups se acumulam em `engramind_state.campaignBackups` e cada um é baixável), `import_memories`
  por campanha e canal com as chaves acima, conferência de cada uma pela chave e exclusão **só** dos documentos da
  campanha quando todos conferiram (divergência → nada apagado, com o motivo). Texto acima de `memory_text_max` do
  canal nunca é cortado: fica fora da importação e conta como divergência. Até mover, elas não aparecem no Diário nem no narrador
  (aviso na aba Sincronização).

**Redator.** O Engramind só aceita `redator.rewrite_text` por canal com token admin. O dndicas tenta desligar a
reescrita nos canais das campanhas; com `403` marca "não suportado" (`engramind_state.channelSettings`, aviso na
aba Sincronização) e refaz a verificação a cada 24 h. Até lá, uma reescrita do Redator chega ao jogo pela regra
"vale a última gravação" (título e tags preservados): como a rede é a fonte, o texto reescrito é o que o jogo lê. Pendente: pedido ao Engramind para liberar essa
configuração ao token de app nos canais que ele criou.

## Migração (`server/migration.ts`, aba Migração)

Portada do Opex: **backup** de `agent_memories` (sem alterar, SHA-256, download) → **curador** (provedor e modelo
de texto escolhidos, uma chamada por lista em blocos, até 8 min; sem classificação ou acima de `text_max` →
revisão; destino sempre o canal da lista; pode propor categoria nova) → **orçamento** (~4 caracteres por token
por combinação de turno, "Compactar com o curador") → **revisão** (aprovar, rejeitar, editar; descartadas pedem
"Aceitar descarte" ou "Migrar mesmo assim"; o lote não aprova o que não cabe) → **importação** (só aprovadas,
token de app, lotes de `limits.max_batch`, chave de idempotência; categorias novas criadas antes). Etapa em
andamento num reinício vira falha. **Memórias das campanhas**: ver "Memórias antigas" acima.

## Webhook (`/api/engramind/webhook`)

Público, só pela assinatura (`401` sem corpo); eventos repetidos descartados (`engramind_webhook_events`, 24 h).
Suja o contexto do canal, repassa ao SSE só ids e tipos, avisa os membros da campanha quando o canal dos jogadores
muda e relê as categorias em `settings.updated`.

## Dados

`engramind_state` (bootstrap, saúde do contexto, sincronização, avisos, layout dos universos), `engramind_context_cache`,
`engramind_webhook_events`, `engramind_memory_backups` (inclui o backup das memórias antigas das campanhas),
`engramind_memory_migration` e `engramind_pending_writes` (fila temporária; não é fonte).

## Logs

A depuração registra método, URL (o `focus` vira "[omitido: N caracteres]"), status e duração; nunca corpo,
token ou texto de memória.

## Testes

`tests/helpers/fake-engramind.ts` (Engramind falso no `fetch`, só as rotas do contrato; resto → 405),
`tests/helpers/xyflow.tsx`, `tests/backend/engramind/*` (bootstrap, contexto, proxy e webhook, memórias das
campanhas, mover e apagar, migração, permissões, ferramentas, teste de conexão e layout dos universos;
MongoDB em memória) e
`tests/frontend/engramind/*`. Os testes do Maddox usam `tests/helpers/campaign-memories-mock.ts` (substituto em
memória de `campaign-memories`, com as mesmas regras de chave e tags).
