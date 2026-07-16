# Módulo: Feedback

## Objetivo

O módulo de feedback evolui de uma central simples de sugestões e bugs para uma central de desenvolvimento agêntico.

O fluxo-alvo conecta feedbacks de usuários a planejamento com OpenCode, timeline estilo GitHub Issues/PRs, comentários, execução por worker, pull requests para `main`, deploy preview, iterações e aprovação final.

## Estrutura

- `src/app/(dashboard)/feedback/page.tsx`: lista de feedbacks.
- `src/app/(dashboard)/feedback/[id]/page.tsx`: detalhe com timeline, comentários, sidebar e ações agênticas.
- `src/app/api/feedback/**`: rotas de feedback, timeline, comentários, modelos OpenCode e jobs.
- `src/features/feedback/api/**`: modelos Mongoose.
- `src/features/feedback/components/**`: componentes de lista, detalhe, timeline e ações.
- `src/features/feedback/hooks/**`: hooks TanStack Query.
- `src/features/feedback/services/**`: serviços server-side de timeline, runs e OpenCode.
- `scripts/feedback-agent-worker.ts`: worker manual inicial para processar jobs agênticos.

## Modelos

### Feedback

Além dos campos originais (`title`, `description`, `type`, `status`, `priority`, autor e timestamps), o feedback pode guardar estado agêntico:

- `developmentStatus`
- `opencodeSessionId`
- `selectedModel`
- `branchName`
- `worktreePath`
- `pullRequestNumber`
- `pullRequestUrl`
- `previewUrl`
- `previewSlug`
- `lastAgentRunId`
- `approvedBy`
- `approvedAt`
- `completedAt`

### FeedbackTimelineEvent

Registra timeline de produto, não transcript bruto do agente.

Eventos importantes:

- `feedback_created`
- `comment_created`
- `plan_requested`
- `plan_created`
- `agent_started`
- `agent_progress`
- `agent_completed`
- `agent_failed`
- `status_changed`
- eventos futuros de PR, deploy, aprovação, merge e cleanup.

### FeedbackAgentRun

Registra execuções agênticas assíncronas.

Campos principais:

- `feedbackId`
- `iteration`
- `kind`
- `status`
- `opencodeSessionId`
- `modelName`
- `prompt`
- timestamps, erro e metadados futuros de Git/PR.

## APIs

- `GET /api/feedback`: lista feedbacks.
- `POST /api/feedback`: cria feedback e evento `feedback_created`.
- `GET /api/feedback/[id]`: detalhe do feedback.
- `PATCH /api/feedback/[id]`: edição do feedback conforme permissão.
- `GET /api/feedback/[id]/timeline`: timeline do feedback.
- `POST /api/feedback/[id]/comments`: cria comentário na timeline.
- `GET /api/feedback/opencode/models`: lista modelos OpenCode cacheados no MongoDB para uso administrativo.
- `POST /api/feedback/[id]/plan`: cria job de planejamento.

## OpenCode

