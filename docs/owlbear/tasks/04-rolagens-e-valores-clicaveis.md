# Task 04 — Dice Roller no Owlbear e Valores Clicáveis

## Objetivo

Integrar o dice roller próprio do Dndicas ao Owlbear, tornando valores da ficha clicáveis e adicionando uma aba manual de rolagem dentro da action.

Esta etapa não depende mais da extensão oficial de dados do Owlbear. A base do motor, modal, painel, FAB global e comandos de console deve vir da spec geral em:

- `docs/dice-roller.md`

## Escopo funcional

### Entregáveis de produto

- A action do Owlbear ganha uma aba `Dados` para rolagens manuais.
- A aba `Dados` renderiza o mesmo conteúdo componentizado usado pelo modal geral do dice roller.
- Valores suportados da ficha exibem affordance visual de interação.
- Clique em valores suportados abre o modal glass/BG3-like do dice roller com preset estruturado.
- Confirmar a rolagem no modal chama o backend Owlbear-aware.
- O resultado é gerado no backend, não no navegador.
- O resultado é transmitido por Pusher para todos os clientes conectados à sala Owlbear.
- Todos os clientes exibem a animação e o resultado final recebido do servidor.
- Overrides de console funcionam no contexto Owlbear usando jogador/ficha como alvo.

### Entregáveis técnicos

- Reutilização dos componentes/hooks do dice roller geral.
- Componentes/hooks Owlbear para valores roláveis.
- Derivação estruturada de fórmulas para:
  - iniciativa;
  - perícias suportadas;
  - ataque seguro;
  - dano seguro.
- Endpoint Owlbear-aware para rolagens com contexto de sala.
- Canal Pusher por sala para transmitir eventos de rolagem.
- Wrapper Owlbear para `window.diceResult` com alvo por jogador/ficha.
- Nova aba `Dados` na shell da action.

## Pré-requisitos

- Etapa 2 implementada, porque a ficha do jogador já precisa existir.
- Idealmente etapa 3 implementada, para compartilhar componentes e contexto da ficha dentro da extensão.
- Dice roller geral implementado conforme `docs/dice-roller.md`.
- Releitura da seção de rolagem na spec Owlbear, sabendo que a dependência da extensão oficial foi substituída pelo roller próprio.

## Mudanças esperadas por subsistema

### UI Owlbear

- Adicionar a aba `Dados` para `GM` e `PLAYER`.
- Renderizar `DiceRollerPanel` dentro da aba `Dados`.
- Adicionar affordance visual consistente para campos roláveis.
- Exibir tooltips ou labels de acessibilidade quando necessário.
- Ao clicar em valor rolável, abrir `DiceRollerModal` com preset derivado da ficha.
- Exibir animação glass/BG3-like ao receber evento de rolagem da sala.
- Manter o modal/painel usável dentro do iframe do Owlbear.

### Integração SDK / Realtime

- Usar `roomId`, `owlbearPlayerId` e `sheetId` no contexto da rolagem.
- Usar a sessão Owlbear-aware já existente para autenticar chamadas ao backend.
- Criar ou reutilizar canal Pusher por sala, por exemplo `owlbear-room.{roomId}`.
- Publicar evento de rolagem após o backend calcular o resultado.
- Clientes da mesma sala assinam o canal e exibem a animação baseada no evento recebido.
- Não usar `room metadata` como fila de eventos de rolagem.
- Não usar `room metadata` para guardar overrides secretos.

### Lógica de domínio

- Criar derivadores de fórmula por tipo de valor.
- Não fazer parsing genérico de qualquer texto livre da ficha.
- Limitar a v1 aos campos com derivação segura.
- Converter valores clicáveis em presets estruturados do dice roller.
- Garantir que modificadores sejam somados depois do valor bruto dos dados.
- Garantir que overrides afetem apenas o valor bruto do dado alvo.

### Backend Owlbear

- Criar endpoint Owlbear-aware, sugerido:

```txt
POST /api/owlbear/rolls
```

- O endpoint deve receber:
  - `roomId`;
  - `owlbearPlayerId`;
  - `sheetId`, quando aplicável;
  - `label`;
  - `terms`;
  - `modifier`;
  - `mode`;
  - `source`.
- O endpoint deve:
  - validar sessão Owlbear-aware;
  - validar payload com Zod;
  - chamar o motor geral do dice roller;
  - aplicar override pendente para `owlbearPlayerId` ou `sheetId`, se existir;
  - consumir override usado;
  - publicar evento Pusher para a sala;
  - retornar o mesmo resultado ao cliente que iniciou a rolagem.
- O endpoint não deve:
  - registrar histórico persistente de rolagem;
  - auditar rolagem;
  - expor no evento público que houve override.

