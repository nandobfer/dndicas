# Planejamento Pendente — Integracao Owlbear

Este documento registra itens que continuam fora das tasks ja promovidas em `docs/owlbear/tasks`.

As tasks 10 e 11 promoveram a primeira fatia do trabalho de NPCs locais:

- `10-context-menu-vinculo-personagem-npc-e-barras-de-vida.md`
- `11-wip-aba-npcs-do-gm.md`

O que permanece aqui e o refinamento posterior desse dominio.

## NPCs locais — pendencias remanescentes

### Motivo de ficar fora

Mesmo com a promocao das tasks 10 e 11, ainda sobra um volume relevante de trabalho para fechar o fluxo completo de NPCs locais:

- consolidacao do modelo persistente por `roomId`;
- amadurecimento da edicao local alem do formulario simplificado `WIP`;
- vinculo real de token com `npcId`;
- sincronizacao real da barra de vida do NPC;
- recuperacao de inconsistencias, limpeza e regras avancadas de permissao.

Esse restante continua grande o suficiente para merecer novas etapas proprias, em vez de ser absorvido nas tasks ja promovidas.

### Escopo pendente

- APIs backend:
  - `GET /api/owlbear/rooms/:roomId/npcs`
  - `POST /api/owlbear/rooms/:roomId/npcs`
  - `PATCH /api/owlbear/rooms/:roomId/npcs/:npcId`
  - `DELETE /api/owlbear/rooms/:roomId/npcs/:npcId`
- Evolucao do formulario simplificado da aba `NPCs` para uma experiencia mais completa.
- Vinculo real de token com `npcId`.
- Overlays de HP e HP temporario para NPC com sincronizacao real.
- Limpeza de vínculo e overlay ao remover NPC.
- Recuperacao de overlays orfaos ou metadados inconsistentes.
- Regras finais de visibilidade e autorizacao do fluxo de NPC.
- Testes completos em `tests/owlbear`.

## Pontos de atenção futuros

- Enquanto a task 10 estiver em modo placeholder para NPC, o seletor deve deixar claro que o suporte ainda esta em `WIP`.
- Se a integração oficial de rolagem tiver limitações por contexto, isso pode gerar outra pendência futura específica da etapa 4.
- Se o bootstrap da extensão exigir ajustes de build/deploy específicos do ambiente Owlbear, isso pode virar documentação operacional complementar.

## Critério para promover este pendente a uma task própria

Promover quando houver intencao de implementar de uma vez:

- o fechamento completo das APIs de NPC local;
- o vinculo real de token para NPC;
- os overlays correspondentes com sincronizacao final;
- os refinamentos pos-`WIP` da aba `NPCs`;
- a suite de testes Owlbear associada.
