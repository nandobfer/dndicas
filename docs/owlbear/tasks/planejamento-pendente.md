# Planejamento Pendente — Integração Owlbear

Este documento registra itens propositalmente fora das quatro etapas principais.

O item principal pendente nesta revisão é o suporte completo a NPCs locais.

## NPCs locais

### Motivo de ficar fora

Embora a spec já defina o comportamento desejado para NPCs, o volume de trabalho adiciona:

- CRUD próprio por `roomId`;
- renderização e edição de ficha local;
- vínculo de token com `npcId`;
- overlays de HP para NPC;
- sincronização e recuperação de inconsistências específicas.

Isso torna o conjunto grande o suficiente para merecer uma etapa própria, em vez de ser acoplado às entregas principais.

### Escopo pendente

- Aba `NPCs` completa para o GM.
- APIs backend:
  - `GET /api/owlbear/rooms/:roomId/npcs`
  - `POST /api/owlbear/rooms/:roomId/npcs`
  - `PATCH /api/owlbear/rooms/:roomId/npcs/:npcId`
  - `DELETE /api/owlbear/rooms/:roomId/npcs/:npcId`
- Formulário da ficha local de NPC.
- Listagem, criação, edição e remoção de NPC local.
- Vínculo de token com `npcId`.
- Overlays de HP e HP temporário para NPC.
- Limpeza de vínculo e overlay ao remover NPC.
- Testes completos em `tests/owlbear`.

## Pontos de atenção futuros

- Caso a etapa do GM implemente o seletor de vínculo de token sem NPCs, o seletor deve deixar claro que o suporte a NPCs ainda não está ativo.
- Se a integração oficial de rolagem tiver limitações por contexto, isso pode gerar outra pendência futura específica da etapa 4.
- Se o bootstrap da extensão exigir ajustes de build/deploy específicos do ambiente Owlbear, isso pode virar documentação operacional complementar.

## Critério para promover este pendente a uma task própria

Promover quando houver intenção de implementar de uma vez:

- a aba `NPCs`;
- as APIs de NPC local;
- o vínculo de token para NPC;
- os overlays correspondentes;
- a suíte de testes Owlbear associada.
