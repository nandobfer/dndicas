# Modulo: Owlbear

## Features

### Actions separadas
A integração do Owlbear é publicada como quatro manifests/actions independentes: `Dndicas: Compendium`, `Dndicas: Ficha`, `Dndicas: NPC & Iniciativa` e `Dndicas: Dados`. O manifesto legado `/owlbear/manifest.json` aponta para a action de catálogo enquanto o produto não foi publicado; os manifests dedicados ficam em `/owlbear/catalog/manifest.json`, `/owlbear/sheet/manifest.json`, `/owlbear/npcs/manifest.json` e `/owlbear/dice/manifest.json`.

`Dndicas: Compendium` renderiza apenas o catálogo embutido. `Dndicas: Ficha` renderiza `OwlbearGmSheetsTab` para GM ou `OwlbearPlayerSheetTab` para PLAYER. `Dndicas: NPC & Iniciativa` renderiza uma navegação interna entre `OwlbearGmNpcsTab` e `OwlbearGmInitiativeTab`. `Dndicas: Dados` renderiza apenas `OwlbearDiceTab`, permitindo manter os dados abertos enquanto outra action mostra ficha, NPCs ou catálogo.

Os ícones das actions são servidos por route handlers em `/owlbear/icons/catalog.svg`, `/owlbear/icons/sheet.svg`, `/owlbear/icons/npcs.svg` e `/owlbear/icons/dice.svg`, sempre com `Content-Type: image/svg+xml`, `Access-Control-Allow-Origin: *` e `Cache-Control: no-store`. As fontes ficam em `public/owlbear/catalog.svg`, `public/owlbear/sheet.svg`, `public/owlbear/npc.svg` e `public/owlbear/dice.svg`; os SVGs usam `currentColor`, `viewBox="0 0 24 24"` e não devem ter `width`/`height` fixos para permitir que o Owlbear controle cor e tamanho.

### Action compartilhada de dados da sala
A action `Dndicas: Dados` renderiza o roller do Dndicas em modo embutido, com rolagens compartilhadas entre todos os clientes conectados à mesma sala, sem exibir aviso textual separado de quem realizou a ultima rolagem.

### Sincronização híbrida de rolagens
As rolagens ao vivo da aba `Dados` usam Soketi/Pusher para disparar animação e resultado imediatamente nos outros clientes conectados, enquanto a metadata da sala do Owlbear guarda um histórico curto compartilhado. O histórico mantém até 13 entradas recentes e não é persistido no MongoDB.

### Histórico compacto da sala
Cada entrada do histórico compartilhado inclui nome exibido, fórmula ao lado do nome, resultados dos dados, total e contexto visual da rolagem. Para jogadores, o nome exibido usa snapshot do nome da ficha vinculada quando disponível e cai para o nome do jogador Owlbear quando não há vínculo. Rolagens do GM aparecem como `MESTRE` com destaque visual. A seção usa o título `HISTÓRICO`, omite o modo em rolagens normais e mostra apenas `Vantagem` ou `Desvantagem` quando aplicável. Os chips de resultado seguem `diceColors` de `src/lib/config/colors.ts`, enquanto vantagem e crítico usam destaque verde e desvantagem/falha crítica usam destaque vermelho.

### Modal de desvincular ficha do GM
O modal de confirmação da aba `Fichas` renderiza campos ricos da ficha, como classe com mentions HTML, usando `MentionContent` para evitar HTML bruto no resumo da ficha a desvincular.

### Action NPCs do GM
A action `Dndicas: NPC & Iniciativa` combina as telas `NPCs` e `Iniciativa`. O GM precisa estar logado no Dndicas; sessões GM anônimas do Owlbear não podem criar ou vincular NPCs de usuário. Quando não há login real disponível para a action, a aba `NPCs` renderiza `OwlbearSignInPrompt` com o texto `Para gerenciar NPCs da sala, faça login no Dungeons & Dicas em uma aba do navegador e reabra esta action.` e link externo para `/sign-in`. A sala persiste apenas vínculos em `owlbear_room_npcs` (`roomId`, `userId`, `sourceKind`, `sourceId`, `hpCurrent`, `hpMax`), apontando para `UserNpc` ou `Monster`, sem duplicar stat blocks.

