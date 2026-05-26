# Task 03 - NpcParam, Sentidos e Defesas

## Objetivo

Centralizar as listas narrativas de monstro em componentes reutilizaveis e substituir campos soltos de sentidos/idiomas por `NpcParam`.

## Mudancas esperadas

- Criar `NpcParamFormField` com input `Nome` e `RichTextEditor` para descricao.
- Criar `NpcParamFormList` com adicionar/remover e cores configuraveis por lista.
- A prop `attack` deve exibir `bonus de ataque` e `rolagem de dano`.
- A prop `customValue` com `customValueLabel` deve atender `usos lendarios` e `iniciativa do covil`.
- Sentidos e idiomas devem ser uma lista de `NpcParam`.
- Vulnerabilidades, resistencias e imunidades devem aparecer em um unico container por tipo de dano.
- Cada tipo de dano deve usar `GlassSelector` com V, R e I, explicados por tooltip.
- Imunidade a condicoes deve ser autocomplete multiselect.

## Checklist de implementacao

1. Implementar `NpcParamFormField`.
2. Implementar `NpcParamFormList`.
3. Adicionar suporte opcional a ataques no field.
4. Adicionar suporte a valor customizado na lista.
5. Criar seletor consolidado de defesas por tipo de dano.
6. Remover campos individuais de sentidos e idiomas do formulario.
7. Renderizar imunidade a condicoes apenas como autocomplete.

## Criterios de aceite

- Acoes, reacoes, acoes bonus, tracos, lendarias, covil e efeitos regionais usam o mesmo componente de lista.
- O mesmo tipo de dano nao fica simultaneamente como vulneravel, resistente e imune.
- Sentidos e idiomas aceitam descricao rica.
- Listas com ataque aceitam bonus numerico e rolagem textual de dano.

## Testes obrigatorios

- Teste de edicao preservando `NpcParam`.
- Lint focado nos novos componentes.
- Validacao de schema para `sensesAndLanguages`.
