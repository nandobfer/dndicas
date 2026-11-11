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
- O standby usa internals encapsulados em helper para criar e fixar o mesh sem iniciar `animateThrow`. A simulação de física síncrona foi removida do standby para evitar bloqueio da thread principal (CPU), utilizando posicionamento matemático e rotações aleatórias.
- Depois de fixar a face maxima, o standby reposiciona os meshes em grade estatica da esquerda para a direita, quebrando linha quando necessario.
- Os assets de textura necessarios da Dice Box ficam em `public/textures/` para atender ao `assetPath: "/"` usado pela lib.
- Uma estratégia de **Preload Agressivo** é executada no `DiceRollerProvider` (global), instanciando um `DiceBox` oculto no boot da aplicação para aquecer o cache do navegador (WASM, modelos 3D e shaders).
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

### Rolagem feita por outro serviço (testes do Maddox)
O `DiceRollerPanel` aceita `rollRequest` (função que faz a rolagem oficial; padrão `requestDiceRoll` → `/api/dice/rolls`), `rollButtonLabel` (padrão `JOGAR`) e `hideRollButton` (só repete um resultado externo via `externalResult`). Os testes pedidos pelo Maddox (Maddox 5) usam o painel com `hideConfigurationControls`, o botão "Rolar" e `rollRequest` apontando para a rota da campanha, que rola no servidor com `rollGeneralDice` (o cliente não envia dado nem modificador); os outros jogadores recebem a rolagem pelo stream da mesa e o painel repete a animação sem botão. Detalhes em `maddox.md` › "Fichas e testes (Maddox 5)". Props opcionais de aparência (sem elas, o painel é o de sempre): `appearance="inline"` (sem o cartão de vidro, o gradiente, o padding e o `DiceResultSummary`), `stageVariant="bare"` e `stageSize="compact"` (repassados ao `DiceVisualStage` como `variant`/`size`: só a tela do 3D, sem moldura, brilhos, selo de crítico nem etiquetas, em 240×190), `stageVisibility="roll"` (o palco só existe durante uma rolagem ou com um resultado, local ou externo) com `stageHideDelayMs` (o palco sai com `AnimatePresence` N ms depois do fim da animação e não volta para aquele resultado), `rollButtonClassName` (botão pequeno), `onRollSettled` (fim da animação de qualquer rolagem; `onRollResolved` continua avisando só as locais) e `onStageHidden` (o palco daquele resultado terminou de sair). O card do teste da mesa do Maddox usa todas. O destaque animado do crítico (brilho radial, gradiente cônico girando e borda pulsando, `CRITICAL_STAGE_CONFIG` com as cores e o selo) fica em `components/critical-highlight.tsx` (`CriticalHighlight`, `criticalBoxShadow`), usado pelo palco com moldura e pelo card do teste do Maddox. A entrevista de personagem do Maddox também usa o painel (4d6, "Rolar 4d6") com `rollRequest` para `POST …/interviews/character/ability-scores/roll`, que rola os atributos no servidor (`maddox.md` › "Atributos na entrevista de personagem").

### HP dice panel reuse
`src/features/dice-roller/components/hp-dice-panel.tsx` encapsula o `DiceRollerPanel` com preset travado e sem controles de configuração para rolagens de pontos de vida. `src/features/dice-roller/utils/hp-dice.ts` parseia fórmulas simples como `2d8 + 2`, agrega termos por dado e separa modificador fixo. O modal de subir nível da ficha e a aba `NPCs` do Owlbear usam esse componente para evitar duas implementações de rolagem de PV.

### Dice panel responsive controls layout
O painel usa uma grade de 4 colunas em `Adicionar dados`. Em superficies largas, `Combinação` e `Modificador` compartilham uma linha responsiva; as linhas de combinacao seguem o padrao do controle numerico, com remover/adicionar nas pontas e o valor centralizado. O botao principal de rolagem usa o label `JOGAR` quando esta disponivel e preserva `Rolando...` durante a execucao.

