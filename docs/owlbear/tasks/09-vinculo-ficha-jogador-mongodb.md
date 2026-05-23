# Task 09 - Vinculo Persistente de Ficha do Jogador no MongoDB

## Objetivo

Persistir no MongoDB a ficha vinculada ao jogador atual do Owlbear, associando o vinculo ao usuario autenticado do Dndicas, a sala Owlbear e o `owlbearPlayerId`.

## Decisao de arquitetura

O MongoDB deve ser a fonte de verdade do vinculo entre jogador Owlbear e ficha Dndicas.

A metadata da sala do Owlbear pode continuar sendo usada para historico de rolagens e outros estados compartilhados leves, mas `room metadata.playerLinks` nao deve continuar sendo o mecanismo principal de persistencia do vinculo de ficha.

## Mudancas esperadas

- Criar modelo persistente sugerido `OwlbearPlayerSheetLink`.
- O vinculo deve ser unico por `userId`, `roomId` e `owlbearPlayerId`.
- A aba `Ficha` do jogador deve buscar e salvar o vinculo via API Owlbear-aware.
- A aba `Fichas` do GM deve listar vinculos da sala a partir do backend.
- O backend deve validar que a ficha pertence ao usuario autenticado, exceto nos fluxos de GM ja autorizados para leitura da sala.
- Ao remover uma ficha vinculada que nao existe mais, o vinculo persistido deve ser limpo ou tratado com mensagem clara.

## Modelo sugerido

```ts
OwlbearPlayerSheetLink {
  userId: string
  roomId: string
  owlbearPlayerId: string
  sheetId: ObjectId | string
  createdAt: Date
  updatedAt: Date
}
```

Indices:

- `{ userId: 1, roomId: 1, owlbearPlayerId: 1 }`, unico.
- `{ roomId: 1 }`, para listagem de GM por sala.
- `{ sheetId: 1 }`, para limpeza ou consultas por ficha quando necessario.

## APIs sugeridas

```txt
GET /api/owlbear/player-sheet-link
PUT /api/owlbear/player-sheet-link
DELETE /api/owlbear/player-sheet-link
GET /api/owlbear/player-sheet-links
```

Regras:

- Todas as rotas devem exigir sessao Owlbear-aware.
- `GET /api/owlbear/player-sheet-link` retorna o vinculo do jogador atual da sessao.
- `PUT /api/owlbear/player-sheet-link` recebe `{ sheetId }`, valida acesso e cria/atualiza o vinculo do jogador atual.
- `DELETE /api/owlbear/player-sheet-link` remove o vinculo do jogador atual.
- `GET /api/owlbear/player-sheet-links` lista os vinculos da sala atual e deve ser restrito a GM.

## Checklist de implementacao

1. Criar model MongoDB para `OwlbearPlayerSheetLink`.
2. Criar service backend para buscar, upsertar, remover e listar vinculos.
3. Criar rotas Owlbear-aware para o vinculo do jogador atual.
4. Criar rota Owlbear-aware de listagem da sala para GM.
5. Atualizar a aba `Ficha` para ler/escrever o vinculo pelo backend.
6. Atualizar a aba `Fichas` do GM para carregar vinculos pelo backend.
7. Remover dependencia de `setPlayerSheetLink`, `clearPlayerSheetLink` e `metadata.playerLinks` nos fluxos de ficha.
8. Manter compatibilidade temporaria apenas se necessario para limpar ou migrar vinculos antigos.
9. Atualizar mensagens de erro para diferenciar falha de sessao, falha de permissao e ficha inexistente.

## Criterios de aceite

- Um jogador autenticado seleciona uma ficha e o vinculo persiste no MongoDB.
- Reabrir a action na mesma sala e com o mesmo `owlbearPlayerId` abre a ficha vinculada.
- Trocar a ficha atualiza o mesmo documento de vinculo.
- Remover/desvincular apaga o documento de vinculo.
- GM consegue ver fichas vinculadas da sala por API backend.
- O fluxo nao depende mais de `room metadata.playerLinks` como fonte de verdade.

## Testes obrigatorios

- Teste backend de criacao/upsert de vinculo.
- Teste backend de leitura do vinculo do jogador atual.
- Teste backend de remocao do vinculo.
- Teste backend de listagem por GM.
- Teste de permissao impedindo PLAYER de listar todos os vinculos da sala.
- Teste validando que o usuario nao consegue vincular ficha de outro usuario.
- Teste frontend da aba `Ficha` usando a API de vinculo.
- Teste frontend da aba `Fichas` do GM carregando vinculos persistidos.
