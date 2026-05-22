# Especificação do Plugin `dndicas` para Owlbear Rodeo

## Resumo

Esta especificação define a integração entre o Dndicas e o Owlbear Rodeo por meio de um plugin chamado `dndicas`.

O objetivo do plugin é permitir que jogadores e mestre usem, dentro do Owlbear, uma versão integrada de:

- fichas de personagem;
- fichas de NPC locais da mesa;
- catálogo/pesquisa global;
- vínculo entre token e ficha;
- HUD de vida acima do token;
- rolagens disparadas a partir de valores clicáveis da ficha.

Esta revisão adota a seguinte divisão de responsabilidades:

- Dndicas cuida apenas do que já é domínio próprio da aplicação:
  - autenticação;
  - catálogo;
  - fichas persistentes dos jogadores;
  - edição de ficha persistente;
  - autorização Owlbear-aware para permitir que o GM edite ficha persistente de outro usuário.
- Owlbear cuida do que é estado da mesa:
  - seleção da ficha do jogador naquela sala;
  - vínculo token ↔ ficha;
  - overlays de HP;
  - hints e metadados operacionais da integração.

Exceção deliberada desta v1:

- NPCs locais da mesa serão persistidos no MongoDB do Dndicas por `roomId`, mas continuam sendo tratados como entidades contextuais da mesa no design do plugin.

## Decisões Confirmadas da v1

- o Owlbear room é o "jogo atual";
- o plugin continua sendo uma única `action` com navegação interna por abas;
- o mestre pode editar a ficha persistente original do jogador;
- NPCs são locais à sala do Owlbear e identificados por `roomId`;
- um token pode ter no máximo uma ficha vinculada;
- uma mesma ficha pode ser vinculada a múltiplos tokens;
- a funcionalidade de rolagem depende da extensão oficial de dados do Owlbear;
- a autorização de mestre no backend é baseada em confiança na sessão criada pelo plugin, não em verificação criptográfica server-side do Owlbear;
- a fonte da verdade deixa de ser “o backend da integração” e passa a ser definida por tipo de dado.

## Base Técnica Confirmada

Com base em `docs/owlbear/owlbear_full.md`, esta especificação assume o uso de:

- `OBR.action` para a action principal do plugin e controle de largura/altura do popover;
- `OBR.contextMenu` para adicionar ações ao clique direito no token;
- `OBR.player.getRole()` para distinguir `GM` de `PLAYER`;
- `OBR.room.id` como identificador estável da sala;
- metadata em room, scene e items;
- `OBR.modal` e/ou embeds do próprio Owlbear quando útil;
- filtros por papel (`GM`/`PLAYER`) em itens de menu de contexto.

Limitações relevantes do SDK:

- `room metadata` tem limite total de 16 kB;
- por isso, o Owlbear não deve armazenar fichas completas de jogador;
- a metadata do Owlbear deve guardar apenas vínculos, referências leves e estado operacional de mesa.

## Arquitetura Geral

### Estrutura da extensão

O plugin `dndicas` será exposto como uma única `action` do Owlbear chamada `dndicas`.

Ao clicar nessa action, será aberto um popover com uma shell interna do plugin. Essa shell terá navegação própria por abas.

### Papéis e navegação

As abas exibidas dependem do papel atual no Owlbear:

- `GM`
  - `Fichas`
  - `NPCs`
  - `Catálogo`
- `PLAYER`
  - `Ficha`
  - `Catálogo`

### Unidade de escopo

O `roomId` do Owlbear é a unidade de escopo da integração.

Isso significa:

- a escolha de ficha do jogador pertence à sala;
- NPCs locais pertencem à sala;
- vínculo token ↔ ficha depende da sala e da cena;
- overlays de HP pertencem à cena, mas referenciam entidades da sala.

### Ownership por tipo de dado

Esta é a regra central da arquitetura:

- Dndicas é fonte canônica de:
  - usuário autenticado;
  - catálogo;
  - fichas persistentes de jogador;
  - permissões de edição persistente;
  - NPCs locais escopados por `roomId`.
- Owlbear é fonte canônica de:
  - vínculo `owlbearPlayerId -> sheetId` daquela sala;
  - vínculo `tokenId -> { kind, refId }`;
  - IDs e marcações dos overlays;
  - hints e metadados operacionais da mesa.

