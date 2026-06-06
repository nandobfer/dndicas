# Modulo: Owlbear

## Features

### Tamanho fixo da action
A action do Owlbear declara `1320x900` no manifest e nao redimensiona dinamicamente por aba. `Catalogo`, `Dados`, `Ficha`, `Fichas`, `NPCs` e os modos picker/editor da ficha compartilham o mesmo tamanho externo.

### Aba compartilhada de dados da sala
A action do Owlbear expõe uma aba `Dados` ao lado de `Catálogo` para GM e PLAYER. Essa aba renderiza o roller do Dndicas em modo embutido, com rolagens compartilhadas entre todos os clientes conectados à mesma sala, sem exibir aviso textual separado de quem realizou a ultima rolagem.

### Sincronização híbrida de rolagens
As rolagens ao vivo da aba `Dados` usam Soketi/Pusher para disparar animação e resultado imediatamente nos outros clientes conectados, enquanto a metadata da sala do Owlbear guarda um histórico curto compartilhado. O histórico mantém até 13 entradas recentes e não é persistido no MongoDB.

### Histórico compacto da sala
Cada entrada do histórico compartilhado inclui nome exibido, fórmula ao lado do nome, resultados dos dados, total e contexto visual da rolagem. Para jogadores, o nome exibido usa snapshot do nome da ficha vinculada quando disponível e cai para o nome do jogador Owlbear quando não há vínculo. Rolagens do GM aparecem como `MESTRE` com destaque visual. A seção usa o título `HISTÓRICO`, omite o modo em rolagens normais e mostra apenas `Vantagem` ou `Desvantagem` quando aplicável. Os chips de resultado seguem `diceColors` de `src/lib/config/colors.ts`, enquanto vantagem e crítico usam destaque verde e desvantagem/falha crítica usam destaque vermelho.

### Modal de desvincular ficha do GM
O modal de confirmação da aba `Fichas` renderiza campos ricos da ficha, como classe com mentions HTML, usando `MentionContent` para evitar HTML bruto no resumo da ficha a desvincular.

### Aba NPCs do GM
A aba `NPCs` do GM substitui o placeholder por uma lista real de NPCs vinculados à sala. O GM precisa estar logado no Dndicas; sessões GM anônimas do Owlbear não podem criar ou vincular NPCs de usuário. A sala persiste apenas vínculos em `owlbear_room_npcs` (`roomId`, `userId`, `sourceKind`, `sourceId`, `hpCurrent`, `hpMax`), apontando para `UserNpc` ou `Monster`, sem duplicar stat blocks.

O topo da aba usa `SearchInput` e busca Fuse.js local nos NPCs já vinculados. `Adicionar NPC` abre opções para criar NPC com `NpcFormModal`, selecionar de `Meus NPCs` via `useInfiniteNpcs`, ou selecionar do `Catálogo de Monstros` via `useInfiniteMonsters`; as listas externas usam a busca Fuse.js dos endpoints existentes. A tabela mostra foto, nome, PV atual/máximo, barra de progresso, input textual de delta de PV com suporte a `-`, e lixeira com confirmação. A barra de PV interpola cor continuamente de vermelho escuro em 0%, passando por amarelo em 50%, até verde em 100%. Clicar na linha expande `NpcPreview` com `AnimatePresence`/`motion` e também anima o fechamento.

As rotas Owlbear-aware de sala são `GET/POST /api/owlbear/rooms/[roomId]/npcs`, `PATCH/DELETE /api/owlbear/rooms/[roomId]/npcs/[npcId]` e `POST /api/owlbear/rooms/[roomId]/npcs/user-npcs`. Todas exigem Bearer token da sessão Owlbear, papel `GM`, `roomId` correspondente à sessão e usuário real do Clerk. Remover pela lixeira desvincula apenas a instância da sala; não apaga o NPC do usuário nem o monstro do catálogo.

### Sessão Owlbear e transição de login
`useOwlbearSession` inclui o estado Clerk (`auth`/`anon`) na identidade interna usada para reaproveitar sessão backend. Quando um usuário entra no Dndicas sem recarregar a action, o hook invalida a sessão Owlbear anterior e abre uma nova sessão com a autenticação atual. Isso evita que abas autenticadas, como `Ficha` do jogador e `NPCs` do GM, continuem usando token anônimo depois do login, enquanto a aba `Fichas` do GM ainda pode funcionar antes do login.

### Log de mapeamento `playerId`
Quando a action do Owlbear inicializa o contexto do roller, ela combina o jogador atual de `sdk.player` com `sdk.party.getPlayers()`, deduplica por `id` e emite um log com `{ name, id, role }` no console para facilitar overrides manuais por `playerId` sem depender do nome exibido.

### Carregamento contextual do SDK
O SDK do Owlbear deve ser carregado apenas em superfícies Owlbear reais, como `/owlbear/*`, embeds conhecidos ou iframes ativos da integração. O site normal mantém o roller local sem importar o SDK, evitando dependências indevidas de chunks Owlbear fora desse contexto.

### Context menu de vínculo de token com personagem ou NPC
O `OwlbearGmSceneController` registra context menus para GM com `Vincular a personagem`, `Vincular a NPC` e `Desvincular`. O registro dos menus depende apenas do runtime Owlbear pronto e papel `GM`, não da sessão backend pronta, para evitar que falhas ou delays de sessão escondam o menu. Os filtros do SDK ficam mínimos (`min/max` e `roles`) e a validação de item elegível acontece no `onClick`, porque filtros de `layer`/permissão podem divergir do shape real do item no Owlbear e esconder completamente o botão. Ao clicar em vincular, o controller chama `OBR.action.open()` para abrir a action e mostrar o modal de seleção mesmo quando o painel do Dndicas está fechado, e chama `OBR.player.deselect([tokenId])` para fechar o context menu nativo. Depois que o usuário seleciona personagem ou NPC, o vínculo é sincronizado e a action é fechada com `OBR.action.close()`.

O vínculo do token fica em `item.metadata["com.dndicas.owlbear/token"]` com `kind: "player" | "npc"`, `refId`, `tokenId`, `overlayIds` e `linkedAt`. Para personagens, `refId` aponta para a `CharacterSheet`; para NPCs, aponta para o `OwlbearRoomNpc` da sala. A seleção de personagem usa a mesma fonte da aba `Fichas` (`useRoomLinkedSheets`) e a seleção de NPC usa a mesma fonte da aba `NPCs` (`useRoomNpcs`).

O overlay de HP foi simplificado para uma barra visual sem texto, formada por `backdrop` e `bar` em itens de cena anexados ao token. A barra usa `hpCurrent`/`hpMax` da ficha ou NPC vinculado, compartilha `hpPercent` e `getHpBarColor` de `src/features/owlbear/hp-bar-utils.ts`, e interpola vermelho escuro em 0%, amarelo em 50% e verde em 100%. O sync de overlays é debounced, tem trava de reentrância, faz no-op quando posição/largura/cor já estão corretas e recria overlays legados que ainda tenham `role: "label"`, evitando loops de `scene.items.onChange` e rate limit do SDK. Mudanças de HP em `gm-sheets-tab.tsx` e `gm-npcs-tab.tsx` disparam `notifyOwlbearOverlaySync`, que atualiza um cache local no controller e chama sync imediato, reduzindo a dependência de polling ou movimento manual do token. O SVG do context menu é `public/owlbear-context-menu.svg`.

O modal de seleção de personagem renderiza campos potencialmente ricos (`class`, `race`) com `MentionContent`, evitando HTML bruto em fichas que salvam mentions ou tags geradas pelo editor rico.
