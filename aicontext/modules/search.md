# Módulo: Busca Unificada

## Objetivo

Centralizar a busca de entidades no servidor para evitar pré-carregamento e indexação de grandes catálogos no navegador.

## Estrutura

- `src/app/api/search/route.ts`: endpoint unificado de busca.
- `src/features/search/api/unified-search-service.ts`: consulta entidades ativas no MongoDB, normaliza para `UnifiedEntity`, aplica filtros e fuzzy search no servidor.
- `src/core/utils/unified-search-client.ts`: cliente leve usado por componentes client-side para chamar `/api/search`.

## Fluxos Atendidos

- Busca global (`useGlobalSearch`).
- Menções do editor (`suggestion.ts` e `mention-list.tsx`).
- Fallback de busca sem provider em `GlassEntityChooser`.

## Contrato da API

`GET /api/search` aceita:

- `q` ou `query`: texto de busca.
- `limit`: máximo de resultados, limitado a 50.
- `offset`: paginação.
- `type`: tipo único de entidade.
- `types`: lista separada por vírgula.
- `itemTypes`: lista separada por vírgula.
- `circles`: círculos de magia separados por vírgula.
- `parentClassId`: filtro de subclasse.

Resposta:

```json
{
  "items": []
}
```

## Decisão de Performance

O dashboard não deve aquecer o cache completo de entidades no cliente. A busca deve acontecer sob demanda no servidor, retornando apenas os resultados necessários para a interação atual.
