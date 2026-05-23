# Task 05 - Action Owlbear com Tamanho Fixo

## Objetivo

Fixar a action do Owlbear em `1320x900` para todas as abas e modos de visualizacao, removendo qualquer resize dinamico em runtime.

## Mudancas esperadas

- A action deve abrir e permanecer sempre com `width: 1320` e `height: 900`.
- O manifest continua declarando o tamanho da action como `1320x900`.
- A shell da action deixa de chamar resize ao trocar entre `Catalogo`, `Dados`, `Ficha`, `Fichas` ou `NPCs`.
- O modo `Ficha` nao altera mais o tamanho entre picker e editor.
- Helpers e constantes de tamanho por aba devem ser removidos ou simplificados para uma unica constante de tamanho fixo.

## Checklist de implementacao

1. Substituir o mapa de tamanhos por aba por uma constante unica, se ainda for util para o manifest.
2. Remover a funcao que chama `sdk.action.setWidth` e `sdk.action.setHeight`.
3. Remover da shell os efeitos e callbacks que redimensionam a action por aba.
4. Remover a dependencia entre `sheetViewMode` e tamanho da action.
5. Ajustar tipos de SDK mockados se `action.setWidth` e `action.setHeight` deixarem de ser usados pelo codigo de producao.
6. Atualizar testes que esperam resize dinamico.

## Criterios de aceite

- Abrir qualquer aba mantem a action em `1320x900`.
- Alternar entre picker e editor da aba `Ficha` nao dispara resize.
- Nenhum codigo de producao chama `sdk.action.setWidth` ou `sdk.action.setHeight`.
- O manifest da action ainda informa `width: 1320` e `height: 900`.

## Testes obrigatorios

- Teste da shell confirmando que alternar abas nao chama setters de tamanho.
- Teste do manifest confirmando `width: 1320` e `height: 900`, se ja houver cobertura para o endpoint.
- Atualizacao dos testes existentes que hoje esperam chamadas como `setWidth(980)`, `setWidth(1180)` ou `setWidth(1320)` em troca de aba.
