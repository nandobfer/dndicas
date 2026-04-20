# Task 03 — Fichas do GM, Vínculo de Token e Overlays

## Objetivo

Entregar a experiência principal do mestre para:

- visualizar e editar fichas de jogadores vinculadas à sala;
- desvincular fichas de jogadores da sala;
- vincular tokens a fichas por `contextMenu`;
- criar e manter overlays de HP e HP temporário no token.

## Escopo funcional

### Entregáveis de produto

- A aba `Fichas` do GM lista as fichas de jogador vinculadas na sala.
- O mestre pode abrir e editar essas fichas com permissão total.
- O mestre pode remover o vínculo da ficha com a sala.
- O `contextMenu` exibe `Vincular ficha` e `Desvincular ficha` para tokens elegíveis.
- Tokens vinculados exibem HUD de HP e HP temporário.

### Entregáveis técnicos

- Leitura de `room metadata` para derivar a lista de fichas do GM.
- Escrita de `item metadata` para vínculo `token ↔ ficha`.
- Infraestrutura de overlays gerenciados pelo plugin.
- Sincronização entre token, ficha e overlay.

## Pré-requisitos

- Etapas 1 e 2 implementadas.
- Sessão Owlbear-aware disponível para edição persistente pelo GM.

## Mudanças esperadas por subsistema

### UI Owlbear

- Implementar aba `Fichas` do GM baseada na lista de fichas vinculadas à sala.
- Permitir abrir/editar ficha persistente do jogador.
- Permitir desvincular a ficha da sala.
- Criar seletor de ficha para o `contextMenu` de vínculo do token.

### Integração SDK

- Criar itens de `OBR.contextMenu` com filtro de papel `GM`.
- Ler/escrever `item metadata` para vínculo do token.
- Criar, atualizar e remover overlays na cena.
- Reagir a movimento e escala dos tokens.

### Backend / autorização

- Reaproveitar a sessão Owlbear-aware para liberar edição persistente do GM.
- Implementar ou adaptar rotas Owlbear-aware necessárias para abrir/editar ficha de jogador no contexto do GM.

### Testes em `tests/owlbear`

- Testes frontend da aba `Fichas`.
- Testes de vínculo/desvínculo de ficha da sala.
- Testes unitários dos utilitários de `item metadata`.
- Testes dos utilitários de criação e sincronização de overlays.
- Testes backend das regras Owlbear-aware do GM, se existirem rotas específicas nesta etapa.

## Checklist de implementação

1. Derivar lista de fichas do GM a partir de `room metadata`.
2. Carregar detalhes das fichas persistentes correspondentes.
3. Implementar abertura e edição total da ficha pelo GM.
4. Implementar desvínculo da ficha do jogador com a sala.
5. Criar `OBR.contextMenu` para `Vincular ficha` e `Desvincular ficha`.
6. Implementar seletor de ficha para o vínculo do token.
7. Persistir vínculo do token em `item metadata`.
8. Implementar infraestrutura dos overlays de HP e HP temporário.
9. Sincronizar overlays com movimento, escala e atualização da ficha.
10. Limpar overlays e metadata ao desvincular.
11. Adicionar testes Owlbear desta etapa.

## Critérios de aceite

- A aba `Fichas` do GM mostra apenas fichas vinculadas à sala atual.
- O GM pode editar a ficha persistente do jogador no contexto Owlbear.
- O GM pode desvincular a ficha da sala sem apagar a ficha persistente.
- O token vinculado guarda o vínculo em `item metadata`.
- O token vinculado exibe corretamente HP e HP temporário.
- O overlay acompanha movimento e escala do token.
- Ao desvincular token ou ficha, overlays e metadados relacionados são limpos.

## Testes obrigatórios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no mínimo:

- listagem da aba `Fichas` baseada em `room metadata`;
- edição de ficha persistente pelo GM com autorização Owlbear-aware;
- desvínculo da ficha da sala;
- criação de vínculo do token em `item metadata`;
- substituição de vínculo anterior do mesmo token;
- criação e reposicionamento de overlays;
- limpeza de overlay ao desvincular.

## Fora desta etapa

- CRUD completo de NPCs.
- Vínculo de tokens a NPCs.
- Valores clicáveis e rolagem.
