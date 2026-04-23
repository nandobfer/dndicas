# Dice Roller Dndicas — Spec e Plano

## Objetivo

Criar um dice roller próprio do Dndicas, reutilizável dentro e fora do Owlbear, com:

- motor backend autoritativo para sortear resultados;
- UI glass inspirada na experiência de rolagem do Baldur's Gate 3;
- composição manual de dados de `d4` a `d20`;
- suporte a modificador numérico opcional;
- suporte a rolagem normal, vantagem e desvantagem;
- comando oculto de console para forçar limites ou resultado da próxima rolagem;
- sem auditoria e sem registro histórico persistente de rolagens.

O módulo deve ser independente da integração Owlbear. O Owlbear apenas expande esse módulo com identificação de sala/jogador/ficha e transmissão realtime.

## Escopos de uso

### Uso geral no Dndicas

Fora do Owlbear, o dice roller deve aparecer como um FAB ao lado de `src/components/ui/global-search-fab.tsx`.

Comportamento esperado:

- o FAB abre o modal de rolagem manual;
- a rolagem chama o backend para gerar o resultado;
- o resultado é exibido apenas no navegador atual;
- não há transmissão via Pusher;
- overrides de console são escopados ao contexto local do usuário/navegador.

### Uso dentro do Owlbear

Dentro do Owlbear, o mesmo conteúdo do dice roller deve ser reutilizado em dois formatos:

- modal aberto ao clicar em valores roláveis da ficha;
- aba manual `Dados` dentro da action do Owlbear.

O Owlbear adiciona:

- contexto de `roomId`;
- identificação por `owlbearPlayerId`;
- identificação opcional por `sheetId`;
- publicação do resultado por Pusher para todos os clientes da sala;
- overrides direcionáveis por jogador ou ficha.

## UX e Interface

### Direção visual

A interface deve reproduzir a ideia de rolagem cinematográfica do Baldur's Gate 3, adaptada ao padrão glass do Dndicas.

Características:

- fundo glass escuro com blur, bordas translúcidas e highlights;
- dado central grande, pseudo-3D, sem física real;
- animação de giro/tombo/reveal entre 800 ms e 1400 ms;
- resultado final destacado no centro;
- chips laterais com dados selecionados, modificador, modo de rolagem e total;
- microanimações com `framer-motion`, sem depender de Three.js na v1;
- layout utilizável em desktop e mobile.

### Estrutura componentizada

O conteúdo principal deve ser componentizado para renderizar tanto dentro de modal quanto dentro de aba/painel.

Componentes sugeridos:

- `DiceRollerProvider`: estado local e comandos de abertura;
- `DiceRollerFab`: FAB global ao lado do `GlobalSearchFAB`;
- `DiceRollerModal`: casca modal para uso geral e clique em valores roláveis;
- `DiceRollerPanel`: conteúdo reutilizável, sem depender de modal;
- `DiceBuilder`: botões de dados, lista de dados escolhidos e controles;
- `DiceModeSelector`: selector normal/vantagem/desvantagem;
- `DiceModifierInput`: input numérico de modificador;
- `DiceAnimationStage`: palco visual da rolagem;
- `DiceResultSummary`: total, parcelas e resultado final;
- `RollableValue`: wrapper de valores clicáveis que abre o modal com preset.

### FAB global

O FAB do dice roller deve ficar visualmente ao lado do `GlobalSearchFAB`, sem conflitar com `Cmd/Ctrl + K`.

Sugestões:

- posição: `bottom-6 right-6`, deslocando um dos FABs com `right-40` ou agrupando ambos em um container;
- ícone: dado ou `Dices` do `lucide-react`;
- atalho opcional futuro: evitar conflito com busca.

## Montagem de rolagem manual

### Dados suportados

A UI deve oferecer botões para:

- `d4`;
- `d6`;
- `d8`;
- `d10`;
- `d12`;
- `d20`.

Não há limite de quantidade de dados na v1.

Exemplos válidos:

- `1d6`;
- `1d6 + 1d4`;
- `2d4 + 1d8`;
- `3d6 + 2`;
- `1d20 + 5`.

### Representação interna

Usar um modelo estruturado, sem depender de parsing livre:

