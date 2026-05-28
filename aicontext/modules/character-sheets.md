# Character Sheets

## Features

### Menções compactas e autofill de combate
Os inputs compactos da ficha abrem a lista de menções ao focar quando estão vazios, sem exigir digitar `@`. Isso vale para identidade, itens, magias e ataques, mantendo editores longos com o comportamento antigo.

As menções da ficha respeitam filtros por contexto: itens aceitam apenas entidades `Item`, ataques aceitam magias e itens do tipo `arma`, e subclasses podem ser filtradas pela classe atual. Truques com dano usam o `dado base` e escalam apenas a quantidade de dados nos níveis 5, 11 e 17. Truques adicionados na lista de magias criam um ataque automático sem duplicar ataques existentes da mesma magia.

### Sincronização de PV nível 1
Quando a ficha está no nível 1 e possui uma classe mencionada, a vida máxima é sincronizada com o dado de vida máximo da classe mais o modificador de Constituição. Níveis acima de 1 permanecem manuais.

### Imagem e biografia da ficha
A ficha usa `photo` como imagem principal do personagem. No cabeçalho editável, `GlassImageUploader` salva, remove e sempre oferece a ação de gerar com IA para o retrato, usando os campos atuais da ficha como contexto quando disponíveis; a URL proxy `/api/upload?key=...` gerada pela IA é persistida imediatamente no auto-save da ficha. Quando já existe uma foto, o cabeçalho editável também mostra o botão `Ver foto`, que abre a imagem ampliada no mesmo viewer do `GlassImage`. Em modo somente leitura, `GlassImage` exibe a imagem sem controles de upload. Os cards de `Minhas Fichas` também mostram `photo` na coluna visual à esquerda e permitem ampliar a imagem sem propagar o clique para abrir a ficha.

A área de texto livre da ficha possui três campos rich text persistidos: `appearance` para Aparência, `history` para História e `notes` para Notas.

### Lista admin com foto e nível
Na listagem administrativa de fichas, o bloco do personagem usa `GlassImage` com `photo` quando a ficha possui imagem, e o subtítulo abaixo do nome mostra o nível do personagem em vez de texto de avatar ausente. O clique na imagem preserva a ampliação do `GlassImage` sem propagar para a navegação do card/linha da ficha.
