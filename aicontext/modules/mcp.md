# Módulo: MCP

## Objetivo

Servidor Model Context Protocol HTTP/SSE em `/api/mcp`, runtime Node.js, para consulta
pública de entidades ativas do catálogo. Não expõe fichas, NPCs pessoais ou dados privados.

## Ferramentas disponíveis

- `list_catalog_entity_types`: tipos suportados.
- `search_catalog_entities`: busca unificada server-side de entidades públicas.
- `get_catalog_entity`: detalhe público de entidade ativa.

As ferramentas de catálogo não exigem token e não permitem mutações.
O antigo conjunto operacional de feedback foi removido na v4: a central agora é externa
(ver `opex-feedback.md`). Não há registro de ferramentas de feedback no servidor MCP.

## Token permanente no perfil

Usuários autenticados podem gerar um token em `/profile`. A infraestrutura de token permanece
disponível, independentemente da remoção das ferramentas operacionais antigas.

- Formato `dndicas_mcp_<segredo>`; valor completo apenas no POST de geração e uma única exibição.
- MongoDB guarda só SHA-256 e metadados mascarados (`mcpTokenPrefix`, `mcpTokenSuffix`,
  `mcpTokenCreatedAt`, `mcpTokenLastUsedAt`). GET do perfil nunca retorna hash ou segredo.
- DELETE revoga removendo hash/metadados. Geração/rotação e revogação registram auditoria.
- Resolução de Bearer usa usuário local ativo e ID canônico `User._id.toString()`; não cria
  cookie Auth.js nem aceita token por query string.

## Estrutura e testes

`src/features/mcp/server/server.ts`, `catalog-tools.ts`, `catalog-entity-service.ts`,
`catalog-schemas.ts`, `mcp-token-service.ts`, `mcp-auth-service.ts`;
`src/app/api/auth/profile/mcp-token/route.ts` protege geração/revogação com Auth.js.
Testes focados em `tests/backend/mcp/`: busca, detalhe, inputs e autenticação por token.