O topo da aba usa `SearchInput` e busca Fuse.js local nos NPCs já vinculados. `Adicionar NPC` abre opções para criar NPC com `NpcFormModal`, selecionar de `Meus NPCs` via `useInfiniteNpcs`, ou selecionar do `Catálogo de Monstros` via `useInfiniteMonsters`; as listas externas usam a busca Fuse.js dos endpoints existentes. Ao selecionar um monstro/NPC existente, o `InitialHpModal` é exibido oferecendo opções para usar a vida média, rolar os dados (calculando o modificador de Constituição quando omitido na fórmula) ou definir o valor manualmente. A tabela mostra foto, nome (com um badge numérico para nomes duplicados), PV atual/máximo, barra de progresso, input textual de delta de PV com suporte a `-`, e lixeira com confirmação. A barra de PV interpola cor continuamente de vermelho escuro em 0%, passando por amarelo em 50%, até verde em 100%. Clicar na linha expande `NpcPreview` com `AnimatePresence`/`motion` e também anima o fechamento.

As rotas Owlbear-aware de sala são `GET/POST /api/owlbear/rooms/[roomId]/npcs`, `PATCH/DELETE /api/owlbear/rooms/[roomId]/npcs/[npcId]` e `POST /api/owlbear/rooms/[roomId]/npcs/user-npcs`. Todas exigem Bearer token da sessão Owlbear, papel `GM`, `roomId` correspondente à sessão e usuário real do Clerk. Remover pela lixeira desvincula apenas a instância da sala; não apaga o NPC do usuário nem o monstro do catálogo.

### Iniciativa do GM
A action `Dndicas: NPC & Iniciativa` expõe uma opção interna `Iniciativa` apenas para GM. O estado da iniciativa fica na metadata da sala, em `initiative.npcs` e `initiative.players`, e é sincronizado por `useRoomInitiative` via `subscribeToRoomMetadata`.

Na aba `NPCs`, cada container de NPC mostra um botão com ícone de duas espadas e tooltip `Adicionar a iniciativa`. O clique rola `1d20`, soma o modificador de Destreza do NPC (`Math.floor((dexterity - 10) / 2)`) e salva o resultado em `initiative.npcs[npcId]`. Se o NPC já estiver na iniciativa, o valor é substituído por uma nova rolagem.

A aba `Iniciativa` lista em uma única ordem os NPCs adicionados e todas as fichas vinculadas da aba `Fichas`, ordenando por iniciativa decrescente. PCs aparecem automaticamente a partir de `playerLinks`; ao desvincular uma ficha, `clearPlayerSheetLink` remove também `initiative.players[sheetId]`. O container de PC mostra avatar, nome, CA, PV e input de iniciativa, sem sanfona, sem lixeira e sem input de PV. O container de NPC mostra avatar, nome, CA, PV, input de ajuste de PV, iniciativa rolada e lixeira que remove apenas da iniciativa. Clicar no container de NPC expande uma sanfona com o `NpcPreview` completo, igual à aba `NPCs`, para consultar ações e estatísticas sem trocar de aba. Ao passar o mouse ou focar o container de NPC, a action procura o token vinculado por metadata `kind: "npc"`/`refId` e cria um ring temporário com `OBR.scene.local`, visível apenas para o GM local e removido ao sair do hover/foco. O ajuste de PV do NPC usa a mesma API de sala da aba `NPCs`, mantendo as duas abas sincronizadas pela fonte de verdade `owlbear_room_npcs`.

### Sessão Owlbear simplificada
A autenticação Owlbear é propositalmente pragmática para suportar múltiplas actions simultâneas no mesmo jogo. `/api/owlbear/session` cria uma identidade de sala baseada em `roomId`, `owlbearPlayerId`, `role` e, quando houver, `userId` Clerk. Se não houver login Clerk, GM e PLAYER recebem usuários sintéticos (`owlbear-gm:*` e `owlbear-player:*`). Criar uma nova sessão não revoga sessões ativas anteriores, porque cada action/background pode abrir seu próprio iframe e todos precisam continuar funcionando ao mesmo tempo.

