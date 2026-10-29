# Módulo: Agente Opex

Assistente por chat do DnDicas, copiado do Agente Opex do Opex (com as ferramentas de documentação
do Ciliar). Na interface o nome é **"Agente Opex"**; no código, o namespace é `opex-agent`.

## Quem usa

Está disponível para **todos**, inclusive visitantes sem login: item "Agente Opex" no rodapé da
barra lateral (`OpexNavItem`, atalho **Ctrl+Shift+O**). Abre o chat num popover ancorado no item
(no celular, em tela cheia), com abas de sessões, envio de arquivos, confirmações e resposta ao vivo.

| Papel | O que o agente pode fazer |
| --- | --- |
| Visitante | Catálogo (busca e leitura), documentação pública, contexto, leitura da central de feedback |
| Usuário logado | + as **próprias** fichas e NPCs (ler, criar, editar ficha), arquivos do chat, jobs agendados, criar/editar/comentar feedback |
| Administrador | Tudo: + documentação técnica e guias `use-*.md`, integrações e rotinas, agentes de IA, memórias, ativar/inativar entidades do catálogo |

O papel vem sempre do servidor: a cada turno, a cada ferramenta e na confirmação o usuário é
revalidado no banco (`loadActor`). Cada ferramenta declara `minRole` (ou herda do grupo em
`OPEX_GROUP_MIN_ROLE`) e só entra no turno de quem tem o papel.

## Identidade e sessões

- Usuário logado: sessões com `userId`; canal `private-opex-u-{userId}`.
- Visitante: id aleatório num cookie httpOnly assinado (HMAC com `AUTH_SECRET`,
  `dndicas_opex_anon`), criado em `GET /api/opex/status`; canal `private-opex-a-{id}`.
  Sessões com `anonymousId` e `expiresAt` (TTL configurável, padrão **7 dias** desde a última
  mensagem); a rotina `opex-files-cleanup` apaga as vencidas. Visitantes não enviam arquivos nem
  agendam jobs.
- Limite de mensagens dos visitantes por hora, por visitante, por IP e um teto somando todos os visitantes (configuráveis; 429 em pt-BR). O IP é o `x-real-ip` do proxy ou o último item do `x-forwarded-for` (o primeiro é forjável); sem IP, os pedidos dividem um balde único.
  Contadores em memória do processo (`server/rate-limit.ts`): o DnDicas roda numa única instância.
- O hub dos turnos ao vivo fica em `globalThis` pelo mesmo motivo (`server/hub.ts`).

## Ferramentas (`server/tools/*`)

| Grupo | Ferramentas |
| --- | --- |
| Contexto | `get_app_overview` (data/hora, versão, papel, contagem do catálogo) |
| Documentação | `list_app_docs`, `read_app_doc`, `search_app_docs` — lidas do disco (`aicontext/`) a cada chamada; público por arquivo em `APP_DOC_AUDIENCE` (fora do mapa = admin). O Dockerfile copia `aicontext/` para a imagem |
| Catálogo | `search_catalog`, `get_entity`, `list_catalog_entity_types` (mesmo serviço do servidor MCP) |
| Fichas e NPCs | `list_my_sheets`, `get_my_sheet`, `create_sheet`, `update_sheet`, `list_my_npcs`, `get_my_npc` |
| Catálogo (administração) | `set_catalog_entity_status` |
| Arquivos do chat | `list_chat_files`, `read_chat_file` |
| Jobs | `list_jobs`, `schedule_job`, `update_job`, `cancel_job` |
| Memórias | `list/get/create/update/delete_agent_memory` (todas as listas de `agents.ts`) |
| Integrações e rotinas | `list/get/update/test_integration`, `list_routines`, `run_routine` (segredos nunca são lidos) |
| Agentes de IA | `get/update_ai_feature_settings` (Gerador de imagens, Entender com IA, Importador 5etools, Resumo de memórias) |
| Central de feedback | `list_feedbacks`, `get_feedback`, `get_feedback_timeline`, `create/update/comment_feedback` |

As entidades citadas usam a menção `<span data-type="mention" ...>` e aparecem como badges
(`MentionContent`). Destrutivas e marcadas com `confirmByDefault` pedem Confirmar/Cancelar no chat.

## Configuração (aba "Agente Opex" de `/integracoes/ia`)

Geral (ativo, agente principal e subagente de título — Gemini, Anthropic, OpenAI ou DeepSeek,
instruções, arquivos e **Visitantes sem login**: atender, mensagens/hora por visitante e por IP,
validade das sessões), Ferramentas (seleção e confirmação por ferramenta, com quem pode usar) e
Memórias (`opex-global`, `opex-admin`, `opex-user`). Salva em `ai_feature_settings`
(`opex-agent`).

## APIs (`/api/opex/**`)

| Rota | Descrição |
| --- | --- |
| `GET /api/opex/status` | Público: disponibilidade, papel, dono das sessões, limites de arquivo; cria o cookie do visitante |
| `GET/POST /api/opex/sessions` | Sessões de quem está vendo / cria (com a 1ª mensagem) |
| `GET/PATCH/DELETE /api/opex/sessions/[id]` | Detalhe, renomear/arquivar, excluir (só o dono) |
| `POST /api/opex/sessions/[id]/messages` | Envia mensagem (409 ocupada/indisponível, 429 visitante) |
| `GET /api/opex/sessions/[id]/stream` | NDJSON ao vivo |
| `POST /api/opex/sessions/[id]/interrupt` | Para a resposta |
| `POST /api/opex/sessions/[id]/files`, `/api/opex/files/[id]/**` | Arquivos (login obrigatório) |
| `POST /api/opex/actions/[id]` | Confirma/cancela ação pendente |
| `/api/opex/jobs/**` | Jobs (login; admin vê os de todos em Integrações › Crons › Jobs) |

## Persistência

`opex_sessions`, `opex_messages`, `opex_pending_actions`, `opex_files` (binário no Storage S3),
`opex_jobs` (TTL de `purgeAt` depois de terminar). Arquivos do chat: o tipo declarado é normalizado (HTML/SVG/XML/JS viram `application/octet-stream`), conferido na confirmação e servido só pela rota autenticada, com `nosniff`. Ações pendentes com segredo exigem `INTEGRATIONS_ENCRYPTION_KEY` (sem ela, a confirmação é recusada). Índices pela migração `ensure-opex-indexes`.

## Testes

`tests/backend/opex-agent/*` (cookie anônimo, limite de visitantes, documentação por papel,
ferramentas por papel) e `tests/backend/integrations/channel-auth.test.ts`.
