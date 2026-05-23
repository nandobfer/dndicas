# Task 06 - Console Log de Player ID Incluindo o Jogador Atual

## Objetivo

Corrigir o log de mapeamento de jogadores do Owlbear para incluir tambem o proprio jogador atual, alem dos demais jogadores retornados pela party.

## Mudancas esperadas

- O `console.table` deve sempre conter uma linha para o jogador atual.
- A tabela deve combinar dados de `sdk.player` e `sdk.party.getPlayers()`.
- O formato da tabela permanece `{ id, name, role }`.
- Jogadores duplicados devem ser deduplicados por `id`.
- O log deve continuar acontecendo uma vez por sala, como hoje.

## Checklist de implementacao

1. Buscar `playerName`, `playerId` e `playerRole` do jogador atual via `sdk.player`.
2. Buscar `partyPlayers` via `sdk.party.getPlayers()`.
3. Criar uma lista iniciando pelo jogador atual e acrescentando os jogadores da party.
4. Deduplicar por `id`, preservando o registro do jogador atual quando houver conflito.
5. Renderizar `console.table` com `{ id, name, role }`.
6. Manter tratamento de erro atual para falhas ao carregar jogadores da party.

## Criterios de aceite

- Quando `sdk.party.getPlayers()` nao retorna o jogador atual, ele ainda aparece no log.
- Quando `sdk.party.getPlayers()` ja retorna o jogador atual, ele aparece apenas uma vez.
- O log continua util para copiar `playerId` em comandos de override.

## Testes obrigatorios

- Teste do hook do console API onde `party.getPlayers()` retorna apenas outros jogadores e a tabela inclui o jogador atual.
- Teste onde a party ja contem o jogador atual e a tabela nao duplica a linha.
- Teste mantendo o formato das colunas `id`, `name` e `role`.
