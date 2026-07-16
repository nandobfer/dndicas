# Backend

## Principios

- Toda mutacao deve validar autenticacao e autorizacao.
- Todos os payloads devem ser validados com Zod.
- Mensagens de erro e estados acionaveis devem estar em pt-BR.
- Operacoes criticas devem registrar auditoria.
- API Routes devem criar jobs e retornar rapidamente.
- Execucoes longas devem ficar no worker.

## Modelo `Feedback`

O modelo atual deve ser expandido sem concentrar todo o historico nele.

Campos atuais relevantes:

- `title`
- `description`
- `type`
- `status`
- `priority`
- `createdBy`
- `creatorName`
- `creatorEmail`
- `createdAt`
- `updatedAt`

Campos novos sugeridos:

- `developmentStatus`: estado operacional do fluxo agentico.
- `opencodeSessionId`: ID da sessao OpenCode usada para plano e iteracoes.
- `selectedModel`: ultimo modelo escolhido para execucao.
- `branchName`: branch do PR.
- `worktreePath`: caminho do worktree no servidor.
- `pullRequestNumber`: numero do PR no GitHub.
- `pullRequestUrl`: URL do PR.
- `previewUrl`: URL do deploy de preview atual.
- `previewSlug`: slug usado no subdominio.
- `lastAgentRunId`: ultima execucao associada.
- `approvedBy`: usuario que aprovou merge.
- `approvedAt`: data de aprovacao.
- `completedAt`: data de conclusao.

## Modelo `FeedbackTimelineEvent`

Representa a timeline estilo GitHub.

Campos sugeridos:

- `feedbackId`
- `type`
- `actorType`: `user | admin | agent | system`
- `actorId`
- `actorName`
- `message`
- `metadata`
- `visibility`: `public | admin`
- `createdAt`

Tipos sugeridos:

- `feedback_created`
- `comment_created`
- `plan_requested`
- `plan_created`
- `implementation_requested`
- `agent_started`
- `agent_progress`
- `agent_completed`
- `agent_failed`
- `commit_created`
- `pull_request_created`
- `pull_request_updated`
- `deploy_started`
- `deploy_ready`
- `deploy_failed`
- `changes_requested`
- `approved`
- `merged`
- `cleanup_completed`
- `status_changed`

## Modelo `FeedbackAgentRun`

Representa uma execucao do agente.

Campos sugeridos:

- `feedbackId`
- `iteration`
- `kind`: `plan | implement | iterate | merge`
- `status`: `queued | running | succeeded | failed | cancelled`
- `opencodeSessionId`
- `model`
- `prompt`
- `startedAt`
- `finishedAt`
- `exitCode`
- `errorMessage`
- `worktreePath`
- `branchName`
- `commitSha`
- `pullRequestUrl`

## Modelo `FeedbackDeployment`

Representa um preview publicado.

Campos sugeridos:

- `feedbackId`
- `agentRunId`
- `slug`
- `url`
- `status`: `queued | building | ready | failed | removed`
- `branchName`
- `commitSha`
- `containerName`
- `port`
- `createdAt`
- `removedAt`
- `errorMessage`

## Modelo `FeedbackOpenCodeModelCache`

Cache obrigatório da lista de modelos retornada por `opencode models`. Em produção Docker, a aplicação web não executa o CLI OpenCode; apenas o worker externo atualiza esse cache.

Campos sugeridos:

- `models`: lista normalizada de modelos.
- `rawOutput`: saida bruta para diagnostico administrativo.
- `refreshedAt`
- `errorMessage`

O cache evita executar `opencode models` no container web. A API lê apenas o MongoDB e retorna erro acionável se os modelos ainda não foram sincronizados pelo worker.

## APIs propostas

### Feedback

- `GET /api/feedback`: lista feedbacks.
- `POST /api/feedback`: cria feedback.
- `GET /api/feedback/[id]`: detalhe completo do feedback.
- `PATCH /api/feedback/[id]`: edita dados permitidos.

### Timeline e comentarios

- `GET /api/feedback/[id]/timeline`: lista eventos da timeline.
- `POST /api/feedback/[id]/comments`: adiciona comentario.

### Modelos OpenCode

- `GET /api/feedback/opencode/models`: retorna modelos disponiveis para select administrativo a partir do cache MongoDB.

Contrato sugerido:

```json
{
  "success": true,
  "data": [
    {
      "id": "anthropic/claude-sonnet-4-5",
      "label": "anthropic/claude-sonnet-4-5",
      "provider": "anthropic"
    }
  ]
}
```

### Jobs agenticos

- `POST /api/feedback/[id]/plan`: cria job de planejamento.
- `POST /api/feedback/[id]/implement`: cria job de implementacao.
- `POST /api/feedback/[id]/iterate`: cria job de nova iteracao.
- `POST /api/feedback/[id]/approve`: aprova e cria job de merge.
- `POST /api/feedback/[id]/cancel`: cancela fluxo ou job ativo.

Payloads de planejamento/implementacao/iteracao devem aceitar `model` escolhido pelo admin.

Exemplo:

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "message": "Ajuste o comportamento conforme o comentario do usuario."
}
```

## Transicoes de status

Transicoes devem ser explicitamente validadas.

Exemplos:

- `aberto` -> `planejando`
- `planejando` -> `plano_pronto`
- `plano_pronto` -> `implementando`
- `implementando` -> `aguardando_teste`
- `aguardando_teste` -> `ajustes_solicitados`
- `ajustes_solicitados` -> `implementando`
- `aguardando_teste` -> `aprovado`
- `aprovado` -> `mergeando`
- `mergeando` -> `concluido`
- qualquer estado operacional -> `falhou`
- estados nao finais -> `cancelado`

## Persistencia da sessao OpenCode

O fluxo normal deve persistir somente:

- `opencodeSessionId`
- modelo usado em cada run
- eventos resumidos de timeline
- metadados de execucao

Nao salvar transcript completo no MongoDB por padrao.

Export opcional pode ser adicionado posteriormente com armazenamento em S3/Minio:

- `opencodeExportKey`
- `opencodeExportedAt`
- `opencodeExportSanitized`

## Auditoria

Registrar auditoria para:

- criacao de feedback
- alteracao de status
- solicitacao de plano
- inicio de implementacao
- cancelamento
- aprovacao
- merge
- cleanup manual

## Sanitizacao

Comentarios, plano e eventos gerados por agente podem conter Markdown/HTML.

Antes de renderizar qualquer HTML:

- sanitizar no servidor quando persistir conteudo renderizavel.
- sanitizar no cliente antes de `dangerouslySetInnerHTML`, se necessario.
- preferir renderizador controlado de Markdown quando viavel.
