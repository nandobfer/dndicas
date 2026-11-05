# Módulo: Engramind — rede de memórias (DND-21)

O dndicas é um **app consumidor** do Engramind (`@engramind/client`, modo `app`; versão em `package.json`).
As memórias dos agentes e o espelho das memórias de campanha do Maddox ficam na rede; a **gestão** da rede
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
indisponível), **Migração** e **Sincronização**.

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
6. webhook `<URL pública>/api/engramind/webhook` com segredo novo (pulado se já está igual);
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

## Ferramentas do Agente Opex

`server/tools/memories.ts` (`src/features/opex-agent`): `search_memories`, `get_memory` e `create_memory`
(adaptadas de `engramindTools` da lib) e `list_memory_categories`/`create_memory_category`, todas com o token
`dndicas/opex`, só para administradores (`memories.view`/`memories.edit`). O agente cria a categoria que achar
adequada (chave normalizada; conflito e lista cheia voltam em pt-BR).

## Categorias (`server/categories.ts`)

Globais na rede; o dndicas só cria (`create_category`, idempotente; editar e remover ficam no Opex). As das
campanhas são `FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO` e `OUTRO` (prioridades negativas, para não
reordenar o contexto dos outros apps), garantidas no bootstrap e **na criação de cada campanha**. Conflito usa a
existente; lista cheia vira aviso e o espelho grava em `OUTRO` (ou na primeira) sem trocar o tipo do jogo.

## Espelho das campanhas (`server/campaign-mirror.ts`, `server/campaign-channels.ts`)

O MongoDB é a fonte do jogo. Canais `dndicas/maddox/campanhas/<id>/{jogadores,mestre}`, criados na criação da
campanha (assinatura exata `search` do Maddox). Formato (`campaign-mirror-format.ts`): `key = mx-<_id>` com
`upsert` (o webhook que chega antes do id ser salvo acha a memória pela chave), `title` travado, categoria pelo
tipo e a linha `Status: …` só nas missões (ausente/inválida mantém o status).

- **Jogo → rede**: sem espera; escondida → arquivada; troca de visibilidade → `move_memory`. Falha marca
  `engramindSyncPending` (o cron reenvia) e nunca afeta o jogo.
- **Rede → jogo** (webhook e cron): lê com o token de app; aplica quando a versão é maior que
  `engramindVersion` (anti-laço; vale a última gravação), em update condicional. Criar num canal de campanha
  cria no jogo (`origin: "user"`); arquivar esconde (`hiddenAt`); excluir remove; mover troca visibilidade ou
  campanha; para fora das campanhas remove; campanha inexistente é ignorada. Índice único em
  `engramindMemoryId` evita duplicar com cron e webhook juntos.
- **Cron** `engramind-campaign-memories-sync` (15 min) e "Sincronizar agora": rede das campanhas, pendentes,
  alteradas desde a última execução e varredura de ids para exclusões perdidas.
- **Ciclo de vida**: campanha `archived` arquiva os dois canais; saindo, restaura (melhor esforço, auditado).

**Redator.** O Engramind só aceita `redator.rewrite_text` por canal com token admin. O dndicas tenta desligar a
reescrita nos canais das campanhas; com `403` marca "não suportado" (`engramind_state.channelSettings`, aviso na
aba Sincronização) e refaz a verificação a cada 24 h. Até lá, uma reescrita do Redator chega ao jogo pela regra
"vale a última gravação" (título e status preservados). Pendente: pedido ao Engramind para liberar essa
configuração ao token de app nos canais que ele criou.

## Migração (`server/migration.ts`, aba Migração)

Portada do Opex: **backup** de `agent_memories` (sem alterar, SHA-256, download) → **curador** (provedor e modelo
de texto escolhidos, uma chamada por lista em blocos, até 8 min; sem classificação ou acima de `text_max` →
revisão; destino sempre o canal da lista; pode propor categoria nova) → **orçamento** (~4 caracteres por token
por combinação de turno, "Compactar com o curador") → **revisão** (aprovar, rejeitar, editar; descartadas pedem
"Aceitar descarte" ou "Migrar mesmo assim"; o lote não aprova o que não cabe) → **importação** (só aprovadas,
token de app, lotes de `limits.max_batch`, chave de idempotência; categorias novas criadas antes). Etapa em
andamento num reinício vira falha. **Histórico das campanhas**: `import_memories` por campanha e canal com a
`key` `mx-<id>`, contagem por campanha.

## Webhook (`/api/engramind/webhook`)

Público, só pela assinatura (`401` sem corpo); eventos repetidos descartados (`engramind_webhook_events`, 24 h).
Suja o contexto do canal, repassa ao SSE só ids e tipos, dispara o espelho das campanhas e relê as categorias em
`settings.updated`.

## Dados

`engramind_state` (bootstrap, saúde do contexto, sincronização, avisos), `engramind_context_cache`,
`engramind_webhook_events`, `engramind_memory_backups`, `engramind_memory_migration` e os campos novos de
`maddox_campaign_memories` (ver `maddox.md`).

## Logs

A depuração registra método, URL (o `focus` vira "[omitido: N caracteres]"), status e duração; nunca corpo,
token ou texto de memória.

## Testes

`tests/helpers/fake-engramind.ts` (Engramind falso no `fetch`, só as rotas do contrato; resto → 405),
`tests/helpers/xyflow.tsx`, `tests/backend/engramind/*` (bootstrap, contexto, proxy e webhook, espelho,
migração, permissões, ferramentas e teste de conexão; MongoDB em memória) e `tests/frontend/engramind/*`.
