# Modulo: Dice Roller

## Objetivo

O dice roller fornece rolagens manuais e originadas de ficha/Owlbear com resultado autoritativo no backend e visualizacao 3D no frontend.

## Arquitetura

- `src/features/dice-roller/server/dice-engine.ts` calcula resultados oficiais, aplica modificador, vantagem/desvantagem e overrides.
- `src/app/api/dice/rolls/route.ts` expoe a rolagem geral e exige `diceSessionId` para usuarios anonimos.
- `src/features/dice-roller/components/dice-roller-panel.tsx` monta a UI, chama a API e passa o resultado para a stage visual.
- `src/features/dice-roller/components/dice-visual-stage.tsx` usa `@3d-dice/dice-box-threejs` apenas no client, via import dinamico.
- `src/features/dice-roller/dice-box-notation.ts` converte `DiceRollResponse` em notacao predeterminada da lib.

## Regras De Resultado

- O backend e sempre a fonte oficial do resultado.
- A Dice Box nao recalcula total nem substitui resultado do servidor.
- A stage 3D usa notacao com `@`, por exemplo `1d20@14` ou `1d20+1d20@18,7`, apenas para rolagens oficiais.
- Rolagens oficiais usam boost moderado `!!` na notacao da Dice Box para prolongar a animacao visual.
- Antes de rolar, a stage renderiza meshes estaticos da propria Dice Box usando a face maxima de cada dado; standby nao chama `box.roll`.
- O standby usa internals encapsulados em helper para criar/simular/fixar o mesh sem iniciar `animateThrow`.
- Depois de fixar a face maxima, o standby reposiciona os meshes em grade estatica da esquerda para a direita, quebrando linha quando necessario.
- Os assets de textura necessarios da Dice Box ficam em `public/textures/` para atender ao `assetPath: "/"` usado pela lib.
- Ao voltar para standby depois de uma rolagem, a stage limpa o canvas 3D anterior sem iniciar nova fisica/animacao.
- A Dice Box usa `baseScale: 67` para manter os dados menores dentro da janela do roller.
- Vantagem/desvantagem em `1d20` renderiza dois d20 visuais com papeis `kept` e `discarded`.
- `d100` e renderizado como dois `d10` visuais; o resumo numerico continua exibindo o valor oficial de 1 a 100.
- Falhas de WebGL ou inicializacao da lib mostram mensagem na stage, mas nao bloqueiam o resumo numerico da rolagem.

## Testes

- Testes frontend do roller ficam em `tests/frontend/dice-roller/`.
- Mocke `@3d-dice/dice-box-threejs` em testes jsdom; nao importe Three/Cannon reais nos testes de componente.
- Cubra helpers puros de notacao separadamente para preservar regras como vantagem e `d100`.
- Testes backend de motor e rotas ficam em `tests/backend/dice/` e devem continuar autoritativos para regras de jogo.

## Features

### Owlbear shared dice tab and player-targeted overrides
Quando o roller roda dentro da action do Owlbear, a request pode enviar `owlbearPlayerId` para que overrides sejam resolvidos pelo identificador tecnico do jogador, em vez de depender apenas de `userId`, `diceSessionId` ou do nome visivel na sala. O contrato global `window.diceResult` aceita tanto a assinatura antiga (`diceResult.min("d20", 20)`) quanto a assinatura direcionada por jogador (`diceResult.min("player-id", "d20", 20)`), e dentro do Owlbear a assinatura curta passa a mirar o proprio `playerId` atual da sala.

### Owlbear embedded panel reuse
`src/features/dice-roller/components/dice-roller-panel.tsx` pode ser usado tanto no modal do site quanto embutido em outras superficies, aceitando contexto opcional de rolagem Owlbear, callback de sucesso e replay de resultado remoto. Isso permite que a mesma UI base alimente a nova aba compartilhada sem duplicar a logica principal do roller.

### Dice panel responsive controls layout
O painel usa uma grade de 4 colunas em `Adicionar dados`. Em superficies largas, `Combinação` e `Modificador` compartilham uma linha responsiva; as linhas de combinacao seguem o padrao do controle numerico, com remover/adicionar nas pontas e o valor centralizado. O botao principal de rolagem usa o label `JOGAR` quando esta disponivel e preserva `Rolando...` durante a execucao.

### Dice sound effects and physics tuning
O rolar de dados 3D utiliza efeitos sonoros do pacote original (copiados para `public/sounds/` e servidos no root). A física dos dados foi ajustada para proporcionar maior dinamismo e consistência: a força de arremesso (`strength`) foi configurada em `2.0` e a gravidade (`gravity_multiplier`) reduzida para `280`. Além disso, o método `startClickThrow` foi sobrescrito para garantir que a coordenada de destino (`t`) seja posicionada de forma angular a uma distância mínima de 75% da dimensão máxima da tela, evitando lançamentos "fracos" ou muito próximos do centro da tela.

### Play button timeout and animation interruption
Ao iniciar uma animação de rolagem de dados, o botão "JOGAR" é desabilitado por no máximo 1 segundo (usando um timer reativo no frontend). Após 1 segundo, o botão é liberado para novas jogadas. Caso o usuário clique em "JOGAR" novamente enquanto dados ainda estão na mesa, a animação anterior é interrompida imediatamente (`box.clearDice()`) para iniciar a nova rolagem sem atrasos.

### Delayed result display until animation completes
O resumo do resultado numérico (`DiceResultSummary`), os destaques de sucesso ou falha crítica (incluindo cores e banners na stage visual), bem como os valores numéricos exibidos nos chips individuais de dados na base da stage, permanecem ocultos/inativos durante o período em que a animação 3D dos dados está rodando. Eles só aparecem/são ativados assim que a promessa da animação de rolagem do ThreeJS se resolve, garantindo sincronia entre o visual 3D e a exibição textual dos dados. O callback `onRollResolved` (que insere a rolagem no histórico compartilhado do Owlbear) também é postergado até a conclusão da animação. Se o visual 3D falhar ou estiver indisponível, os resultados e o callback são revelados/executados imediatamente como fallback.

### Multitasking window refactoring (GlassWindow integration)
O dice roller foi refatorado de um modal convencional para uma janela flutuante e interativa (`GlassWindow`) perfeitamente integrada ao gerenciador de janelas global (`WindowProvider`). O gerenciador foi estendido para suportar IDs customizados e "upserts": ao tentar abrir um painel de dados com o ID `"dice-roller"` que já está aberto (por exemplo, ao clicar em outro preset de dado ou abrir pelo FAB), o gerenciador atualiza seu conteúdo e preset, restaura-o caso esteja minimizado e traz a janela para o topo, sem duplicar o elemento visual na tela. A janela do roller oferece suporte completo para redimensionamento manual, arrasto responsivo com limites da tela e minimização para a barra de tarefas global. A janela inicializa com tamanho compacto (`width: min(400px, 90vw)` e `height: min(620px, 85vh)`) e possui limite mínimo de redimensionamento em `400px` de largura, com a stage 3D de dados limitada a no mínimo `350px` de largura.

### Responsive container query layout
O painel do roller (`DiceRollerPanel`) monitora sua própria largura de contêiner usando um `ResizeObserver`. Se a largura do contêiner for menor que `800px` (como no tamanho padrão inicial ou quando o usuário redimensiona a janela para dimensões mais estreitas), os controles de seleção e modificadores são empilhados verticalmente abaixo da stage 3D e do resumo de resultados. Se o contêiner for mais largo que `800px`, os elementos mudam dinamicamente para um layout de duas colunas lado a lado.