```ts
type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20"

type DiceRollMode = "disadvantage" | "normal" | "advantage"

interface DiceTerm {
  dice: DiceType
  quantity: number
}

interface DiceRollRequest {
  terms: DiceTerm[]
  modifier?: number
  mode: DiceRollMode
  label?: string
  source?: "manual" | "sheet" | "owlbear"
}
```

O frontend pode exibir fórmula legível, mas o backend deve receber termos estruturados.

### Vantagem e desvantagem

O seletor deve usar `src/components/ui/glass-selector.tsx`.

Ordem obrigatória:

1. desvantagem;
2. padrão;
3. vantagem.

Cores obrigatórias vindas de `src/lib/config/colors.ts`:

- desvantagem: `colors.rarity.artifact`;
- padrão: `colors.rarity.rare`;
- vantagem: `colors.rarity.uncommon`.

Regra v1:

- vantagem/desvantagem só se aplica quando a rolagem contém pelo menos um `d20`;
- para rolagens com vários `d20`, aplicar ao grupo de `d20` usado como teste principal somente se a origem estruturar isso;
- no modo manual simples, se houver qualquer `d20`, rolar um `d20` adicional e escolher maior/menor para o teste principal;
- dados que não são `d20` são rolados normalmente.

Se a regra ficar ambígua na UI manual, a v1 deve mostrar uma explicação curta no painel.

### Modificador

O modificador é opcional e numérico.

Preferência de implementação:

- reutilizar `SheetInput` de `src/features/character-sheets/components/sheet-input.tsx`, se o acoplamento visual e importação forem aceitáveis;
- se não for aceitável importar componente de ficha para UI global, extrair ou reproduzir um componente genérico de input numérico glass em `src/components/ui`.

Comportamento:

- vazio equivale a `0`;
- aceita valores negativos;
- modificador é somado ao total final depois dos dados;
- overrides afetam apenas resultado bruto de dado, nunca o modificador.

## Backend

### Endpoint de rolagem geral

Criar um endpoint para uso geral:

```txt
POST /api/dice/rolls
```

Responsabilidades:

- validar payload com Zod;
- sortear com `crypto.randomInt`;
- aplicar override pendente, se existir;
- consumir override usado;
- retornar resultado detalhado para animação e UI;
- não registrar e não auditar a rolagem.

Resposta sugerida:

```ts
interface DiceRollResponse {
  rollId: string
  label?: string
  terms: Array<{
    dice: DiceType
    quantity: number
    results: number[]
  }>
  mode: DiceRollMode
  selectedD20?: {
    kept: number
    discarded?: number
    reason: "normal" | "advantage" | "disadvantage"
  }
  diceTotal: number
  modifier: number
  total: number
  createdAt: string
}
```

`rollId` serve apenas para correlacionar UI/eventos, não para histórico persistente.

### Sem auditoria

Este módulo não deve:

- chamar `logAction`;
- salvar histórico persistente de rolagens;
- expor tela de auditoria;
- marcar no payload público que um override foi aplicado.

Logs técnicos de erro continuam permitidos.

## Overrides por console

### Princípio

O comando de console é uma funcionalidade oculta e deliberadamente permissiva.

Não deve haver affordance visual pública para isso. Qualquer usuário que saiba o comando pode usá-lo para si ou, no contexto Owlbear, para um alvo que consiga referenciar conforme a integração permitir.

### API global

Expor no browser:

```ts
window.diceResult.min(...)
window.diceResult.max(...)
window.diceResult.range(...)
window.diceResult.exact(...)
window.diceResult.clear(...)
window.diceResult.list(...)
```

### Fora do Owlbear

Assinaturas:

```ts
window.diceResult.min("d20", 10)
window.diceResult.max("d20", 10)
window.diceResult.range("d20", 10, 20)
window.diceResult.exact("d20", 17)
window.diceResult.clear("d20")
window.diceResult.list()
```

Fora do Owlbear, o override deve ser escopado por um identificador local do dice roller, por exemplo:

- `diceSessionId` gerado no navegador e persistido em `localStorage`;
- usuário autenticado atual, se disponível;
- combinação dos dois quando útil.

O objetivo é afetar a próxima rolagem feita naquele contexto local, sem depender de ficha ou jogador Owlbear.