### Dice sound effects and physics tuning
O rolar de dados 3D utiliza efeitos sonoros do pacote original (copiados para `public/sounds/` e servidos no root). A física dos dados foi ajustada para proporcionar maior dinamismo e consistência: a força de arremesso (`strength`) foi configurada em `2.0` e a gravidade (`gravity_multiplier`) reduzida para `280`. Além disso, o método `startClickThrow` foi sobrescrito para garantir que a coordenada de destino (`t`) seja posicionada de forma angular a uma distância mínima de 75% da dimensão máxima da tela, evitando lançamentos "fracos" ou muito próximos do centro da tela.

### Play button timeout and animation interruption
Ao iniciar uma animação de rolagem de dados (o `isRolling` do painel, que fica até 500 ms depois da resposta e só controla o botão e a montagem do palco, não o indicador "..."), o botão "JOGAR" é desabilitado por no máximo 1 segundo (usando um timer reativo no frontend). Após 1 segundo, o botão é liberado para novas jogadas. Caso o usuário clique em "JOGAR" novamente enquanto dados ainda estão na mesa, a animação anterior é interrompida imediatamente (`box.clearDice()`) para iniciar a nova rolagem sem atrasos.

### Indicador de preparação e início da animação (DND-48)
O palco (`DiceVisualStage`) mostra o indicador "..." (`data-testid="dice-loading-ellipsis"`, `aria-label="Preparando dados"`) só na preparação: enquanto o motor 3D ainda não está pronto no palco (`!isReady`) ou enquanto o painel espera a resposta do servidor (`awaitingResult` do `DiceRollerPanel`, que vira `false` assim que a resposta chega, sem a folga de 500 ms do botão). Ele nunca aparece com o dado rolando: o palco marca `isAnimating` imediatamente antes de `box.roll` e só o desliga no fim da promise. A animação começa quando o palco está pronto e há resultado; se o resultado chega antes de o motor ficar pronto, o "..." fica até ele ficar pronto e o dado rola em seguida. Ao mover o container compartilhado do Dice Box para um palco (`appendChild`), `syncDiceBoxSize` (`dice-box-loader.ts`) chama na hora o `setDimensions` da lib com o tamanho do novo container (o container nasce fora da tela em 450×260), para a primeira rolagem já usar o mundo do tamanho do palco; o `resize` com atraso continua como reforço. Com `stageVisibility="roll"` e `stageHideDelayMs`, `onStageHidden(result)` avisa quando o palco daquele resultado terminou de sair (`AnimatePresence onExitComplete`): os cards de combate do Maddox esperam esse aviso para liberar o passo (`maddox.md` › "Dado do card até sair de cena").

### Delayed result display until animation completes
O resumo do resultado numérico (`DiceResultSummary`), os destaques de sucesso ou falha crítica (incluindo cores e banners na stage visual), bem como os valores numéricos exibidos nos chips individuais de dados na base da stage, permanecem ocultos/inativos durante o período em que a animação 3D dos dados está rodando. Eles só aparecem/são ativados assim que a promessa da animação de rolagem do ThreeJS se resolve, garantindo sincronia entre o visual 3D e a exibição textual dos dados. O callback `onRollResolved` permanece postergado até a conclusão da animação para consumidores visuais, enquanto `onRollCreated` é emitido imediatamente após a resposta autoritativa da API e alimenta o histórico compartilhado do Owlbear sem depender do stage. Se o visual 3D falhar ou estiver indisponível, os resultados visuais e `onRollResolved` são revelados/executados imediatamente como fallback.

### Multitasking window refactoring (GlassWindow integration)
O dice roller foi refatorado de um modal convencional para uma janela flutuante e interativa (`GlassWindow`) perfeitamente integrada ao gerenciador de janelas global (`WindowProvider`). O gerenciador foi estendido para suportar IDs customizados e "upserts": ao tentar abrir um painel de dados com o ID `"dice-roller"` que já está aberto (por exemplo, ao clicar em outro preset de dado ou abrir pelo FAB), o gerenciador atualiza seu conteúdo e preset, restaura-o caso esteja minimizado e traz a janela para o topo, sem duplicar o elemento visual na tela. A janela do roller oferece suporte completo para redimensionamento manual, arrasto responsivo com limites da tela e minimização para a barra de tarefas global. A janela inicializa com tamanho compacto (`width: min(400px, 90vw)` e `height: min(620px, 85vh)`) e possui limite mínimo de redimensionamento em `400px` de largura, com a stage 3D de dados limitada a no mínimo `350px` de largura.

