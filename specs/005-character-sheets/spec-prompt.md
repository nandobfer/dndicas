Follow instructions in [speckit.specify.prompt.md](file:///c%3A/Users/fernando.fernandes/code/d7d/.github/prompts/speckit.specify.prompt.md).
vamos especificar essa tarefa. 

quero uma nova página para usuários autenticados No #file:expandable-sidebar.tsx deve aparecer embaixo do menu "Perfil" chamado Minhas Fichas

essa página deve mostrar um campo de busca simples, apenas filtrando a lista (o usuário pode cometer pequenos erros de digitação aqui) e um botão para criar ficha.

além disso, aqui vamos listar as fichas de personagem do usuário, em formato de grid, 3 colunas

cada card terá como background-image a imagem da classe do personagem (se houver). Se o personagem tiver uma subclasse, usar a imagem da subclasse. Essa imagem deve estar com pouca opacidade para não atrapalhar a leitura do card. Para manter o padrão liquid glass, adicione um blur bem fraquinho. Nesse card mostraremos a foto do personagem com fallback pra um avatar generico, o nome, raça, classe (e subclasse se houver). Além de seus pontos de vida e modificadores de atributo

esse card deve ser bem moderno e bonito, a lista deve carregar com animações, deve ter um loading state, empty state, todas as transições de estados devem ser animados, mudanças na lista também

ao clicar em um card, o usuário deve navegar para a página da ficha. Aqui deve ser algo como /sheets/slug onde o slug deve conter o id da ficha, pois será o único valor único

clicar no botão "nova ficha" o sistema deve criar uma nova ficha no banco, já mostrar o novo card na lista e navegar para o  /sheets/slug dessa nova ficha

essa página, esse formulário, deve representar perfeitamente uma ficha de dungeons & dragons edição 2024. Leia o pdf que eu anexei da ficha para usar como referência. Aqui Todos os campos devem ser opcionais, cada alteração em qualquer campo deve submeter o formulario para salvar, porém com um debounce de 500ms

nessa página a experiência de usuário é o principal, prioridade absoluta. Essa ficha deve seguir a estrutura e organização da ficha oficial, que eu anexei, mas deve ser aperfeiçoada em termos de design, deve ser bem moderna e usar as cores adequadas para os campos adequados. As cores estão configuradas em #file:colors.ts 

na ficha o usuário pode editar manualmente qualquer campo, mas todos eles também devem ter um botão (dentro do input, um icon button na direita) para o usuário clicar e selecionar do nosso catálogo. Selecionar uma referência deve preenchê-la automaticamente, bem como outros campos relevante, dependendo da referência.

por exemplo, o usuário pode digitar manualmente o nome da sua raça e caracteristicas dela, ou clicar no botão do input da raça para selecionar do nosso catálogo. Ao escolher Humano, o campo raça receberá "Humano", deslocamento receberá "9 metros", tamanho receberá "médio" e a lista de traits receberá os traits contidos na nossa entidade de raça do humano. Selecionar uma classe atualizará os campos de classe, proficiencia com saving throws, armas, armaduras, os traits, etc. Além disso, o usuário será promptado para escolher a quantidade X de proficiências da lista, se a classe der magia, também será promptado para escolher as magias. Observe a tabela de progressão da classe para isso, caso exista no documento

Editar o nível deve funcionar parecido. Se o usuário editar manulamente, ok. Se ele clicar no botão para subir de nível, será promptado para escolher (o que precisa escolher) dos recursos da sua classe. O que não precisa escolher, será adicionado automaticamente

A lista de itens deve ter um botão para o usuário selecionar do nosso catálogo também, mas também deve permitir inserir manualmente. Aqui também teremos quantidade de cada item. Na lista de itens, quero mostrar um avatar ao lado do nome, contendo a imagem do item, se houver. Se não houver, mostrar fallback generico.

o background da ficha também deve ser genérica, mas se houver imagem da classe, mostrar ela. Se o personagem já possuir subclasse, o background deve ser o dela. Também com pouca opacidade, para não atrapalhar. Para manter o padrão liquid glass, adicione um blur bem fraquinho

na lista de magias também quero mostrar o avatar da magia, caso possua, com fallback de magia generico. Também com um botão para adicionar nova magia a partir do catalogo

na lista de traits também deve haver um botão para selecionar do nosso catalogo

O mesmo para a raça e origem.

Aqui precisamos garantir que está usando o pdf oficial (que anexei) como referência. Onde está a logo do d&d, podemos renderizar o nosso #file:dndicas.webp 

lembre-se de organizar os elementos de forma bem parecida em como é feito no pdf, com elementos bonitos e mantendo o tema do d&d e liquid glass

Lembrando também da experiência do usuário ser prioridade, então um loading state em cada input que engatilhou o save (com o debounce). O ideal aqui é mandar para o backend apenas o id da ficha e o campo alterado (um patch em vez de put)