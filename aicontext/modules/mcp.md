# Módulo: MCP

## Objetivo

Expor um servidor Model Context Protocol do Dungeons & Dicas para agentes consultarem dados do projeto por ferramentas sem depender da UI.

## Fase 1: Catálogo Público Somente Leitura

A primeira fase implementa um MCP HTTP/SSE público para consulta de entidades ativas do catálogo.

Ferramentas disponíveis:

- `list_catalog_entity_types`: lista os tipos suportados.
- `search_catalog_entities`: busca entidades públicas usando a busca unificada server-side.
- `get_catalog_entity`: consulta o detalhe público de uma entidade ativa por tipo e ID.

## Regras

- A fase 1 não exige autenticação, token, Auth.js ou cookies.
- A fase 1 não expõe mutações de catálogo.
- A fase 1 não expõe feedbacks, fichas, NPCs pessoais ou dados privados de usuários.
- Apenas entidades com `status: "active"` devem aparecer em detalhe.
- A busca reutiliza `src/features/search/api/unified-search-service.ts`.

## Fase 2: Token Permanente no Perfil

Usuários autenticados podem gerar um token MCP permanente na página `/profile` para configurar clientes MCP externos.

Regras do token:

- O token usa o formato `dndicas_mcp_<segredo>`.
- O segredo completo é retornado apenas no `POST /api/auth/profile/mcp-token` e exibido uma única vez no perfil.
- O MongoDB salva apenas o hash SHA-256 do token completo e metadados mascarados (`mcpTokenPrefix`, `mcpTokenSuffix`, `mcpTokenCreatedAt`, `mcpTokenLastUsedAt`).
- `GET /api/auth/profile` nunca retorna o segredo completo nem o hash.
- `DELETE /api/auth/profile/mcp-token` revoga imediatamente o token removendo hash e metadados do usuário.
- O token não cria cookie nem sessão Auth.js; na fase operacional, o MCP deve resolver `Authorization: Bearer <token>` diretamente para o `User._id.toString()` canônico e preservar permissões atuais.
- Operações de criação e exclusão do token registram auditoria como entidade `McpToken`.

## Fase 3: Feedback Operacional

O MCP expõe a central de feedback para consulta pública e operações autenticadas por token permanente.

Ferramentas públicas:

- `list_feedbacks`: lista feedbacks com filtros e retorno sanitizado.
- `get_feedback`: consulta detalhe público; com token válido retorna campos adicionais conforme permissão.
- `get_feedback_timeline`: consulta apenas eventos públicos; com token admin inclui eventos `visibility: "admin"`.

Ferramentas protegidas por token MCP:

- `create_feedback`: cria feedback em nome do usuário autenticado pelo token.
- `update_feedback`: atualiza feedback conforme permissões atuais; usuário comum não altera `status` nem `priority`.
- `comment_feedback`: adiciona comentário público à timeline.

Ferramentas restritas a admin:

- `request_feedback_plan`: enfileira planejamento agêntico.
- `request_feedback_implementation`: enfileira implementação agêntica.
- `request_feedback_iteration`: enfileira iteração agêntica.
- `approve_feedback_merge`: aprova feedback para merge quando houver PR.

Regras operacionais:

- Chamadas protegidas usam `Authorization: Bearer dndicas_mcp_...`; token por query string não é aceito.
- Consultas públicas não retornam `creatorEmail`, `worktreePath`, `opencodeSessionId` ou prompts de runs.
- Ferramentas agênticas apenas enfileiram jobs; o worker externo continua executando OpenCode fora do web container.
- Usuário comum com token não pode solicitar plano, implementação, iteração ou aprovação.

## Estrutura

- `src/app/api/mcp/route.ts`: endpoint HTTP/SSE MCP em runtime Node.js.
- `src/features/mcp/server/server.ts`: criação do servidor MCP.
- `src/features/mcp/server/catalog-tools.ts`: registro das ferramentas de catálogo.
- `src/features/mcp/server/catalog-entity-service.ts`: busca e detalhe das entidades públicas.
- `src/features/mcp/server/catalog-schemas.ts`: schemas Zod e tipos suportados.
- `src/features/mcp/server/mcp-token-service.ts`: geração, hash e serialização segura do token MCP.
- `src/features/mcp/server/mcp-auth-service.ts`: resolução de `Authorization: Bearer` para usuário local ativo.
- `src/features/mcp/server/feedback-tools.ts`: registro das ferramentas MCP de feedback.
- `src/features/mcp/server/feedback-service.ts`: operações de feedback com permissões e side effects preservados.
- `src/features/mcp/server/feedback-schemas.ts`: validação Zod dos inputs de feedback.
- `src/features/mcp/server/feedback-serializers.ts`: sanitização de feedbacks, timeline e runs para respostas MCP.
- `src/app/api/auth/profile/mcp-token/route.ts`: geração/rotação e revogação do token MCP autenticado por Auth.js.

## Testes

Os testes focados ficam em `tests/backend/mcp/` e validam busca, detalhe, limitação de inputs, autenticação por token, sanitização pública e permissões de feedback.