### Responsive container query layout
O painel do roller (`DiceRollerPanel`) monitora sua própria largura de contêiner usando um `ResizeObserver`. Se a largura do contêiner for menor que `800px` (como no tamanho padrão inicial ou quando o usuário redimensiona a janela para dimensões mais estreitas), os controles de seleção e modificadores são empilhados verticalmente abaixo da stage 3D e do resumo de resultados. Se o contêiner for mais largo que `800px`, os elementos mudam dinamicamente para um layout de duas colunas lado a lado.

### Aggressive 3D assets preloading and physics-free standby
Para eliminar o atraso percebido ao abrir o painel de dados, a aplicação realiza um preload agressivo dos recursos 3D (`DiceBox`). Ao montar o `DiceRollerProvider`, uma instância oculta do motor é inicializada em background usando `requestIdleCallback`, forçando o download e cache de assets pesados (WebAssembly do motor físico, modelos 3D dos dados e texturas). Adicionalmente, a renderização de dados em "standby" (dados aguardando na mesa) foi otimizada para ser puramente matemática: a simulação física síncrona foi removida, eliminando o congelamento da thread principal (Main Thread). Os dados são posicionados em grade e recebem rotações aleatórias instantâneas, garantindo que o painel apareça de forma imediata e fluida para o usuário.

### CLI TUI de gerenciamento de overrides (scripts/dice-override-cli.ts)
Script de terminal interativo para criar e consultar dice overrides diretamente, sem precisar do browser. Conecta ao MongoDB via Mongoose (igual ao `search-cli.ts`) e usa `terminal-kit` para renderizar duas colunas permanentes:

- **Coluna esquerda**: fluxo de criação de overrides por jogador
  - `player-list`: lista de jogadores armazenados em memória durante a sessão. `Ctrl+N` adiciona um jogador (name + owlbear player ID).
  - `method-list`: após selecionar um jogador, escolhe o método: `min`, `max`, `range`, `exact`, `clear` ou `list`.
  - `param-dice`: seleção do dado (d4–d100), pré-selecionado em d20.
  - `param-value`: input numérico do valor (dois campos sequenciais para `range`).
  - `confirm-clear`: confirmação antes de remover overrides.
  - `ESC` em qualquer tela volta à etapa anterior.

- **Coluna direita**: todos os overrides ativos no banco (`DiceRollOverride.find({})`), agrupados por `targetId`, com nome legível quando o player está em memória. Auto-refresh a cada 5s e `Ctrl+R` manual. Ao persistir ou limpar um override, a lista é atualizada imediatamente sem aguardar o próximo ciclo.

- O `DiceTarget` gerado é sempre `{ scope: 'owlbear', targetId: 'player:<id>' }`, compatível com a assinatura do `window.diceResult` no browser.

- Executar com: `pnpm dice-override-cli`

## Botão flutuante (DND-20)