## Objetivos Funcionais

O plugin precisa entregar os seguintes comportamentos:

1. Permitir ao mestre gerenciar fichas dos personagens vinculados à mesa.
2. Permitir ao mestre criar, editar e remover NPCs locais da sala.
3. Permitir ao jogador escolher sua ficha ao entrar na integração pela primeira vez.
4. Permitir reabrir a ficha do jogador diretamente após o vínculo inicial.
5. Permitir abrir o catálogo de forma integrada dentro do Owlbear.
6. Tornar certos valores da ficha clicáveis para rolagem.
7. Permitir ao mestre vincular tokens a fichas por menu de contexto.
8. Exibir HP e HP temporário acima do token vinculado.
9. Sincronizar mudanças entre ficha, vínculo e overlay.

## Reaproveitamento de UI Existente

### Aba `Fichas` do mestre

A base visual deve reaproveitar o padrão de lista de:

- `src/app/(dashboard)/my-sheets/_components/sheets-list.tsx`

Mas a fonte de dados não será "minhas fichas". Nesta aba, a lista representa:

- as fichas de personagens vinculadas ao jogo atual;
- agrupadas a partir do vínculo de sala mantido no Owlbear.

### Aba `NPCs`

Também deve reaproveitar a mesma base visual de lista acima, com extensões para:

- adicionar NPC;
- editar NPC;
- remover NPC da sala.

### Aba `Ficha` do jogador

O conteúdo principal deve reutilizar:

- `src/features/character-sheets/components/sheet-form.tsx`

Com um ajuste obrigatório:

- o layout desktop deve ser preservado independentemente do tamanho do iframe;
- o modo mobile responsivo atual não será usado dentro do Owlbear.

### Seleção inicial da ficha do jogador

Quando o jogador não tiver ficha vinculada para a sala atual, deve aparecer um fluxo baseado em:

- `src/app/(dashboard)/my-sheets/page.tsx`

Esse fluxo serve para:

- selecionar uma ficha existente;
- ou criar uma nova ficha.

### Dialogs de confirmação

Os dialogs de confirmação devem se inspirar no padrão visual de:

- `src/features/spells/components/delete-spell-dialog.tsx`

Esse estilo será usado para:

- confirmar vínculo de ficha existente do jogador;
- confirmar criação e vínculo de nova ficha;
- opcionalmente confirmar desvínculos e remoções no Owlbear, quando aplicável.

### Aba `Catálogo`

O conteúdo deve reaproveitar a experiência do componente:

- `src/components/ui/global-search-fab.tsx`

Mas adaptado para uso embutido no plugin, sem FAB flutuante.

O comportamento desejado é semelhante ao da busca do dashboard principal:

- campo de busca fixo;
- resultados paginados;
- navegação por entidades;
- visual consistente com o padrão atual do Dndicas.

## Modelo de Dados

### Regra de armazenamento

Dados completos da integração não devem ser guardados em metadata do Owlbear.

No Owlbear, a metadata deve conter apenas:

- vínculos;
- IDs;
- hints de sincronização;
- marcação de overlays e itens gerenciados pelo plugin.

No Dndicas, devem continuar apenas:

- entidades persistentes do sistema;
- NPCs locais por `roomId`;
- sessão Owlbear-aware para autorização.

### `room metadata` como estado principal da mesa

`room metadata` é a fonte canônica do estado leve da mesa.

Ele deve guardar, no mínimo:

```ts
interface DndicasRoomMetadata {
  version: number
  playerLinks: Record<string, string>
  lastSyncAt?: string
}
```

Onde:

- a chave do `playerLinks` é `owlbearPlayerId`;
- o valor é `sheetId` da ficha persistente no Dndicas.

Esse vínculo é a fonte oficial para decidir:

- qual ficha um jogador deve abrir na sala atual;
- quais fichas de jogador aparecem na aba `Fichas` do mestre.

### `item metadata` para vínculo token ↔ ficha

Cada token vinculado deve receber metadata leve em namespace próprio:

```ts
interface DndicasTokenLinkMetadata {
  roomId: string
  sceneId: string
  tokenId: string
  kind: "player" | "npc"
  refId: string
  overlayIds: string[]
}
```

Onde:

- `kind: "player"` indica referência a `sheetId` do Dndicas;
- `kind: "npc"` indica referência a `npcId` local daquela sala;
- `overlayIds` guarda os itens visuais gerenciados pelo plugin para esse token.

Esse metadata é a fonte canônica do vínculo concreto do token.

### `scene metadata`

`scene metadata` não é a fonte principal da mesa.

Pode ser usado apenas quando necessário para:

- índices auxiliares por cena;
- agrupamento operacional de overlays;
- flags de sincronização específicas da cena.

Se não houver necessidade clara, a implementação deve preferir `room metadata` e `item metadata`.

### NPCs locais da sala

NPCs locais continuam existindo apenas no contexto da mesa, mas serão persistidos no MongoDB do Dndicas por `roomId`.

Shape mínimo esperado:

```ts
interface OwlbearLocalNpc {
  id: string
  roomId: string
  name: string
  data: CharacterSheetFullLike
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
```

No Owlbear, nunca deve ser armazenada a ficha completa do NPC.

O Owlbear guarda apenas:

- `npcId`;
- vínculo do token com o NPC;
- overlays e hints operacionais.

## Autorização

### Princípio da v1

O backend aceitará uma sessão de integração Owlbear criada pelo frontend/plugin.

Essa sessão deve carregar, no mínimo:

- `roomId`;
- `owlbearPlayerId`;
- `owlbearRole`;
- usuário autenticado do Dndicas;
- timestamps de expiração.

### Função da sessão

A sessão Owlbear-aware existe apenas para:

- autenticar o usuário do Dndicas no contexto do plugin;
- autorizar o GM a editar ficha persistente de outro jogador;
- autorizar operações de NPC local por `roomId`;
- restringir ações conforme o papel `GM` ou `PLAYER`.

Ela não é a fonte canônica do estado da mesa e não deve ser tratada como armazenamento da integração.

### Política de permissões

Regras:

- jogador só pode:
  - vincular sua própria ficha à sala;
  - criar sua própria ficha persistente;
  - editar sua própria ficha persistente vinculada;
  - consultar catálogo;
- mestre pode:
  - editar a ficha persistente original de qualquer jogador vinculado à sala;
  - criar, editar e remover NPCs locais da sala;
  - vincular ou desvincular tokens;
  - desvincular fichas de jogadores da sala.

### Observação de segurança

Esta v1 assume confiança no plugin e no papel fornecido pelo SDK no cliente.

Não existe, nesta especificação, validação criptográfica server-side do papel no Owlbear.

Essa decisão deve ser explicitada no documento técnico e tratada como dívida técnica conhecida.

## APIs Novas

### Sessão de integração

Criar endpoint para abrir sessão Owlbear:

- `POST /api/owlbear/session`

Responsabilidades:

- validar usuário autenticado no Dndicas;
- receber `roomId`, `owlbearPlayerId`, `owlbearRole`;
- emitir sessão curta para rotas Owlbear-aware.

### NPCs locais da sala

Como NPC local ficará no Dndicas por `roomId`, a spec mantém APIs próprias:

- `GET /api/owlbear/rooms/:roomId/npcs`
- `POST /api/owlbear/rooms/:roomId/npcs`
- `PATCH /api/owlbear/rooms/:roomId/npcs/:npcId`
- `DELETE /api/owlbear/rooms/:roomId/npcs/:npcId`

Essas rotas servem apenas para NPCs locais, não para player links ou token links.

### Edição de ficha persistente via Owlbear

Criar rotas Owlbear-aware para edição de fichas persistentes quando o usuário atual for GM da sala, mesmo sem ser dono da ficha.

Essas rotas não devem alterar a política geral das rotas atuais de ficha. A permissão adicional deve existir apenas no contexto da integração Owlbear.

### Rotas removidas desta revisão

Esta revisão não exige mais rotas backend como fonte primária para:

- `player-links`;
- `token-links`;
- estado agregado completo da sala.

Se algum endpoint agregado for mantido por conveniência de bootstrap, ele deve ser explicitamente tratado como leitura agregada e não como fonte da verdade dos vínculos da mesa.

## Fluxos de Interface

### Shell do plugin

Ao abrir a action `dndicas`:

1. inicializar SDK Owlbear;
2. ler `roomId`, `playerId` e `role`;
3. abrir/renovar sessão backend Owlbear;
4. ler o estado leve da mesa no próprio Owlbear;
5. consultar no Dndicas apenas o que pertence ao Dndicas;
6. renderizar as abas permitidas pelo papel.

### Dimensionamento do popover

Usar `OBR.action.setWidth` e `OBR.action.setHeight` conforme a aba atual.

Diretriz:

- `Ficha`: maior largura e altura;
- `Fichas` e `NPCs`: largura média-alta;
- `Catálogo`: largura média;
- fluxo inicial de seleção: igual ou maior que `Fichas`.

Os valores exatos podem ser ajustados em implementação, mas a ficha deve priorizar conforto de edição.

### Fluxo do jogador sem ficha vinculada

Ao abrir `Ficha` pela primeira vez na sala:

1. verificar em `room metadata` se existe `playerLink` para `owlbearPlayerId`;
2. se não existir, mostrar tela de seleção baseada em `my-sheets/page.tsx`;
3. permitir clicar em uma ficha existente;
4. permitir criar nova ficha;
5. em ambos os casos, abrir confirmação em dialog;
6. ao confirmar:
   - ficha existente: gravar vínculo em `room metadata`;
   - nova ficha: criar ficha persistente no Dndicas e depois gravar vínculo em `room metadata`;
7. após vínculo bem-sucedido, carregar `SheetForm`.

### Fluxo do jogador com ficha já vinculada

Ao abrir `Ficha`:

1. ler `sheetId` em `room metadata`;
2. carregar a ficha persistente correspondente no Dndicas;
3. renderizar `SheetForm` em modo desktop;
4. permitir edição normal da própria ficha.

### Desvínculo pelo mestre

Na aba `Fichas`, o mestre deve poder remover o vínculo de uma ficha de jogador com a sala.

Após isso:

- a ficha persistente continua existindo no Dndicas;
- o vínculo é removido de `room metadata`;
- o jogador volta ao fluxo de seleção no próximo acesso.

### Fluxo da aba `Fichas`

A aba do mestre deve listar apenas fichas de personagens vinculadas à sala atual.

Cada item deve permitir:

- abrir a ficha;
- editar com permissão total;
- desvincular da sala.

A lista é derivada de:

- `room metadata` para obter os `sheetIds` vinculados;
- Dndicas para carregar os detalhes das fichas persistentes.

### Fluxo da aba `NPCs`

A aba deve permitir:

- listar NPCs locais da sala;
- criar NPC novo;
- abrir/editar NPC;
- remover NPC.

Ao remover NPC:

- remover registro local no Dndicas;
- limpar vínculos de token correspondentes no Owlbear;
- remover overlays associados.

## Ficha no Owlbear

### Regra de layout

Quando `SheetForm` estiver sendo renderizado dentro do Owlbear:

- o layout desktop deve permanecer ativo;
- a detecção responsiva que muda para mobile deve ser ignorada ou sobreposta;
- a rolagem interna do container deve ser controlada pelo plugin;
- o formulário deve continuar funcional em resoluções menores, mesmo mantendo composição desktop.

### Modo de leitura e escrita

Casos:

- jogador editando sua própria ficha persistente: edição normal;
- mestre editando ficha persistente do jogador: edição total;
- mestre editando NPC local: edição total;
- qualquer fluxo read-only futuro deve ser explicitamente opt-in, não default.

## Valores Roláveis

### Objetivo

Alguns valores da ficha devem ser clicáveis, com hover state visível, para disparar rolagens.

Exemplos prioritários:

- iniciativa;
- perícias como `Arcanismo`;
- bônus de ataque;
- dano.

### Regras de UX

Todo valor rolável deve ter:

- cursor de ação;
- hover state compatível com o visual do Dndicas;
- affordance clara de que é interativo;
- label de acessibilidade/tooltip quando necessário.

### Estratégia técnica

Não fazer parsing genérico de texto livre em toda a ficha.

Cada ponto clicável deve ser definido de forma estruturada, com:

- label da rolagem;
- fórmula base;
- modificadores;
- tipo de rolagem;
- origem do valor.

Estruturas esperadas:

- iniciativa: `1d20 + modificador`;
- perícia: `1d20 + valor calculado`;
- ataque: `1d20 + bônus de ataque`, quando a fórmula for segura;
- dano: fórmula explícita do campo de dano, quando parseável de forma confiável.