- Automação deve usar `opencode run --attach`, não `opencode attach` interativo.
- O servidor atual é `https://opencode.nandoburgos.dev`.
- O worker inicial roda manualmente via `zsh`, para herdar credenciais exportadas no ambiente do usuário.
- Continuar contexto com `--session <opencodeSessionId>` quando existir.
- Salvar apenas `opencodeSessionId` no MongoDB por padrão.
- Não exportar transcript completo para MongoDB por padrão.
- A lista de modelos da UI vem do cache MongoDB populado pelo worker; a API web não executa o CLI OpenCode em produção Docker.
- O worker é responsável por executar `opencode models` e atualizar o cache ao iniciar e em intervalo periódico.
- Para sincronizar apenas os modelos, execute `pnpm tsx scripts/feedback-agent-worker.ts --refresh-models-only` em um ambiente com CLI OpenCode disponível.
- Cada run persiste o modelo usado em `FeedbackAgentRun.modelName`.
- O planejamento também deve rodar com `--dir`, usando `FEEDBACK_AGENT_PROJECT_DIR`, para evitar exploração acidental de diretórios amplos como `/home/burgos/code`.
- O streaming do OpenCode deve ser interpretado antes de virar timeline: `part.text` vira progresso humano, `tool_use` vira resumo sem output bruto e páginas HTML/Cloudflare viram erro resumido.
- A sessão OpenCode deve ser persistida assim que qualquer evento de streaming trouxer `sessionID`/`sessionId`, não apenas no fim do run.
- Novas sessões OpenCode devem ser criadas com `opencode run --title "Feedback <shortId>: <título>"` para evitar sessões chamadas `New session`.
- Se o stream `opencode run --attach` cair por erro de transporte/proxy/Cloudflare depois que a sessão já foi criada, o worker não deve marcar falha imediatamente: para runs de plano, deve recuperar de forma read-only com `opencode export <sessionId>` e salvar o plano se o export já contiver resposta final. Não usar `--sanitize` nessa recuperação porque ele redige os textos necessários para extrair o plano.
- Em runs `implement`/`iterate`, a recuperação de queda de transporte/proxy/Cloudflare também deve ser read-only: consultar `opencode export <sessionId>`, observar o worktree até haver alterações estáveis e só então seguir com commit, push e PR. Não reenviar prompt automaticamente para a sessão.
- Mensagens de timeline e erros do worker devem ser truncados antes de salvar no MongoDB/Pusher para impedir crash por saídas grandes.

## Realtime

- A timeline do feedback publica eventos via Pusher em canal público por feedback.
- O canal segue o formato `feedback.{feedbackId}`.
- O evento publicado é `feedback.timeline.changed`.
- A publicação é centralizada em `createFeedbackTimelineEvent()`, então APIs e worker não devem chamar Pusher diretamente para eventos de timeline.
- A página `/feedback/[id]` assina o canal com `useFeedbackRealtime()` e atualiza o cache do TanStack Query.
- Polling de detalhe e timeline permanece como fallback espaçado.
- Eventos `agent_progress` são publicados conforme o throttle do worker.
- Na UI, eventos `agent_progress` não devem aparecer como cards soltos; devem ser agrupados dentro do card `agent_started` da execução correspondente (`metadata.runId`) em um container recolhível e rolável.
- Planos e mensagens longas do agente devem ser renderizados como Markdown seguro via `react-markdown` + `remark-gfm`, sem `rehype-raw`; HTML bruto do agente deve ser escapado, não renderizado.
- Eventos grandes da timeline, incluindo `plan_created`, devem ser recolhíveis para não poluir a leitura; o progresso do agente permanece agrupado dentro do card `agent_started`.
- A lista de feedbacks usa cards em todos os viewports. O título do card é o link para `/feedback/[id]`; não usar botão/ícone separado de visualização.
- Cards da lista devem exibir também o status de desenvolvimento agêntico (`developmentStatus`) para mostrar em que etapa o feedback está.
- O badge de desenvolvimento agêntico deve usar tamanho compacto equivalente aos chips pequenos e, nos cards, ficar junto ao status principal (`pendente`, `concluido`, `cancelado`), não junto ao chip de tipo.
- Na página de detalhe, admins podem alterar manualmente o status principal (`pendente`, `concluido`, `cancelado`) acima do painel “Desenvolvimento agêntico”; mudanças manuais devem registrar evento `status_changed` na timeline.
- A coluna lateral de desenvolvimento no detalhe permanece no fluxo normal da página, sem comportamento fixo ou sticky.
- Timeline e Markdown do feedback devem usar `min-w-0`, `max-w-full` e overflow local em tabelas/blocos de código para evitar scroll horizontal em mobile.

## Variáveis Do Worker