### Comandos de Console no Owlbear

No contexto Owlbear, expor:

```ts
window.diceResult.min("player-name", "d20", 10)
window.diceResult.max("player-name", "d20", 10)
window.diceResult.range("player-name", "d20", 10, 20)
window.diceResult.exact("player-name", "d20", 17)
window.diceResult.clear("player-name", "d20")
window.diceResult.list("player-name")
```

Regras:

- qualquer usuário que saiba o comando pode usar;
- não há UI pública para criar overrides;
- o comando deve resolver `player-name` para `owlbearPlayerId` ou `sheetId` quando possível;
- `sheetId` pode ser aceito diretamente como identificador avançado;
- nomes ambíguos devem falhar com erro claro no console;
- overrides ficam server-side, não em metadata do Owlbear;
- overrides são consumidos na próxima rolagem compatível;
- `exact` tem precedência sobre `min/max`;
- `min/max/range/exact` afetam apenas o resultado bruto do dado, não o modificador.

### Testes em `tests/owlbear`

- Testes dos derivadores de fórmula.
- Testes dos componentes clicáveis.
- Testes de abertura do modal com preset correto.
- Testes da aba `Dados`.
- Testes do endpoint Owlbear-aware de rolagem.
- Testes de publicação Pusher por sala.
- Testes de consumo de override por `owlbearPlayerId` e/ou `sheetId`.
- Testes de que `room metadata` não é usada como fila de rolagem.

## Checklist de implementação

1. Garantir que o dice roller geral esteja disponível conforme `docs/dice-roller.md`.
2. Adicionar `Dados` ao tipo de abas Owlbear e à shell da action.
3. Renderizar `DiceRollerPanel` na aba `Dados`.
4. Identificar os pontos da ficha que serão clicáveis na v1.
5. Criar modelo estruturado Owlbear para uma ação de rolagem.
6. Implementar derivadores para iniciativa e perícias.
7. Implementar derivadores seguros para ataque e dano.
8. Criar componentes/hooks de valor rolável no contexto Owlbear.
9. Integrar esses componentes na ficha renderizada no Owlbear.
10. Criar `POST /api/owlbear/rolls`.
11. Integrar o endpoint ao motor geral do dice roller.
12. Criar assinatura Pusher da sala no cliente Owlbear.
13. Publicar evento Pusher após cada rolagem Owlbear.
14. Exibir animação/resultado em todos os clientes da sala.
15. Criar wrapper Owlbear de `window.diceResult`.
16. Resolver alvo de override por `player-name`, `owlbearPlayerId` ou `sheetId`.
17. Adicionar testes Owlbear para derivação, UI, endpoint, Pusher e overrides.

## Critérios de aceite

- A aba `Dados` aparece para `GM` e `PLAYER`.
- A aba `Dados` permite rolagem manual usando o mesmo painel do dice roller geral.
- Iniciativa pode ser clicada, abre o modal e deriva preset correto.
- Pelo menos uma classe de perícias suportadas pode ser clicada, abre o modal e deriva preset correto.
- Ataque e dano só ficam clicáveis quando a fórmula for segura e estruturada.
- Ao confirmar uma rolagem, o backend gera o resultado.
- Todos os clientes da mesma sala recebem o evento e exibem resultado consistente.
- Overrides por console podem forçar mínimo, máximo, range ou valor exato da próxima rolagem compatível.
- Overrides não aparecem na UI pública nem no evento público da rolagem.
- A implementação não introduz parsing genérico inseguro de texto livre.
- A implementação não registra nem audita rolagens.

## Testes obrigatórios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no mínimo:

- derivação de fórmula de iniciativa;
- derivação de fórmula de perícia;
- habilitação de campos roláveis seguros;
- não habilitação de campos inseguros;
- clique em valor suportado abrindo modal com preset correto;
- renderização da aba `Dados`;
- `POST /api/owlbear/rolls` validando sessão Owlbear-aware;
- geração de resultado pelo backend;
- publicação Pusher para a sala correta;
- cliente recebendo evento Pusher e exibindo resultado;
- override `min` por jogador/ficha;
- override `max` por jogador/ficha;
- override `range` por jogador/ficha;
- override `exact` por jogador/ficha;
- consumo de override após uma rolagem;
- ausência de auditoria/log persistente de rolagem.

## Fora desta etapa

- CRUD completo de NPCs.
- Rolagens a partir de texto livre arbitrário.
- Física real de dados.
- Three.js.
- Histórico persistente de rolagens.
- Auditoria de rolagens.
- Multiplayer fora do Owlbear.
- Integração com a extensão oficial de dados do Owlbear.
