# Task 10 — Context Menu de Vinculo com Personagem, NPC e Barras de Vida

## Objetivo

Evoluir o fluxo atual de vinculo de token do Owlbear para separar claramente dois caminhos no `contextMenu`:

- `Vincular a personagem`;
- `Vincular a NPC`.

Essa etapa tambem deve substituir o overlay textual atual por uma barrinha de vida visual, respeitando as regras de visibilidade para personagem e NPC.

## Contexto atual

Hoje a base ja entrega:

- aba `Fichas` do GM;
- vinculo de token com ficha de jogador;
- `contextMenu` com `Vincular ficha` e `Desvincular ficha`;
- overlay textual simples de HP e HP temporario;
- placeholder de aba `NPCs` em `src/features/owlbear/owlbear-shell.tsx`.

Esta task parte desse baseline e redefine a evolucao do menu de contexto.

## Escopo funcional

### Entregaveis de produto

- O `contextMenu` do token passa a expor `Vincular a personagem`.
- Esse item abre uma lista das fichas de jogador ja vinculadas a sala.
- Selecionar uma personagem cria ou atualiza uma barrinha de vida acima do token.
- A barrinha usa os valores atual e maximo da ficha vinculada.
- A barrinha de personagem fica visivel para todos na mesa.
- O `contextMenu` do token tambem passa a expor `Vincular a NPC`.
- Esse item abre uma lista com um unico placeholder `WIP` nesta etapa.
- O codigo deve deixar documentado que a selecao real de um NPC futuramente repetira o fluxo do personagem, mas sincronizando com a ficha local do NPC.
- A barrinha de vida de NPC, quando o fluxo real existir, devera ser visivel apenas para o GM.

### Entregaveis tecnicos

- Adaptar o metadata de vinculo do token para suportar `kind: "player" | "npc"`.
- Diferenciar o comportamento de overlay por tipo de vinculo.
- Evoluir o overlay atual para um conjunto visual com barra de vida, em vez de apenas texto.
- Garantir que o overlay continue sincronizando com movimento, escala e atualizacoes da entidade vinculada.

## Pre-requisitos

- Etapas 1, 2 e 3 na base atual.
- Etapa 9 preferencialmente estabilizada, para reduzir dependencia de `room metadata.playerLinks` como fonte principal de vinculo de ficha.
- Sessao Owlbear-aware pronta para o fluxo do GM.

## Mudancas esperadas por subsistema

### UI Owlbear

- Substituir o rotulo `Vincular ficha` por `Vincular a personagem`.
- Exibir seletor de personagens vinculadas a sala.
- Exibir item separado `Vincular a NPC`.
- Renderizar barra de vida visual acima do token vinculado.
- Deixar claro no fluxo de NPC que o conteudo ainda esta em `WIP`.

### Integracao SDK

- Atualizar `OBR.contextMenu` para registrar dois itens distintos de vinculo.
- Ajustar o metadata do token para guardar `kind`, `refId`, `overlayIds` e qualquer hint de visibilidade necessaria.
- Atualizar a infraestrutura de overlays para barras visuais de HP.
- Garantir que overlays de NPC possam ser criados com visibilidade restrita ao GM quando o fluxo deixar de ser placeholder.

### Backend / dados

- Reaproveitar a fonte de dados ja usada pela aba `Fichas` do GM para popular a lista de personagens vinculadas.
- Nao introduzir dependencia obrigatoria de backend para persistir o vinculo do token, que continua em `item metadata`.
- Nao implementar o CRUD real de NPCs nesta etapa.

### Testes em `tests/owlbear`

- Testes frontend do novo menu de contexto.
- Testes unitarios do metadata `player` vs `npc`.
- Testes dos utilitarios de barra de vida.
- Testes das regras de visibilidade do overlay.
- Testes cobrindo o placeholder `WIP` do fluxo de NPC.

## Checklist de implementacao

1. Atualizar o metadata do token para aceitar `kind: "player" | "npc"`.
2. Renomear o item atual de menu para `Vincular a personagem`.
3. Popular a lista de personagens a partir das fichas vinculadas a sala.
4. Criar o item `Vincular a NPC`.
5. Exibir apenas um item `WIP` no seletor de NPC nesta etapa.
6. Documentar no codigo que a selecao real de NPC repetira o fluxo de personagem com sincronizacao pela ficha local do NPC.
7. Substituir o overlay textual atual por barrinha de vida visual.
8. Ler HP atual e maximo da entidade vinculada para montar a barra.
9. Manter sincronizacao da barra com movimento, escala e atualizacao de dados.
10. Garantir visibilidade publica da barra de personagem.
11. Preparar visibilidade restrita ao GM para o caminho de NPC.
12. Ajustar os testes Owlbear desta etapa.

## Criterios de aceite

- O GM ve `Vincular a personagem` no `contextMenu` de tokens elegiveis.
- O GM ve a lista das fichas de jogador vinculadas a sala.
- Selecionar uma personagem vincula o token e mostra a barrinha de vida correta.
- A barra usa `hpCurrent` e `hpMax` da ficha vinculada.
- A barra acompanha movimento e escala do token.
- O GM ve `Vincular a NPC` como item separado.
- O fluxo de NPC mostra apenas `WIP` nesta etapa.
- O codigo deixa explicito que o fluxo futuro de NPC fara o mesmo vinculo com sincronizacao pela ficha local do NPC.
- A regra de visibilidade fica especificada: personagem para todos, NPC apenas para GM.

## Testes obrigatorios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no minimo:

- renderizacao dos dois itens de `contextMenu`;
- listagem de personagens vinculadas a sala;
- gravacao de `kind: "player"` ao vincular personagem;
- shape de metadata preparado para `kind: "npc"`;
- renderizacao da barrinha de vida com HP atual e maximo;
- atualizacao da barrinha ao mudar a ficha vinculada;
- placeholder `WIP` no fluxo de NPC;
- regra de visibilidade aplicada ao overlay conforme o tipo de vinculo.

## Fora desta etapa

- CRUD real de NPCs locais.
- Selecao real de NPCs a partir de dados persistidos.
- Sincronizacao real de HP do NPC.
- Edicao completa da aba `NPCs` do GM.