O `DiceRollerFab` fica no grupo de botões flutuantes do canto inferior direito (`GlobalFabGroup`), reordenável por arraste junto com o Agente Opex e a Busca; ordem padrão **Dados → Agente Opex → Busca**, salva no `localStorage` (`dndicas:fab-order`). Não aparece no Owlbear (SDK disponível ou catálogo embutido via `useIsOwlbearCatalogEmbed`). Regras completas em [use-componentes-ui.md › Layout do app](../use-componentes-ui.md#layout-do-app-header-translúcido-e-botões-flutuantes-dnd-20).

## Tooltip com a conta da rolagem (DND-47)

Todo total de rolagem exibido no app abre a conta completa em `DiceResultTooltip` (`components/dice-result-tooltip.tsx`). A conta é montada sem React em `dice-breakdown.ts` (`buildDiceBreakdown`):

- **Cabeçalho**: `label`, modo (Normal/Vantagem/Desvantagem), fórmula (`1d20 + 5`) e horário (`createdAt`, pt-BR).
- **Dados rolados**: uma linha por termo (`2d6 →`) com um chip por dado na cor do tipo (`diceColors`).
- **Vantagem/desvantagem**: com `selectedD20.discarded`, os dois d20 lado a lado — o mantido em verde ("mantido") e o descartado riscado ("descartado").
- **Modificadores**: linha `Dados (1d20)` com `diceTotal` e uma linha por parcela de `modifierParts` (nome, sinal e a cor do `CalcPart` da ficha). Sem parcelas, uma linha "Modificador ±N"; com modificador 0, "Sem modificador".
- **Total**: a conta explícita (`15 + 3 + 2 = 20`) e o total do servidor em destaque. Se `diceTotal + Σ parcelas` não bater com `total` (dado antigo), a diferença vira a linha "Ajuste do servidor": a conta sempre fecha.
- **Crítico**: selo "Sucesso crítico"/"Falha crítica" (padrão `getDiceCriticalState`; a prop `criticalState` sobrescreve, `null` esconde — ex.: dano).
- **4d6 dos atributos** (`dropLowest`, via `DiceRollerPanel resultDropLowest` → `DiceResultSummary dropLowest`): o menor dado aparece riscado e o tooltip mostra a pontuação sem ele.

Comportamento: Radix Popover controlado (âncora `span role="button" tabIndex=0`, conteúdo `role="tooltip"` com `aria-describedby` no gatilho enquanto aberto). Abre no hover do mouse (atraso de 120 ms), no foco por teclado e no Enter/Espaço; no toque, o tap alterna (o foco vindo do toque não abre sozinho) e tocar fora fecha; `Esc`, sair o mouse ou perder o foco fecham. Portal com `avoidCollisions` (troca de lado quando falta espaço), `z-[9999]` acima das janelas, largura `min(20rem, 90vw)`. Cada consumidor escolhe o `side` para não cobrir o botão "Rolar".

Onde é usado: `DiceResultSummary` (modal/FAB, Owlbear, PV da ficha e do Owlbear, atributos e PV da entrevista do Maddox, criação assistida), histórico da aba de dados do Owlbear (`history-total-tooltip-<id>`), `GameCheckCard` (`check-roll-total`), `CombatCards` (`combat-step-total` só quando o passo tem `roll` e `step.total === roll.total`; dano fixo sem dado não tem tooltip; `enemy-initiative-total`; `combat-roll-total`) e `LiveNpcRolls` (`live-roll-total`). O `ReplayDie` só anima: o resultado do replay aparece nesses pontos.

### Parcelas do modificador (`modifierParts`)

`DiceRollResponse.modifierParts?: DiceModifierPart[]` (`{ label, value, color? }`) é opcional: sem ele, a resposta é idêntica à anterior e o tooltip mostra "Modificador". Quem rola pode mandar `modifierParts` no `DiceRollRequest` (rota `/api/dice/rolls` valida com `DiceModifierPartSchema`: até 12, rótulo 1–60, inteiro −100…100) ou no `DiceRollPreset` (o painel repassa; o modificador digitado à mão descarta as parcelas do preset). O motor (`rollDice`) grava as parcelas passadas por `alignModifierParts(parts, modifier)`: tira as de valor 0 e, se a soma não bater com o modificador, acrescenta a diferença ("Outros" ou o rótulo do contexto) — a soma das parcelas é sempre igual a `modifier`. `partsFromCalc` converte o `CalcPart` da ficha (`"+3"`, `"−1"`). O parser da sala do Owlbear (`owlbear/sdk.ts`) preserva as parcelas válidas. O `HpDicePanel` aceita `modifierParts` (estabilizadas por conteúdo, para o preset não reiniciar o painel): a ficha manda "Constituição" ao subir de nível e o Owlbear manda "Constituição (pelos dados de vida)" no PV de NPC. As parcelas do Maddox estão em `maddox.md` › "Parcelas das rolagens (DND-47)".
