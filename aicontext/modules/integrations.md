# Módulo: Integrações (`/integracoes`)

Central administrativa das integrações do DnDicas, copiada da central do Opex. Toda configuração
que antes vivia no `.env` passa a ser lida e gravada no MongoDB e editada pelos administradores.

> **Acesso:** `integrations.access` na sidebar/layout, com permissões `integrations.<id>.view/edit/test/logs/explore` nas APIs correspondentes. APIs de recursos de IA usam `integrations.ai.view/edit`. Canais administrativos continuam exigindo `admin.access`. O coringa `*` satisfaz todas essas permissões. Consulte [Perfix](./perfix.md).

## Interface (DND-6)

- `/integracoes/**` ocupa a largura disponível do dashboard. O `<main>` já aplica
  `p-4 lg:p-6`; o layout das integrações não deve duplicar esse padding nem impor
  `max-w-*`/centralização próprios. O antigo `mx-auto max-w-7xl` causava as faixas laterais extras.
- Lista, detalhes, explorador, logs e abas de IA/Agente Opex/Jobs reutilizam
  `@/components/ui/glass-card`, como as demais páginas. O antigo `opex/card` usava
  `bg-card`, quase preto no tema dark, porque a central havia sido copiada do Opex.
  Preservar o padding interno dos formulários e evitar animação dupla nos cards já animados pelo pai.
- A cor primária **global** referencia `--color-blue-500` do Tailwind, o azul original
  de "Nova classe"; antes, os controles Opex herdavam `--primary` verde enquanto os
  botões dos cadastros tinham azul hardcoded. Botões primários usam `bg-primary`,
  `text-primary-foreground` e `hover:bg-primary/90`, incluindo os cadastros e autenticação.
  Verde de sucesso/conectado e cores semânticas de HTTP/console permanecem independentes.
- Regressões de layout, autenticação, glass e controles: `tests/frontend/integrations/integrations-visual-standard.test.tsx`.

## Bootstrap: o que continua no `.env`

Só o necessário para o processo subir e chegar no banco (ver `.env.example`):

| Variável | Uso |
| --- | --- |
| `MONGODB_URI` | Conexão com o MongoDB |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Sessão do Auth.js e assinatura do cookie anônimo do Agente Opex |
| `AUTH_URL` / `NEXTAUTH_URL` | URL pública usada pelo Auth.js |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `INTEGRATIONS_ENCRYPTION_KEY` | Chave AES-256-GCM dos segredos (`openssl rand -base64 32`). Sem ela, segredos **não** são gravados e um aviso vai para o log |

Todo o resto (Google, Pusher, S3, SMTP, Crons, IA, Umami, Tradução) é configurado em `/integracoes`.

## Precedência e migração

- Leitura: **banco → `.env` legado → padrão do código** (`src/lib/integrations/config.ts`).
- Migração `seed-integrations-from-env` (roda no boot, `src/instrumentation.ts` → `dbConnect()`):
  copia uma única vez (`$setOnInsert`) os valores do `.env` legado para `integration_configs`.
  Depois disso, a tela é a fonte de verdade.
- `src/lib/integrations/legacy-env.ts` traduz o formato antigo do Pusher/Soketi
  (`PUSHER_HOST`/`PUSHER_PORT`/`PUSHER_SCHEME` e `PUSHER_PUBLIC_*`/`NEXT_PUBLIC_PUSHER_*`) para o
  formato novo (modo + URL) — `PUSHER_MODE`, `PUSHER_URL` e `NEXT_PUBLIC_PUSHER_URL` derivados.
- Campos e integrações **novos não declaram `env`**: só existem na tela.
- Cache em memória do processo por **30 s** (`src/lib/integrations/store.ts`); quem salva invalida.
- Nada lê configuração no carregamento do módulo: os singletons (S3, Pusher, mailer, provedores de
  IA) comparam a versão (hash) da configuração e se recriam; o provider do Google do NextAuth é
  montado por requisição; o layout raiz e as páginas dependentes são `force-dynamic`.

## Catálogo (`src/lib/integrations/catalog.ts`)

Módulo puro (tela e servidor). Integrações ativas:

