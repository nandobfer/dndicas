# Task 04 - Preview, Tabela e Contratos

## Objetivo

Atualizar a leitura da entidade para refletir os novos contratos do formulario e manter compatibilidade com dados antigos.

## Mudancas esperadas

- `MonsterPreview` deve renderizar `sensesAndLanguages` via `NpcParamPreview`.
- Dados antigos de `senses` e `languages` podem continuar aparecendo como fallback.
- Velocidade ausente deve aparecer como `—` no preview e na tabela.
- `challengeRating` deve ser string em todo o dominio.
- XP deve continuar derivado do CR textual.
- API, modelo Mongoose e tipos TypeScript devem incluir `sensesAndLanguages`.

## Checklist de implementacao

1. Atualizar tipos de monstro.
2. Atualizar schema Zod e modelo Mongoose.
3. Ajustar preview para `sensesAndLanguages`.
4. Manter fallback de sentidos/idiomas legados.
5. Ajustar tabela para velocidade opcional.
6. Atualizar testes de backend e frontend para os novos contratos.

## Criterios de aceite

- Monstros novos usam listas ricas para sentidos e idiomas.
- Monstros antigos ainda exibem sentidos/idiomas simples.
- A tabela nao mostra celula vazia para velocidade removida.
- A API aceita CR fracionario em string.

## Testes obrigatorios

- `npm test -- --run tests/frontend/monsters tests/backend/catalogs/monsters-routes.test.ts`
- Lint focado em monstros.
- Checagem de tipos filtrada para arquivos de monstros.
