# Task 01 - Filtros e Acoes do Catalogo

## Objetivo

Alinhar a tela do catalogo de monstros com os filtros e a acao principal esperados para a nova entidade.

## Mudancas esperadas

- O filtro de CR deve ser string com mascara, aceitando apenas numeros e `/`.
- Os filtros de tipo e tamanho devem usar autocomplete multiselect, no mesmo comportamento do filtro de fontes.
- A primeira linha dos filtros deve ter busca textual na esquerda, status na direita e fontes imediatamente a esquerda de status.
- A segunda linha deve conter tipo, tamanho e CR.
- O botao `Novo Monstro` deve usar o mesmo azul do botao `Nova Regra`.
- O menu lateral expansivel deve incluir a entrada `Monstros` em `src/components/ui/expandable-sidebar.tsx`.

## Checklist de implementacao

1. Atualizar o estado de filtros para `type` e `size` como arrays.
2. Serializar `type` e `size` como listas na chamada da API.
3. Aplicar `$in` no backend para filtros de tipo e tamanho.
4. Criar ou reutilizar um autocomplete multiselect com busca local.
5. Aplicar mascara de CR no input dos filtros.
6. Ajustar as classes do botao principal para o azul de regras.
7. Adicionar o link `Monstros` ao menu de navegacao em `expandable-sidebar.tsx`, apontando para a rota do catalogo.

## Criterios de aceite

- O usuario consegue filtrar por multiplos tipos e tamanhos.
- O CR nao aceita caracteres fora de numeros e `/`.
- O layout dos filtros preserva a hierarquia visual especificada.
- O botao principal nao usa mais a cor vermelha de monstros.
- A sidebar exibe `Monstros` e navega para o catalogo correto.

## Testes obrigatorios

- Teste de backend confirmando `$in` para tipo e tamanho.
- Teste de frontend ou cobertura existente garantindo submissao/listagem sem regressao.
- Lint focado em `src/features/monsters`.