### Dentro do Owlbear

Assinaturas:

```ts
window.diceResult.min("player-name", "d20", 10)
window.diceResult.max("player-name", "d20", 10)
window.diceResult.range("player-name", "d20", 10, 20)
window.diceResult.exact("player-name", "d20", 17)
window.diceResult.clear("player-name", "d20")
window.diceResult.list("player-name")
```

A integração Owlbear deve resolver `player-name` para um identificador mais estável quando possível:

- preferir `owlbearPlayerId`;
- aceitar `sheetId` quando a rolagem vier de ficha vinculada;
- permitir nome apenas como conveniência de console.

Se houver ambiguidade de nome, o comando deve retornar erro claro no console e não criar override.

### Endpoint de overrides

Criar endpoint geral:

```txt
POST /api/dice/overrides
GET /api/dice/overrides
DELETE /api/dice/overrides
```

O Owlbear pode usar wrappers próprios sob `/api/owlbear`, mas a regra de negócio deve ficar no módulo geral sempre que possível.

Armazenamento recomendado:

- usar MongoDB com TTL ou limpeza por `expiresAt`;
- não usar memória de processo em produção, porque múltiplas instâncias ou reloads perderiam overrides;
- manter apenas overrides pendentes, sem histórico depois do consumo.

Modelo lógico:

```ts
interface DiceRollOverride {
  scope: "local" | "owlbear"
  targetId: string
  dice: DiceType
  min?: number
  max?: number
  exact?: number
  remainingUses: number
  expiresAt?: string
}
```

Regras:

- `remainingUses` padrão é `1`;
- `exact` tem precedência sobre `min/max`;
- `min` e `max` são clampados entre `1` e o número de faces;
- override afeta o valor bruto do dado;
- modificador é aplicado depois;
- override consumido deve ser removido;
- `list` mostra apenas overrides pendentes do escopo acessível ao contexto atual.

## Integração com valores clicáveis

Valores da ficha ou de outros módulos não devem mandar fórmula livre para o backend.

Eles devem abrir o modal com um preset estruturado:

```ts
interface DiceRollPreset {
  label: string
  terms: DiceTerm[]
  modifier?: number
  mode?: DiceRollMode
  source: "sheet" | "manual" | "owlbear"
  sourceRef?: {
    sheetId?: string
    fieldId?: string
    owlbearPlayerId?: string
    roomId?: string
  }
}
```

Exemplo:

- iniciativa: `[{ dice: "d20", quantity: 1 }] + modifier`;
- perícia: `[{ dice: "d20", quantity: 1 }] + skillBonus`;
- dano seguro: termos explícitos já estruturados.

## Plano de implementação

1. Criar tipos e schemas Zod do dice roller.
2. Criar serviço backend de rolagem com `crypto.randomInt`.
3. Criar serviço backend de overrides sem auditoria.
4. Criar endpoints `/api/dice/rolls` e `/api/dice/overrides`.
5. Criar componentes `DiceRollerPanel` e `DiceRollerModal`.
6. Criar animação pseudo-3D para dados de `d4` a `d20`.
7. Criar `DiceRollerFab` ao lado do `GlobalSearchFAB`.
8. Expor `window.diceResult` fora do Owlbear.
9. Criar `RollableValue` para abrir modal com preset estruturado.
10. Adicionar testes unitários do motor, overrides, endpoints e componentes principais.

## Testes obrigatórios

- rolagem simples `1d20`;
- múltiplos dados `1d6 + 1d4`;
- modificador positivo e negativo;
- vantagem escolhendo maior `d20`;
- desvantagem escolhendo menor `d20`;
- override `min`;
- override `max`;
- override `range`;
- override `exact`;
- consumo de override após uma rolagem;
- ausência de chamadas de auditoria/log persistente;
- renderização do painel manual;
- abertura pelo FAB;
- abertura via preset de `RollableValue`.

## Fora do escopo v1

- física real de dados;
- Three.js;
- histórico persistente de rolagens;
- auditoria de rolagens;
- parser genérico de fórmulas livres;
- sons obrigatórios;
- skins customizáveis de dados;
- multiplayer fora do Owlbear.
