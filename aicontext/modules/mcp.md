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

## Estrutura

- `src/app/api/mcp/route.ts`: endpoint HTTP/SSE MCP em runtime Node.js.
- `src/features/mcp/server/server.ts`: criação do servidor MCP.
- `src/features/mcp/server/catalog-tools.ts`: registro das ferramentas de catálogo.
- `src/features/mcp/server/catalog-entity-service.ts`: busca e detalhe das entidades públicas.
- `src/features/mcp/server/catalog-schemas.ts`: schemas Zod e tipos suportados.

## Testes

Os testes focados ficam em `tests/backend/mcp/` e validam busca, detalhe, limitação de inputs e visibilidade pública.
