# Task 08 - Limpeza da Aba Dados e Historico de Rolagens

## Objetivo

Simplificar a aba `Dados` e refinar os cards do historico compartilhado para reduzir ruido visual e destacar melhor a combinacao e os resultados.

## Mudancas esperadas

- Remover o header da aba `Dados` que hoje exibe:

```txt
Dados da sala

Todos na sala veem a mesma rolagem em tempo real e compartilham o mesmo historico recente.
```

- Na secao de historico, trocar o titulo para apenas `HISTORICO`.
- Remover a descricao abaixo do titulo do historico.
- Nos cards de historico, nao exibir `Normal` quando a rolagem for padrao.
- Exibir apenas `Vantagem` ou `Desvantagem` quando o modo exigir.
- Mover o chip da formula/combinacao usada para a linha do nome do jogador.
- Manter os chips de resultados dos dados abaixo.
- Colorir os chips de resultado conforme `diceColors` e `colors.rarity` de `src/lib/config/colors.ts`.

## Checklist de implementacao

1. Remover o bloco de header da aba `Dados`.
2. Decidir o posicionamento do aviso de ultima rolagem compartilhada apos a remocao do header e preservar se continuar util.
3. Alterar o titulo do historico para `HISTORICO`.
4. Remover a descricao de cache das 50 rolagens.
5. Ajustar a linha de metadados do card para omitir texto quando `mode === "normal"`.
6. Renderizar critico/falha critica sem depender do texto `Normal`.
7. Mover o chip de formula para junto do nome do jogador.
8. Aplicar cores por tipo de dado nos chips de resultado usando a configuracao central de cores.
9. Garantir que chips de descartado em vantagem/desvantagem tenham estilo coerente e nao confundam o resultado mantido.

## Criterios de aceite

- A aba `Dados` nao mostra mais o titulo e descricao removidos.
- A lateral mostra apenas o titulo `HISTORICO` antes da lista.
- Rolagens normais nao mostram nenhum label de modo.
- Rolagens com vantagem/desvantagem continuam mostrando o modo.
- A formula usada aparece ao lado do nome do jogador.
- Cada chip de resultado usa cor compativel com seu dado (`d20`, `d4`, `d6`, `d8`, `d10`, `d12`, `d100`).

## Testes obrigatorios

- Teste da aba `Dados` garantindo ausencia do header removido.
- Teste garantindo titulo `HISTORICO` e ausencia da descricao antiga.
- Teste de card normal garantindo que `Normal` nao aparece.
- Teste de card com vantagem/desvantagem garantindo que o modo aparece.
- Teste garantindo que a formula aparece junto ao nome do jogador.
- Teste garantindo aplicacao de classes/estilos derivados de `diceColors` nos chips de resultado.