### Limite da v1

Campos cujo valor não possa ser derivado com segurança não devem ficar clicáveis na v1.

### Integração com a extensão oficial de dados

A implementação deve:

1. verificar se a extensão oficial de dados do Owlbear está presente/ativa;
2. verificar se existe interface pública estável de interoperabilidade;
3. usar essa interface quando ela existir;
4. se ela não existir, a funcionalidade de clique-para-rolar não deve ser entregue de forma simulada nesta v1.

Comportamento quando o requisito não estiver disponível:

- exibir estado de indisponibilidade;
- desabilitar valores roláveis;
- informar de forma clara que a extensão oficial é necessária.

## Vínculo entre Token e Ficha

### Criação do menu de contexto

Criar um item de `OBR.contextMenu` visível apenas para `GM`.

A ação deve aparecer quando houver token/item elegível selecionado.

Rótulos:

- `Vincular ficha`
- `Desvincular ficha`

### Fluxo de vínculo

Ao clicar em `Vincular ficha`:

1. abrir seletor integrado do plugin;
2. oferecer como opções:
   - fichas de jogadores já vinculadas à sala;
   - NPCs locais da sala;
3. ao confirmar:
   - gravar vínculo no `item metadata` do token;
   - criar ou atualizar overlays de HP;
   - não depender de endpoint backend para persistir o vínculo do token.

### Cardinalidade

Regra da v1:

- um token possui no máximo um vínculo;
- uma ficha pode ser vinculada a múltiplos tokens.

Ao vincular novamente um token já vinculado:

- o vínculo anterior é substituído no `item metadata`.

## Overlay de HP acima do token

### Objetivo

Exibir acima do token vinculado:

- barra de HP atual;
- faixa ou indicação de HP temporário;
- aparência alinhada ao padrão visual usado em `sheet-form.tsx`.

### Estratégia

Não assumir HUD nativo do Owlbear para HP.

O plugin será responsável por seus próprios overlays na cena.

Cada vínculo token ↔ ficha deve resultar em um conjunto de overlay items gerenciados pelo plugin.

Esses overlays devem:

- ficar ancorados acima do token;
- acompanhar posição e escala do token;
- ser identificáveis por metadata do plugin;
- ser recriados ou limpos quando o vínculo mudar.

### Fonte dos valores

Para fichas persistentes:

- usar `hpCurrent`, `hpMax`, `hpTemp` da ficha original do Dndicas.

Para NPC local:

- usar os mesmos campos armazenados no registro do NPC local no Dndicas.

### Sincronização obrigatória

Atualizar overlays quando:

- HP atual mudar;
- HP temporário mudar;
- HP máximo mudar, se impactar proporção;
- token mover;
- token mudar de escala;
- vínculo for criado;
- vínculo for removido;
- NPC local for removido.

## Sincronização e Fonte da Verdade

### Fonte canônica por tipo de dado

A fonte canônica da verdade é:

- Dndicas para fichas persistentes de jogador;
- Dndicas para NPCs locais por `roomId`;
- `room metadata` do Owlbear para `playerLinks`;
- `item metadata` do Owlbear para vínculo token ↔ ficha e IDs de overlays.

### Sem espelho redundante backend ↔ Owlbear

Esta revisão evita duplicar os vínculos de mesa entre backend e metadata do Owlbear.

Isso reduz:

- complexidade de sincronização;
- risco de divergência entre estado do backend e estado visual da sala;
- necessidade de APIs de “estado agregado” só para a integração.

### Atualização reativa

Para fichas persistentes:

- reaproveitar os mecanismos reativos já existentes do sistema onde possível.

Para NPC local:

- manter fluxo de leitura e escrita pelo backend do Dndicas, já que o NPC é persistido por `roomId`.

Para vínculos da mesa:

- usar leitura e escrita diretamente via Owlbear metadata.

## Requisitos Não Funcionais

### Performance

- não carregar listas globais desnecessárias;
- carregar apenas estado da sala e entidades necessárias à aba atual;
- evitar polling agressivo;
- minimizar escrita em metadata do Owlbear;
- evitar roundtrips ao backend para vínculos que pertencem à sala.

### Resiliência

