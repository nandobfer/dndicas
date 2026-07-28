# MCP - Fase 3: Feedback Operacional com Token

## Objetivo

Expandir o servidor MCP para consultar e operar a central de feedback.

Consulta de feedbacks deve ser pública. Mutações, comentários e execuções agênticas devem exigir token MCP permanente criado na fase 2.

As permissões atuais do sistema devem ser preservadas:

- Usuário comum autenticado por token pode criar feedback, comentar e editar o que já é permitido pelas APIs atuais.
- Admin autenticado por token pode alterar status/prioridade e solicitar plano, implementação, iteração e aprovação.
- Usuário comum com token não pode solicitar plano, implementação, iteração ou aprovação.

## Escopo

Consultas públicas:

- Listar feedbacks.
- Consultar detalhe de feedback.
- Consultar timeline pública.

Operações protegidas por token:

- Criar feedback.
- Atualizar feedback conforme permissão.
- Comentar feedback.
- Solicitar plano agêntico.
- Solicitar implementação agêntica.
- Solicitar iteração agêntica.
- Aprovar merge quando aplicável.

Fica fora desta fase:

- Execução direta do OpenCode dentro do endpoint MCP.
- Gestão de worktrees pelo endpoint MCP.
- Alteração das permissões de negócio existentes.
- Mutação de entidades do catálogo.

## Autenticação MCP

Chamadas protegidas devem enviar:

```http
Authorization: Bearer dndicas_mcp_...
```

Fluxo de autenticação:

1. Extrair token do header `Authorization`.
2. Validar prefixo esperado.
3. Calcular hash SHA-256 do token completo.
4. Buscar usuário ativo com `mcpTokenHash` correspondente.
5. Recusar usuário deletado, inativo ou inexistente.
6. Montar contexto MCP com `userId`, `role`, `name`, `email`.
7. Atualizar `mcpTokenLastUsedAt` com janela de touch para evitar escrita em toda chamada.

Serviço sugerido:

- `src/features/mcp/server/mcp-auth-service.ts`

Contrato interno sugerido:

```ts
type McpAuthContext = {
  userId: string
  username: string
  name: string | null
  email: string
  role: "admin" | "user"
}
```

## Ferramentas Públicas de Feedback

### `list_feedbacks`

Lista feedbacks com filtros.

Entrada sugerida:

```json
{
  "search": "owlbear",
  "status": "pendente",
  "priority": "alta",
  "type": "bug",
  "page": 1,
  "limit": 20
}
```

Resposta pública não deve expor dados sensíveis desnecessários.

Campos sugeridos:

- `id`
- `title`
- `description`
- `type`
- `status`
- `priority`
- `developmentStatus`
- `creatorName`
- `createdAt`
- `updatedAt`
- `pullRequestUrl` quando público
- `previewUrl` quando público

Não retornar em consulta pública:

- `creatorEmail`
- `worktreePath`
- prompts de agente
- eventos admin

### `get_feedback`

Consulta detalhe público do feedback.

Sem token:

- Retorna campos públicos.

Com token válido:

- Pode retornar campos adicionais conforme usuário e role.
- Admin pode ver metadados administrativos.
- Usuário comum só deve ver dados sensíveis se for dono e isso já for permitido no produto.

### `get_feedback_timeline`

Consulta timeline do feedback.

Sem token:

- Retorna apenas eventos `visibility: "public"`.

Com token admin:

- Pode incluir eventos `visibility: "admin"`.

Reuso obrigatório:

- `listFeedbackTimelineEvents(feedbackId, { includeAdminEvents })`

## Ferramentas Protegidas de Feedback

### `create_feedback`

Cria feedback em nome do usuário autenticado pelo token MCP.

Entrada sugerida:

```json
{
  "title": "Corrigir busca de magias",
  "description": "A busca não encontra termos acentuados.",
  "type": "bug"
}
```

Regras:

- Exige token.
- Usa `userId` do token como `createdBy`.
- Cria evento `feedback_created`.
- Registra auditoria.
- Usuário comum não define status/prioridade na criação.
- Admin pode definir campos administrativos se esse comportamento for mantido igual à API atual.

### `update_feedback`

Atualiza feedback conforme permissões atuais.

Regras:

- Exige token.
- Dono ou admin pode editar campos permitidos.
- Usuário comum não altera `status` nem `priority`.
- Admin pode alterar `status` e `priority`.
- Mudança manual de status deve gerar evento `status_changed`.
- Registrar auditoria.

### `comment_feedback`

Adiciona comentário público à timeline.

Regras:

- Exige token.
- Valida mensagem com limite atual.
- Usa `createFeedbackTimelineEvent()` para preservar truncamento e Pusher.
- Atualiza `updatedAt` do feedback.
- Registra auditoria.

