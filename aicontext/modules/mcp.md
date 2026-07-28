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

## Estrutura

- `src/app/api/mcp/route.ts`: endpoint HTTP/SSE MCP em runtime Node.js.
- `src/features/mcp/server/server.ts`: criação do servidor MCP.
- `src/features/mcp/server/catalog-tools.ts`: registro das ferramentas de catálogo.
- `src/features/mcp/server/catalog-entity-service.ts`: busca e detalhe das entidades públicas.
- `src/features/mcp/server/catalog-schemas.ts`: schemas Zod e tipos suportados.
- `src/features/mcp/server/mcp-token-service.ts`: geração, hash e serialização segura do token MCP.
- `src/app/api/auth/profile/mcp-token/route.ts`: geração/rotação e revogação do token MCP autenticado por Auth.js.

## Testes

Os testes focados ficam em `tests/backend/mcp/` e validam busca, detalhe, limitação de inputs e visibilidade pública.
