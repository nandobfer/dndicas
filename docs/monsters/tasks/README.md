# Tasks do Catalogo de Monstros

Este diretorio organiza os ajustes do modulo de monstros em entregas executaveis e verificaveis.

## Ordem recomendada

1. `01-filtros-e-acoes-do-catalogo.md`
2. `02-formulario-ficha-de-monstro.md`
3. `03-npc-param-e-defesas.md`
4. `04-preview-tabela-e-contratos.md`

## Convencoes

- Cada task deve ser implementavel sem novas decisoes de produto.
- O formulario deve seguir visualmente a ficha de personagem e os formularios de itens/magias ja existentes.
- Campos numericos editaveis devem manter mascara em string na UI e coerção apenas no schema/API quando o dominio exigir numero.
- Listas narrativas de monstro devem reutilizar `NpcParamFormList` e `NpcParamPreview`.

## Testes obrigatorios do pacote

- `npm test -- --run tests/frontend/monsters tests/backend/catalogs/monsters-routes.test.ts`
- `npx eslint src/features/monsters src/app/api/monsters src/app/api/stats/monsters 'src/app/(dashboard)/monsters' 'src/app/(dashboard)/_components/monsters-entity-card.tsx'`
- Checagem de tipos filtrada para monstros enquanto o projeto ainda tiver erros globais preexistentes.