### `request_feedback_plan`

Solicita planejamento agêntico.

Regras:

- Exige token de usuário admin.
- Preserva as mesmas regras de `POST /api/feedback/[id]/plan`.
- Valida `model` e `message`.
- Bloqueia se `hasActiveFeedbackAgentRun(id)` retornar verdadeiro.
- Usa `queueFeedbackPlan()`.
- Não executa OpenCode diretamente.

### `request_feedback_implementation`

Solicita implementação agêntica.

Regras:

- Exige token de usuário admin.
- Preserva as mesmas regras de `POST /api/feedback/[id]/implement`.
- Usa `buildFeedbackImplementationPrompt()`.
- Usa `queueFeedbackAgentRun()` com `kind: "implement"`.
- Não executa OpenCode diretamente.

### `request_feedback_iteration`

Solicita ajuste/iteração agêntica.

Regras:

- Exige token de usuário admin.
- Preserva as mesmas regras de `POST /api/feedback/[id]/iterate`.
- Mensagem é obrigatória.
- Usa `buildFeedbackIterationPrompt()`.
- Usa `queueFeedbackAgentRun()` com `kind: "iterate"`.

### `approve_feedback_merge`

Aprova feedback para merge quando houver PR.

Regras:

- Exige token de usuário admin.
- Preserva as mesmas regras de `POST /api/feedback/[id]/approve`.
- Exige `pullRequestNumber` existente.
- Bloqueia se houver execução ativa.
- Usa `queueFeedbackAgentRun()` com `kind: "merge"`.

## Reuso de Serviços Existentes

Serviços/modelos a reutilizar:

- `src/features/feedback/api/feedback.model.ts`
- `src/features/feedback/api/feedback-timeline-event.model.ts`
- `src/features/feedback/api/feedback-agent-run.model.ts`
- `src/features/feedback/services/feedback-timeline-service.ts`
- `src/features/feedback/services/feedback-agent-run-service.ts`
- `src/features/feedback/services/feedback-agent-prompt-service.ts`
- `src/core/database/audit-log` ou serviço de auditoria já usado pela rota correspondente

Não duplicar lógica de side effects:

- Timeline deve passar por `createFeedbackTimelineEvent()`.
- Runs devem passar por `queueFeedbackPlan()` ou `queueFeedbackAgentRun()`.
- Concorrência deve passar por `hasActiveFeedbackAgentRun()`.

## Segurança

Regras obrigatórias:

- Validar todos os argumentos MCP com Zod.
- Não aceitar token em query string.
- Não retornar hash do token.
- Não expor `worktreePath` publicamente.
- Não expor `creatorEmail` publicamente.
- Não retornar prompts completos de runs em consultas públicas.
- Tratar texto de usuário como não confiável em prompts agênticos, preservando as proteções já existentes.
- Não executar comandos, builds ou OpenCode no request MCP.

## Docker e Produção

Em produção, o endpoint MCP roda dentro do web container.

Isso significa:

- Pode consultar MongoDB.
- Pode enfileirar runs de feedback.
- Não deve depender de OpenCode CLI instalado no container.
- O worker externo continua responsável por processar jobs agênticos.

Essa separação preserva a arquitetura já definida para feedback agêntico.

## Respostas e Erros

Mensagens acionáveis devem ficar em pt-BR.

Erros comuns:

- Token ausente: `Token MCP obrigatório para esta operação.`
- Token inválido: `Token MCP inválido ou revogado.`
- Permissão insuficiente: `Você não tem permissão para executar esta ação.`
- Feedback inexistente: `Feedback não encontrado.`
- Execução ativa: `Já existe uma execução agêntica em andamento para este feedback.`

## Testes Planejados

Cobertura mínima:

- Consulta pública lista feedbacks sem token.
- Consulta pública não retorna `creatorEmail`.
- Timeline pública não retorna eventos admin.
- Token válido autentica usuário ativo.
- Token inválido/revogado é recusado.
- Usuário comum com token consegue criar e comentar feedback.
- Usuário comum com token não consegue solicitar plano/implementação/iteração/aprovação.
- Admin com token consegue solicitar plano.
- Admin com token não consegue solicitar nova execução se houver run ativa.
- Comentário criado via MCP gera timeline e auditoria.

## Critério de Pronto

- Ferramentas públicas de feedback funcionam sem token e com dados sanitizados.
- Ferramentas protegidas exigem token MCP.
- Permissões atuais são preservadas.
- Runs agênticas são apenas enfileiradas.
- Worker continua responsável pela execução em produção.
- Testes focados cobrem autenticação, autorização e principais ferramentas.
