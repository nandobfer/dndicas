# Modulo: Seed Data

## Objetivo

Os scripts em `scripts/seed-data/` importam datasets externos, traduzem conteudo quando necessario e persistem entidades da aplicacao com suporte a retomada por progresso salvo.

## Arquitetura

- `scripts/seed-data/index.ts` coordena a execucao dos providers e o modo de teste.
- `scripts/seed-data/base-provider.ts` concentra loop automatico, retomada por indice, revisao e persistencia.
- `scripts/seed-data/providers/*.ts` transformam cada dataset externo no formato interno da aplicacao.

## Regras Importantes

- Providers devem tratar payloads externos como dados heterogeneos; nao assuma que campos opcionais de arrays realmente virao sempre como array.
- Em `scripts/seed-data/providers/monsters-provider.ts`, o merge de fluff de monstros precisa normalizar `_copy._mod.entries.items` e `_copy._mod.images.items` para array antes de usar spread, porque o dataset do 5etools pode enviar item unico ou lista.
- Em `scripts/seed-data/providers/monsters-provider.ts`, saves e skills de monstros devem aceitar apenas overrides simples string/numero; chaves estruturadas do 5etools, como `skill.other`, precisam ser ignoradas sem interromper o seed.
- A ordem atual do merge de fluff de monstros e: itens de `_mod`, depois fluff direto do monstro, depois fluff base do `_copy`.
- Falhas em modo automatico devem ser reproduziveis pelo indice salvo, para que o seed possa retomar do ponto de parada apos a correcao.

## Testes

- Cobertura de seed data fica em `tests/scripts/seed-data/`.
- Sempre cubra casos reais do dataset quando um provider precisar normalizar formatos inconsistentes.
- Para `MonstersProvider`, inclua testes para fluff direto e para `_copy._mod` com item unico e com array.
- Para saves/skills de monstros, inclua regressao para payloads estruturados que nao mapeiam override simples.