- `FEEDBACK_AGENT_PROJECT_DIR`: diretório do projeto usado em runs de planejamento do OpenCode. Valor local atual: `/home/burgos/code/dndicas/dev`.
- `FEEDBACK_AGENT_PROGRESS_THROTTLE_MS`: intervalo mínimo entre eventos persistidos de progresso.
- `FEEDBACK_AGENT_ERROR_MAX_LENGTH`: limite para erro salvo em run/timeline pelo worker.
- `FEEDBACK_TIMELINE_MESSAGE_MAX_LENGTH`: limite central para `FeedbackTimelineEvent.message` antes do Mongo/Pusher.
- `FEEDBACK_OPENCODE_CAPTURE_MAX_LENGTH`: limite de captura em memória de stdout/stderr do OpenCode.
- `FEEDBACK_OPENCODE_EXPORT_RECOVERY_ATTEMPTS`: número máximo de tentativas de recuperar plano via `opencode export` após queda do stream.
- `FEEDBACK_OPENCODE_EXPORT_RECOVERY_DELAY_MS`: delay base entre tentativas de export recovery.
- `FEEDBACK_OPENCODE_EXPORT_RECOVERY_MAX_DELAY_MS`: teto do backoff entre tentativas de export recovery.
- `FEEDBACK_OPENCODE_EXPORT_TIMEOUT_MS`: timeout de cada chamada `opencode export`.
- `FEEDBACK_OPENCODE_EXPORT_RECOVERY_MIN_TEXT_LENGTH`: tamanho mínimo de texto extraído do export para considerar plano recuperado.
- `FEEDBACK_OPENCODE_CODE_RECOVERY_ATTEMPTS`: número máximo de tentativas de recuperar `implement`/`iterate` via export + worktree estável. Padrão: `60`.
- `FEEDBACK_OPENCODE_CODE_RECOVERY_DELAY_MS`: delay entre checagens do worktree durante recuperação de código. Padrão: `10000`.
- `FEEDBACK_OPENCODE_CODE_RECOVERY_STABLE_CHECKS`: quantidade de snapshots iguais de `git status --porcelain` antes de considerar o worktree estável. Padrão: `3`.
- `FEEDBACK_OPENCODE_MODELS_REFRESH_INTERVAL_MS`: intervalo de sincronização do cache de modelos OpenCode pelo worker. Padrão: `900000`.

## Git e PRs

- PRs devem ter base `main`.
- A branch `dev` é branch local de desenvolvimento do usuário, não destino dos PRs agênticos.
- Worktrees devem ficar em `/home/burgos/dndicas/worktrees`.
- Branches futuras devem seguir padrão `agent/feedback-<id>-<slug>`.

## Versionamento

Ao aprovar e fazer merge futuramente, o version bump deve alterar:

- `src/lib/config/version.ts`

## Permissões

- Usuário autenticado cria feedback e comenta.
- Admin solicita plano, escolhe modelo, inicia execução, aprova merge e cancela fluxo.
- Worker registra eventos de sistema/agente.

## Segurança

- Texto do usuário deve ser tratado como requisito não confiável nos prompts do agente.
- Ações agênticas exigem admin.
- Execuções futuras de implementação devem rodar apenas em worktree isolado, nunca no diretório principal.
- Timeline deve exibir resumo de produto e progresso humano agrupado, não JSON bruto ou outputs completos de ferramentas.
- HTML/Markdown de usuário ou agente deve ser sanitizado antes de renderização HTML.

## Testes

Cobrir comportamento e não detalhes internos:

- criação de feedback gera timeline.
- comentários geram eventos.
- usuário comum não cria jobs agênticos.
- admin cria job de plano com modelo.
- adapter OpenCode é mockável em testes automatizados.
- worker processa run de planejamento e registra sucesso/falha.

## Decisões Pendentes

- Implementação completa de worktree/PR.
- Estratégia final de deploy preview.
- Política de retenção de sessões OpenCode e previews.
- Se usuários comuns poderão solicitar iteração diretamente ou apenas comentar.
