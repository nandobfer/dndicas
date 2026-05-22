# Task 07 - Layout do DiceRollerPanel na Action

## Objetivo

Melhorar o layout do painel de rolagem usado na aba `Dados`, deixando os controles de combinacao e modificador lado a lado e ampliando a grade de dados.

## Mudancas esperadas

- Em `src/features/dice-roller/components/dice-roller-panel.tsx`, os containers `Combinacao` e `Modificador` devem ficar na mesma linha em duas colunas quando houver espaco.
- Em telas estreitas, esses containers podem empilhar para preservar legibilidade.
- No container `Combinacao`, o texto da combinacao deve ficar centralizado.
- Os botoes de remover/adicionar da combinacao devem ficar nas pontas, seguindo o comportamento visual do container `Modificador`.
- O container `Adicionar dados` deve usar grid de 4 colunas em vez de 3.

## Checklist de implementacao

1. Agrupar `Combinacao` e `Modificador` em um grid responsivo de duas colunas.
2. Ajustar cada linha de combinacao para distribuir controles nas extremidades e valor no centro.
3. Manter estados desabilitados quando vantagem/desvantagem travam o `d20`.
4. Alterar o grid de `Adicionar dados` de 3 para 4 colunas.
5. Validar que o painel continua sem overflow dentro da action `1320x900`.
6. Atualizar testes e snapshots relacionados ao layout, se existirem.

## Criterios de aceite

- `Combinacao` e `Modificador` aparecem lado a lado no desktop.
- O valor da combinacao fica visualmente centralizado.
- Os controles de combinacao ficam nas pontas e continuam acessiveis por `aria-label`.
- `Adicionar dados` mostra os dados em 4 colunas.
- O painel continua funcional no modal geral do dice roller e na action Owlbear.

## Testes obrigatorios

- Teste de renderizacao confirmando que os botoes de adicionar/remover combinacao continuam presentes e acessiveis.
- Teste ou verificacao de classes/layout confirmando o grid de 4 colunas em `Adicionar dados`.
- Teste ou verificacao de classes/layout confirmando o agrupamento responsivo de `Combinacao` e `Modificador`.
