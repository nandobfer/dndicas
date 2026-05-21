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
- A Dice Box usa `baseScale: 67` para manter os dados menores dentro do modal.
- Vantagem/desvantagem em `1d20` renderiza dois d20 visuais com papeis `kept` e `discarded`.
- `d100` e renderizado como dois `d10` visuais; o resumo numerico continua exibindo o valor oficial de 1 a 100.
- Falhas de WebGL ou inicializacao da lib mostram mensagem na stage, mas nao bloqueiam o resumo numerico da rolagem.

## Testes

- Testes frontend do roller ficam em `tests/frontend/dice-roller/`.
- Mocke `@3d-dice/dice-box-threejs` em testes jsdom; nao importe Three/Cannon reais nos testes de componente.
- Cubra helpers puros de notacao separadamente para preservar regras como vantagem e `d100`.
- Testes backend de motor e rotas ficam em `tests/backend/dice/` e devem continuar autoritativos para regras de jogo.