As APIs Owlbear continuam aceitando Bearer token, mas também podem aceitar contexto simples por headers (`x-owlbear-room-id`, `x-owlbear-player-id`, `x-owlbear-role`) quando o token não existe ou não é mais válido. Esse fallback é menos rígido por design: a segurança forte não é objetivo principal dentro do iframe de uma mesa entre amigos; o objetivo é manter o vínculo funcional entre sala, jogador, papel e ficha.

Durante a transição pós-login, `401` com usuário logado, erros de rede e respostas `5xx` em `/api/owlbear/session` seguem sendo tratados como transitórios com backoff curto. Recursos pessoais do Dndicas ainda dependem de usuário real: GM anônimo não deve disparar chamadas repetidas para APIs de NPCs pessoais; a UI deve mostrar mensagem de login quando a feature exige conta real.

Como actions Owlbear rodam em iframe cross-origin, cookies Auth.js podem ser bloqueados como third-party cookies. A action assina um canal Pusher público e imprevisível (`owlbear-auth-{channelId}`) e abre `/owlbear/auth/bridge?channelId=...&nonce=...` em uma aba top-level. Depois do login normal no Dndicas, essa página chama `/api/owlbear/auth/pusher-handoff`; o backend publica `owlbear-auth-ready` com um `handoffToken` curto no canal. A action recebe o evento sem refresh e envia o `handoffToken` para `/api/owlbear/session`, que cria uma `OwlbearSession` autenticada para a sala sem depender do cookie dentro do iframe.

### Log de mapeamento `playerId`
Quando a action do Owlbear inicializa o contexto do roller, ela combina o jogador atual de `sdk.player` com `sdk.party.getPlayers()`, deduplica por `id` e emite um log com `{ name, id, role }` no console para facilitar overrides manuais por `playerId` sem depender do nome exibido.

### Carregamento contextual do SDK
O SDK do Owlbear deve ser carregado apenas em superfícies Owlbear reais, como `/owlbear/*`, embeds conhecidos ou iframes ativos da integração. O site normal mantém o roller local sem importar o SDK, evitando dependências indevidas de chunks Owlbear fora desse contexto.

Em superfícies `/owlbear/*`, `sdk.isAvailable === false` no primeiro tick é tratado como estado transitório. `useOwlbearRuntime` mantém `status: "booting"` e faz retry com backoff (250ms, 500ms, 1s, 2s) até o SDK ficar disponível ou `OBR.onReady` disparar. O banner `SDK Owlbear indisponível nesta action` só deve aparecer fora de contexto Owlbear real, evitando falso negativo quando a action abre antes do SDK terminar de hidratar.

O runtime Owlbear pré-carrega `@owlbear-rodeo/sdk` via import estático em `src/features/owlbear/owlbear-sdk-client.ts`, um módulo client-only consumido por `useOwlbearRuntime`, antes dos effects React. Não mova esse import para `useEffect`, `import()` assíncrono ou `require` condicional: o SDK registra o listener de `message` durante a avaliação do módulo e pode perder o evento `OBR_READY` se for carregado tarde demais. As páginas das actions que usam runtime devem declarar `export const dynamic = "force-dynamic"` para evitar prerender do Next sobre o grafo que contém o SDK.

As rotas que usam `useOwlbearRuntime` (`sheet`, `npcs`, `dice` e backgrounds) devem importar `src/features/owlbear/owlbear-action-surface.tsx` diretamente, sem `dynamic(..., { ssr: false })`, para manter o import estático do SDK no bundle client inicial e não perder o handshake `OBR_READY`. A action de catálogo/legado fica em `src/features/owlbear/owlbear-catalog-action.tsx` porque não precisa do runtime nem deve puxar o SDK no grafo SSR.