| Id | Nome | Observações |
| --- | --- | --- |
| `google_auth` | Autenticação Google | `clientId` + `clientSecret`. Sem eles, o botão "Entrar com Google" some |
| `pusher` | Pusher | Cluster (nuvem) ou host próprio (Soketi), URL pública do cliente com vários endereços |
| `internal_api` | API dndicas | Documentação OpenAPI gerenciada (`/api/openapi.json`, Swagger em `/api/docs`), explorador e card do servidor MCP |
| `crons` | Crons | Agendador interno, URL base interna, rotinas, `cronSecret`; aba "Jobs" do Agente Opex |
| `ai` | Provedores de IA | Hub `/integracoes/ia` com `ai_opencode`, `ai_gemini`, `ai_anthropic`, `ai_openai`, `ai_deepseek`, `ai_jev` (ver `ai.md`) |
| `smtp` | SMTP | Sem host, os envios ficam em modo simulado (só log) |
| `storage_s3` | Storage S3 | MinIO/S3; endpoint público para URLs assinadas |
| `analytics_umami` | Analytics (Umami) | Script carregado pelo layout raiz; desativado, o script não entra |
| `translation` | Tradução | Tradutor padrão dos scripts de seed, LibreTranslate e Google Cloud Translation |
| `perfix` | Perfix | `/integracoes/perfix`: padrão de novos usuários, perfis/hierarquia/permissões/membros e Visualizar como |

| `opex` | Tarefas Opex | URL pública, URL interna opcional e segredo `clientToken`; acesso automático e dashboard em `/feedback` (ver `opex-feedback.md`) |

`IN_DEVELOPMENT_INTEGRATIONS` está vazio. O testador Opex verifica sessão administrativa e
listagem de usuários sem provisionar usuários de teste. A central antiga foi removida.

## Rotinas (Crons)

| Rotina | Intervalo | O que faz |
| --- | --- | --- |
| `integrations-health-check` | 5 min | Testa todas as integrações configuradas e grava o status |
| `opex-files-cleanup` | 60 min | Remove arquivos do chat do Agente Opex não enviados em 24 h e as sessões de visitantes expiradas |

O agendador inicia em `src/instrumentation.ts` (um único processo: PM2 com uma instância / um
processo no Docker). `/api/routines/scheduler-tick` executa o mesmo motor sob demanda (Bearer do
`cronSecret` ou do `CRON_SECRET` legado). Os jobs agendados do Agente Opex rodam no mesmo tick **mesmo com o agendador desligado** (o interruptor pausa só as rotinas, inclusive `opex-files-cleanup`).

`GET /api/upload?key=` (proxy público das imagens) recusa chaves privadas (`opex/`, com 404) e só serve inline imagens raster; qualquer outro tipo sai como download binário com `X-Content-Type-Options: nosniff` (`src/lib/storage/public-proxy.ts`).

## Persistência

| Coleção | Conteúdo |
| --- | --- |
| `integration_configs` | Um documento por integração: `publicValues`, `secretValues` (criptografados; `null` = limpo pelo admin), ambiente, debug, Swagger |
| `integration_statuses` | Último teste (ok/falha, latência, mensagem) |
| `integration_logs` | Logs de debug — TTL de **48 h** |
| `integration_cron_jobs` | Última execução e próxima de cada rotina |

Migração `repair-integration-indexes` corrige índices antigos. Mutação de configuração é auditada
(`recordAudit` → `AuditLog` do core).

## Tempo real

- `private-integration-{id}`: status e logs de debug ao vivo (só administradores).
- `private-app`: eventos administrativos (configuração de IA, memórias, jobs).
- Autorização em `src/lib/pusher/channel-auth.ts` via `POST /api/pusher/auth`.
- O navegador recebe a configuração pública do Pusher em runtime: `PusherConfigBridge` (layout
  raiz) e `GET /api/realtime/pusher-config`. **Não há mais `NEXT_PUBLIC_PUSHER_*` no build**
  (removidos do Dockerfile, do `docker-compose.yaml` e do workflow de CD).

## APIs

| Rota | Descrição |
| --- | --- |
| `GET /api/integrations` | Lista com status |
| `GET/PUT /api/integrations/[id]` | Detalhe e gravação (Zod a partir do catálogo) |
| `POST /api/integrations/[id]/test` | Teste em NDJSON |
| `GET /api/integrations/[id]/logs` | Logs de debug |
| `GET /api/integrations/[id]/openapi`, `POST .../explore` | Explorador da API |
| `GET /api/integrations/internal_api/mcp` | Endereço do servidor MCP e tokens ativos (sem expor tokens) |
| `POST /api/integrations/[id]/jobs/[jobId]/run` | Executa uma rotina agora |

## Código

- `src/lib/integrations/*`: catálogo, config, store, debug, schedule, legacy-env, analytics.
- `src/lib/crypto/secretBox.ts`: AES-256-GCM.
- `src/lib/db/*`: `dbConnect()` (conexão do core + migrações), modelos e migrações copiadas.
- `src/features/integrations/*`: serviços, testers, schemas, scheduler, componentes e hooks.
- `src/app/(dashboard)/integracoes/**`: páginas (layout com a checagem de administrador).
- `src/core/storage/s3.ts`, `src/core/email/mailer.ts`, `src/core/realtime/pusher-service.ts`:
  fachadas do core, com a mesma API de antes, sobre os serviços das integrações.

## Testes

`tests/backend/integrations/*` (catálogo, precedência, caixa de segredos, `.env` legado, canais).