O plugin deve degradar bem nos seguintes cenários:

- sala sem cena pronta;
- token sem vínculo;
- jogador sem ficha vinculada;
- extensão oficial de dados indisponível;
- metadata do token ausente ou inconsistente;
- `room metadata` apontando para `sheetId` inexistente;
- `item metadata` apontando para `npcId` removido.

### Compatibilidade visual

O plugin deve:

- respeitar light/dark theme do Owlbear quando possível;
- manter legibilidade no iframe;
- não depender de layout mobile para a ficha;
- preservar a linguagem visual do Dndicas.

## Casos de Teste e Aceite

### Navegação por papel

- GM vê apenas `Fichas`, `NPCs`, `Catálogo`.
- PLAYER vê apenas `Ficha`, `Catálogo`.

### Primeiro acesso do jogador

- Sem vínculo prévio, a aba `Ficha` abre o fluxo de seleção.
- Selecionar ficha existente abre dialog de confirmação.
- Criar nova ficha abre dialog de confirmação.
- Confirmando, o vínculo é criado corretamente em `room metadata`.

### Reentrada do jogador

- Com vínculo existente, a aba `Ficha` abre diretamente o `SheetForm`.

### Desvínculo de jogador pelo mestre

- O mestre remove o vínculo de um jogador.
- A ficha persistente continua existindo fora do Owlbear.
- O vínculo é removido de `room metadata`.
- O jogador volta a selecionar ficha no próximo acesso.

### Gestão de NPC

- Mestre cria NPC local.
- Mestre edita NPC local.
- Mestre remove NPC local.
- Remoção limpa vínculos de token e overlays associados no Owlbear.

### Edição persistente pelo mestre

- Mestre abre uma ficha de jogador vinculada à sala.
- Mestre edita a ficha com permissão total.
- A alteração persiste na ficha original do Dndicas.

### Vínculo com token

- Mestre seleciona token e usa `Vincular ficha`.
- Mestre escolhe ficha de jogador ou NPC local.
- O vínculo é salvo no `item metadata` do token.
- Mestre consegue `Desvincular ficha`.

### Overlay de HP

- Token vinculado exibe barra correta de HP atual.
- Token vinculado exibe faixa correta de HP temporário.
- Alterar HP na ficha atualiza o overlay.
- Mover ou redimensionar token reposiciona o overlay.
- Dois tokens ligados à mesma ficha exibem o mesmo estado de HP.

### Layout da ficha

- A aba `Ficha` mantém layout desktop em telas pequenas.
- O formulário continua utilizável dentro do iframe.

### Rolagem

- Valores suportados mostram hover state e affordance clicável.
- Valores suportados disparam integração de rolagem quando a interface oficial estiver disponível.
- Sem extensão oficial de dados, a feature aparece desabilitada com mensagem apropriada.

### Recuperação de inconsistências

- Se `room metadata` apontar para ficha inexistente, o jogador volta ao fluxo de seleção.
- Se `item metadata` apontar para NPC removido, o vínculo e o overlay são limpos.

## Fora de Escopo da v1

- Persistência global de NPCs no Dndicas fora do escopo do `roomId`.
- Sincronização criptograficamente verificável entre backend Dndicas e papel do usuário no Owlbear.
- Parsing universal de qualquer texto da ficha para rolagem automática.
- Suporte a múltiplas fichas de jogador por `owlbearPlayerId` ao mesmo tempo na mesma sala.
- HUD nativo do Owlbear, caso exista API privada não documentada.

## Próximos Passos de Implementação

Ordem sugerida:

1. Estruturar a shell do plugin Owlbear e a inicialização do SDK.
2. Criar sessão Owlbear-aware apenas para autenticação e autorização.
3. Implementar leitura e escrita de `room metadata` para vínculo de ficha do jogador.
4. Implementar aba `Fichas` do mestre derivada de `room metadata` + fichas persistentes.
5. Implementar CRUD de NPC local por `roomId`.
6. Implementar `contextMenu` para vínculo token ↔ ficha em `item metadata`.
7. Implementar overlays de HP.
8. Adaptar `SheetForm` para modo Owlbear desktop-only.
9. Introduzir componentes de valores roláveis.
10. Integrar com a extensão oficial de dados, se a interoperabilidade pública se confirmar.