A action de catálogo (`/owlbear/catalog/action`) não usa `useOwlbearRuntime`, porque não precisa de `role`, `roomId`, `playerId` ou `sceneReady`; manter runtime Owlbear nessa action pode causar retry infinito em iframes onde o catálogo não recebe `OBR_READY`. Logs verbosos de runtime/sessão/action ficam atrás de `?dndicasDebug=1` ou `localStorage.dndicasOwlbearDebug = "1"`.

### Fichas do GM na action
Na aba `Fichas`, o `SheetForm` do painel selecionado usa `key={selectedSheet._id}` para forçar remount completo ao alternar entre fichas. Isso evita reaproveitar caches internos de `react-hook-form`, subscriptions realtime e editores ricos ao voltar para uma ficha já visitada dentro da action.

Para jogadores sem login real no Dndicas, `OwlbearPlayerSheetTab` renderiza `OwlbearSignInPrompt` com link externo para `/owlbear/auth/bridge`. Depois do login em uma aba normal, o handoff via Pusher permite criar a sessão Owlbear autenticada sem reabrir a action; o fluxo volta para a seleção/criação de fichas com `MySheetsContent`, mantendo o vínculo da ficha na metadata da sala.

### Context menu de vínculo de token com personagem ou NPC
O `OwlbearGmSceneController` roda com escopos diferentes por action/background. O background da extensão `Dndicas: Ficha` registra `Vincular a personagem`; o background da extensão `Dndicas: NPC & Iniciativa` registra `Vincular a NPC`; o menu `Desvincular` fica no background da ficha para evitar duplicar o item quando ambas as extensões estão instaladas. O registro dos menus depende apenas do runtime Owlbear pronto e papel `GM`, não da sessão backend pronta, para evitar que falhas ou delays de sessão escondam o menu.

Ao clicar em vincular, o background salva o vínculo pendente em `OBR.player.metadata["com.dndicas.owlbear/pending-token-link"]`, chama `OBR.action.open()` da própria extensão e usa `OBR.player.deselect([tokenId])` para fechar o context menu nativo. A action correta lê essa metadata, resolve o token na cena e abre somente o modal correspondente: seleção de personagem na action de ficha ou seleção de NPC na action de NPCs. Depois que o usuário seleciona personagem ou NPC, o vínculo é sincronizado, a metadata pendente é limpa e a action é fechada com `OBR.action.close()`.

O vínculo do token fica em `item.metadata["com.dndicas.owlbear/token"]` com `kind: "player" | "npc"`, `refId`, `tokenId`, `overlayIds` e `linkedAt`. Para personagens, `refId` aponta para a `CharacterSheet`; para NPCs, aponta para o `OwlbearRoomNpc` da sala. A seleção de personagem usa a mesma fonte da aba `Fichas` (`useRoomLinkedSheets`) e a seleção de NPC usa a mesma fonte da aba `NPCs` (`useRoomNpcs`). O ícone dos context menus é servido por `/owlbear/icons/context-menu.svg` com CORS; não use assets estáticos de `public/` diretamente em context menus do Owlbear.

O overlay de HP foi simplificado para uma barra visual sem texto, formada por `backdrop` e `bar` em itens de cena anexados ao token. A barra usa `hpCurrent`/`hpMax` da ficha ou NPC vinculado, compartilha `hpPercent` e `getHpBarColor` de `src/features/owlbear/hp-bar-utils.ts`, e interpola vermelho escuro em 0%, amarelo em 50% e verde em 100%. O sync de overlays é debounced, tem trava de reentrância, faz no-op quando posição/largura/cor já estão corretas e recria overlays legados que ainda tenham `role: "label"`, evitando loops de `scene.items.onChange` e rate limit do SDK. Mudanças de HP em `gm-sheets-tab.tsx` e `gm-npcs-tab.tsx` disparam `notifyOwlbearOverlaySync`, que atualiza um cache local no controller e chama sync imediato, reduzindo a dependência de polling ou movimento manual do token. O SVG do context menu é `public/owlbear-context-menu.svg`.

O modal de seleção de personagem renderiza campos potencialmente ricos (`class`, `race`) com `MentionContent`, evitando HTML bruto em fichas que salvam mentions ou tags geradas pelo editor rico.
