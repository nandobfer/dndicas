# MCP - Fase 1: Leitura Segura do Catálogo

## Objetivo

Implementar a primeira versão do servidor MCP do Dungeons & Dicas como uma camada pública e somente leitura para consulta do catálogo.

Nesta fase, o MCP não autentica usuários, não exige credencial e não executa nenhuma mutação. Ele deve retornar apenas dados públicos do catálogo, equivalentes ao conteúdo ativo que já pode ser consultado por usuários comuns.

## Escopo

Entidades expostas para consulta:

- Regras
- Habilidades
- Talentos
- Raças
- Classes
- Subclasses
- Origens
- Magias
- Itens
- Monstros

Fica fora desta fase:

- Criação, edição ou exclusão de entidades do catálogo
- Dados privados de usuários
- NPCs pessoais
- Fichas de personagem
- Operações da central de feedback
- Execuções agênticas

## Transporte MCP

O servidor MCP deve ser exposto via HTTP/SSE para funcionar em produção dentro do Docker do Dungeons & Dicas.

Local sugerido:

- `src/app/api/mcp/route.ts` ou estrutura equivalente compatível com o SDK MCP usado.

Requisitos técnicos:

- Usar runtime Node.js, não Edge.
- Conectar ao MongoDB antes de consultar modelos Mongoose.
- Não depender de cookies Auth.js para ferramentas públicas.
- Não exigir token, API key ou header de autenticação nesta fase.

## Ferramentas MCP Planejadas

### `search_catalog_entities`

Busca entidades públicas do catálogo usando o serviço unificado existente.

Entrada sugerida:

```json
{
  "query": "bola de fogo",
  "types": ["Magia"],
  "limit": 20,
  "offset": 0,
  "itemTypes": ["arma"],
  "circles": [3],
  "parentClassId": "..."
}
```

Saída sugerida:

```json
{
  "items": [],
  "limit": 20,
  "offset": 0
}
```

Reuso principal:

- `src/features/search/api/unified-search-service.ts`
- `searchUnifiedEntities()`

### `get_catalog_entity`

Retorna o detalhe público de uma entidade específica.

Entrada sugerida:

```json
{
  "type": "Magia",
  "id": "..."
}
```

Comportamento esperado:

- Buscar no modelo correspondente ao tipo.
- Retornar somente entidades `status: "active"`.
- Retornar erro amigável em pt-BR quando não encontrar a entidade.
- Normalizar `_id` e `id` como string.

### `list_catalog_entity_types`

Retorna os tipos de entidade suportados pelo MCP.

Saída sugerida:

```json
{
  "types": ["Regra", "Habilidade", "Talento", "Raça", "Classe", "Subclasse", "Origem", "Magia", "Item", "Monstro"]
}
```

### `list_catalog_sources`

Opcional. Retorna fontes disponíveis por tipo de entidade.

Entrada sugerida:

```json
{
  "type": "Monstro"
}
```

Pode reutilizar o comportamento de `/api/sources` quando aplicável, desde que preserve o recorte público.

## Modelo de Dados e Normalização

A resposta do MCP deve ter contrato próprio, estável e independente das inconsistências históricas das rotas REST atuais.

Campos mínimos para resultados de busca:

- `id`
- `name`
- `originalName`
- `type`
- `description`
- `source`
- `metadata`

Campos de detalhe devem preservar os dados úteis da entidade, mas sem expor campos internos desnecessários do Mongoose.

## Regras de Visibilidade

O MCP público deve retornar apenas entidades públicas.

Regra padrão:

- Entidades com `status: "active"` são públicas.
- Entidades `inactive` não devem aparecer em busca nem detalhe.
- Se um módulo não tiver campo `status`, revisar explicitamente antes de expor.

## Segurança

Mesmo sem autenticação, a fase de leitura precisa aplicar limites.

Regras sugeridas:

- Limitar `limit` por ferramenta, com teto inicial de 50.
- Validar inputs com Zod.
- Não aceitar seleção arbitrária de coleção/modelo pelo cliente.
- Não executar filtros MongoDB enviados diretamente pelo cliente.
- Registrar erros no servidor sem expor stack trace no retorno MCP.

## Performance

A busca unificada atual carrega entidades ativas de vários modelos e aplica fuzzy search em memória. Isso é suficiente para a primeira fase, mas precisa de observação em produção.

Riscos:

- Muitos agentes consultando simultaneamente podem pressionar MongoDB e memória.
- Consultas vazias muito amplas podem retornar listas grandes.

Mitigações iniciais:

- Exigir `query` ou filtro específico para busca ampla, como o serviço atual já faz.
- Limitar paginação.
- Evitar carregar detalhes completos na busca; detalhe fica em `get_catalog_entity`.

## Testes Planejados

Coberturas mínimas:

- Busca retorna apenas entidades ativas.
- Busca sem query e sem escopo retorna vazio.
- Filtro por tipo retorna apenas o tipo solicitado.
- Detalhe de entidade inativa retorna não encontrado.
- Inputs inválidos retornam erro estruturado.

## Critério de Pronto

- Endpoint MCP HTTP/SSE disponível em desenvolvimento e Docker.
- Ferramentas públicas de catálogo funcionando sem autenticação.
- Nenhuma ferramenta de mutação exposta para catálogo.
- Respostas em pt-BR para erros acionáveis.
- Testes focados cobrindo busca, detalhe e validação.
