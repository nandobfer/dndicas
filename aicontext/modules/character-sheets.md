# Character Sheets

## Features

### Assistente de criação de ficha
A tela `Minhas Fichas` oferece o menu `Criar ficha` com criação em branco e assistente guiado. A criação em branco preserva o fluxo antigo de nome aleatório + persistência imediata; o assistente abre um modal com abas não lineares para info, raça, origem, classe e atributos.

O assistente mantém uma ficha temporária local compatível com os componentes da ficha, sem usar auto-save e sem persistir nada enquanto o usuário preenche. O salvamento usa `POST /api/character-sheets/assisted`, que cria a ficha, aplica os campos assistidos em uma operação lógica e retorna o `slug` para navegação. Itens e magias ficam fora do assistente nesta versão.

As abas mostram status por ícone: warning enquanto incompletas e check verde quando concluídas. `info` exige apenas nome; aparência e história são opcionais. Raça, origem e classe usam seleção de catálogo com preview. A origem aplica proficiências de perícia, e a classe impede selecionar perícias já concedidas pela origem. Atributos aceitam point buy, standard array ou rolagem 4d6 removendo o menor dado, com o sexto valor calculado por `72 - soma das cinco rolagens`.

Na aba de atributos, os blocos de atributo são apenas leitura; cada método possui controles próprios. A compra de pontos reinicia atributos para 8 e mostra pontos disponíveis. Valores padrão e rolagem de dados usam seletores desselecionáveis com cores por atributo. A rolagem de dados usa o painel de dados em modo travado, sempre com `4d6` e sem controles de dado, combinação, modificador ou modo.

### Menções compactas e autofill de combate
Os inputs compactos da ficha abrem a lista de menções ao focar quando estão vazios, sem exigir digitar `@`. Isso vale para identidade, itens, magias e ataques, mantendo editores longos com o comportamento antigo.

As menções da ficha respeitam filtros por contexto: itens aceitam apenas entidades `Item`, ataques aceitam magias e itens do tipo `arma`, e subclasses podem ser filtradas pela classe atual. Truques com dano usam o `dado base` e escalam apenas a quantidade de dados nos níveis 5, 11 e 17. Truques adicionados na lista de magias criam um ataque automático sem duplicar ataques existentes da mesma magia.

### Sincronização de PV nível 1
Quando a ficha está no nível 1 e possui uma classe mencionada, a vida máxima é sincronizada com o dado de vida máximo da classe mais o modificador de Constituição. Níveis acima de 1 permanecem manuais.

### Imagem e biografia da ficha
A ficha usa `photo` como imagem principal do personagem. No cabeçalho editável, `GlassImageUploader` salva, remove e sempre oferece a ação de gerar com IA para o retrato, usando como contexto apenas os campos atualmente expostos na ficha (`name`, `class`, `subclass`, `race`, `origin`, `level`, `size`, `appearance`, `history`, `notes`) e também a lista de itens marcados como `equipped`; a URL proxy `/api/upload?key=...` gerada pela IA é persistida imediatamente no auto-save da ficha. O fluxo não envia mais campos antigos de aparência/personalidade que não aparecem na UI ativa da ficha. Quando já existe uma foto, o cabeçalho editável também mostra o botão `Ver foto`, que abre a imagem ampliada no mesmo viewer do `GlassImage`. Em modo somente leitura, `GlassImage` exibe a imagem sem controles de upload. Os cards de `Minhas Fichas` também mostram `photo` na coluna visual à esquerda e permitem ampliar a imagem sem propagar o clique para abrir a ficha.

A área de texto livre da ficha possui três campos rich text persistidos: `appearance` para Aparência, `history` para História e `notes` para Notas.

### Lista admin com foto e nível
Na listagem administrativa de fichas, o bloco do personagem usa `GlassImage` com `photo` quando a ficha possui imagem, e o subtítulo abaixo do nome mostra o nível do personagem em vez de texto de avatar ausente. O clique na imagem preserva a ampliação do `GlassImage` sem propagar para a navegação do card/linha da ficha.
