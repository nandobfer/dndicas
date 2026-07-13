# Character Sheets

## Features

### Assistente de criação de ficha
A tela `Minhas Fichas` oferece o menu `Criar ficha` com criação em branco e assistente guiado. A criação em branco preserva o fluxo antigo de nome aleatório + persistência imediata; o assistente abre um modal com abas não lineares para info, raça, origem, classe e atributos.

O assistente mantém uma ficha temporária local compatível com os componentes da ficha, sem usar auto-save e sem persistir nada enquanto o usuário preenche. O salvamento usa `POST /api/character-sheets/assisted`, que cria a ficha, aplica os campos assistidos em uma operação lógica e retorna o `slug` para navegação. Itens e magias ficam fora do assistente nesta versão.

As abas mostram status por ícone: warning enquanto incompletas e check verde quando concluídas. `info` exige apenas nome; aparência e história são opcionais. Raça, origem e classe usam seleção de catálogo com preview — clicar numa linha seleciona o item e clicar novamente o desseleciona, limpando os campos correspondentes da ficha. Quando nenhum item está selecionado, um `EmptyState` contextual é exibido abaixo da tabela. A origem aplica proficiências de perícia, e a classe impede selecionar perícias já concedidas pela origem. Atributos aceitam point buy, standard array ou rolagem 4d6 removendo o menor dado, com o sexto valor calculado por `72 - soma das cinco rolagens`.

Na aba de atributos, os blocos de atributo são apenas leitura; cada método possui controles próprios. A compra de pontos reinicia atributos para 8 e mostra pontos disponíveis. Valores padrão e rolagem de dados usam seletores desselecionáveis com cores por atributo. A rolagem de dados usa o painel de dados em modo travado, sempre com `4d6` e sem controles de dado, combinação, modificador ou modo.

#### Tabelas de catálogo no modal (raça, origem, classe)
As abas raça, origem e classe do modal exibem os componentes reais de filtros (`RaceFilters`, `BackgroundFilters`, `ClassesFilters`) e tabelas (`RacesTable`, `BackgroundsTable`, `ClassesTable`) em modo de seleção. As tabelas suportam infinite scroll e seleção por linha (props `selectedId`, `onSelect`, `hideActions`). Os filtros permitem busca por texto e por fontes, atributos sugeridos, perícias e talentos. `ClassesFilters` aceita `hideStatus` para ocultar o chip de status no modal (status fixo em `"active"`). Os inputs `CompactRichInput` de raça, origem e classe foram ocultados; os valores ainda são setados programaticamente ao selecionar.

#### Bônus de atributos da origem
Quando a origem selecionada possui `suggestedAttributes`, a aba origem exibe uma UI de distribuição de **3 pontos livres** entre os atributos sugeridos, com máximo de 2 pontos por atributo. O contador de pontos distribuídos é exibido e a aba só é marcada como concluída quando todos os 3 pontos forem distribuídos. Os bônus são somados aos atributos base **apenas no momento do salvamento** (em `handleSave`), evitando double-counting ao trocar de método de atributos.

### Menções compactas e autofill de combate
Os inputs compactos da ficha abrem a lista de menções ao focar quando estão vazios, sem exigir digitar `@`. Isso vale para identidade, itens, magias e ataques, mantendo editores longos com o comportamento antigo.

As menções da ficha respeitam filtros por contexto: itens aceitam apenas entidades `Item`, ataques aceitam magias e itens do tipo `arma`, e subclasses podem ser filtradas pela classe atual. Truques com dano usam o `dado base` e escalam apenas a quantidade de dados nos níveis 5, 11 e 17. Truques adicionados na lista de magias criam um ataque automático sem duplicar ataques existentes da mesma magia.

### Sincronização de PV nível 1
Quando a ficha está no nível 1 e possui uma classe mencionada, a vida máxima é sincronizada com o dado de vida máximo da classe mais o modificador de Constituição. Níveis acima de 1 permanecem manuais.

### Fluxo de subir nível no cabeçalho
A ficha mostra a tabela de progressão da classe abaixo do escudo de Classe de Armadura, preservando o mesmo popover com `ClassProgressionTable`. Em modo editável, abaixo de XP aparece o botão `Subir de nível`, destacado com a cor `colors.rarity.uncommon`; no nível 20 ele fica indisponível.

Ao abrir o modal glass de subir nível, o cabeçalho faz preview de `nível atual -> próximo nível`, `PV máximo atual -> novo PV máximo` e das traits novas da classe, subclasse e raça que entram exatamente no novo nível usando cards de preview de trait consistentes com o restante da interface. O ganho padrão de PV usa `ceil(dado de vida / 2) + modificador de Constituição`, mas o usuário pode clicar em um botão dedicado com `GlassDiceValue` para abrir um `DiceRollerPanel` fixo em `1dX + CON`; a abertura/fechamento é animada e, após a rolagem, o painel fecha mantendo o resultado aplicado ao preview.

O modal também lista mudanças de totais em `resourceCharges`, quando houver, e exige escolhas obrigatórias de progressão: no nível 3, uma `Subclasse` filtrada pela classe atual; no nível 4, um `Talento`. Ao confirmar, o fluxo persiste `level` e `hpMax`; se subir para o nível 3, também salva a subclasse escolhida, e se subir para o nível 4, anexa o talento selecionado em `featuresNotes`. O sincronizador existente continua responsável por inserir traits, recalcular derivados e refletir recursos após a mudança de nível.

### Imagem e biografia da ficha
A ficha usa `photo` como imagem principal do personagem. No cabeçalho editável, `GlassImageUploader` salva, remove e sempre oferece a ação de gerar com IA para o retrato, usando como contexto apenas os campos atualmente expostos na ficha (`name`, `class`, `subclass`, `race`, `origin`, `level`, `size`, `appearance`, `history`, `notes`) e também a lista de itens marcados como `equipped`; a URL proxy `/api/upload?key=...` gerada pela IA é persistida imediatamente no auto-save da ficha. O fluxo não envia mais campos antigos de aparência/personalidade que não aparecem na UI ativa da ficha. Quando já existe uma foto, o cabeçalho editável também mostra o botão `Ver foto`, que abre a imagem ampliada no mesmo viewer do `GlassImage`. Em modo somente leitura, `GlassImage` exibe a imagem sem controles de upload. Os cards de `Minhas Fichas` também mostram `photo` na coluna visual à esquerda e permitem ampliar a imagem sem propagar o clique para abrir a ficha.

A área de texto livre da ficha possui três campos rich text persistidos: `appearance` para Aparência, `history` para História e `notes` para Notas.

### Lista admin com foto e nível
Na listagem administrativa de fichas, o bloco do personagem usa `GlassImage` com `photo` quando a ficha possui imagem, e o subtítulo abaixo do nome mostra o nível do personagem em vez de texto de avatar ausente. O clique na imagem preserva a ampliação do `GlassImage` sem propagar para a navegação do card/linha da ficha.

### Métricas de uso no dashboard
O dashboard usa `GET /api/stats/entity-usage?entityType=...` para exibir uso real de entidades em vez de crescimento temporal nos cards do catálogo. A rota deriva uso em fichas a partir de `classRef`, `raceRef`, `originRef`, `catalogSpellId`, `catalogFeatId`, `catalogTraitId`, `catalogItemId` e `resourceCharges.source.entityType`, retornando `{ active, usage }` para preservar o contrato visual do `EntityCard`.
