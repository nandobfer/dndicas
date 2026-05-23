# Modulo: Owlbear

## Features

### Tamanho fixo da action
A action do Owlbear declara `1320x900` no manifest e nao redimensiona dinamicamente por aba. `Catalogo`, `Dados`, `Ficha`, `Fichas`, `NPCs` e os modos picker/editor da ficha compartilham o mesmo tamanho externo.

### Aba compartilhada de dados da sala
A action do Owlbear expõe uma aba `Dados` ao lado de `Catálogo` para GM e PLAYER. Essa aba renderiza o roller do Dndicas em modo embutido, com rolagens compartilhadas entre todos os clientes conectados à mesma sala, sem exibir aviso textual separado de quem realizou a ultima rolagem.

### Sincronização híbrida de rolagens
As rolagens ao vivo da aba `Dados` usam Soketi/Pusher para disparar animação e resultado imediatamente nos outros clientes conectados, enquanto a metadata da sala do Owlbear guarda um histórico curto compartilhado. O histórico mantém até 50 entradas recentes e não é persistido no MongoDB.

### Histórico compacto da sala
Cada entrada do histórico compartilhado inclui nome exibido, fórmula ao lado do nome, resultados dos dados, total e contexto visual da rolagem. Para jogadores, o nome exibido usa snapshot do nome da ficha vinculada quando disponível e cai para o nome do jogador Owlbear quando não há vínculo. Rolagens do GM aparecem como `MESTRE` com destaque visual. A seção usa o título `HISTÓRICO`, omite o modo em rolagens normais e mostra apenas `Vantagem` ou `Desvantagem` quando aplicável. Os chips de resultado seguem `diceColors` de `src/lib/config/colors.ts`, enquanto vantagem e crítico usam destaque verde e desvantagem/falha crítica usam destaque vermelho.

### Modal de desvincular ficha do GM
O modal de confirmação da aba `Fichas` renderiza campos ricos da ficha, como classe com mentions HTML, usando `MentionContent` para evitar HTML bruto no resumo da ficha a desvincular.

### Log de mapeamento `playerId`
Quando a action do Owlbear inicializa o contexto do roller, ela combina o jogador atual de `sdk.player` com `sdk.party.getPlayers()`, deduplica por `id` e emite um log com `{ name, id, role }` no console para facilitar overrides manuais por `playerId` sem depender do nome exibido.

### Carregamento contextual do SDK
O SDK do Owlbear deve ser carregado apenas em superfícies Owlbear reais, como `/owlbear/*`, embeds conhecidos ou iframes ativos da integração. O site normal mantém o roller local sem importar o SDK, evitando dependências indevidas de chunks Owlbear fora desse contexto.
