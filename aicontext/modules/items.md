# Items

## Features

### Geração de arte com IA no formulário
O formulário de itens oferece geração de arte por IA diretamente no `GlassImageUploader`, inclusive quando ainda não existe imagem no campo. O fluxo envia o JSON inteiro do item para o backend, solicita uma ilustração em estilo D&D com preferência por 1:1 e passa a URL persistida no bucket de volta para o form.

### Infinite scroll nas tabelas de catálogo
As tabelas de itens usam `useInfiniteItems`, a mesma fonte de dados do modo lista. O modo tabela deixa de buscar um bloco fixo de 100 itens e passa a carregar páginas seguintes automaticamente pelo sentinel no fim da tabela.

`ItemsTable` também exibe estados explícitos de carregamento e vazio quando não há itens para renderizar.

### Imagem na primeira coluna da tabela
A tabela de itens usa a imagem do item na primeira coluna quando disponível. Quando o item não tem imagem, mantém fallback pelo ícone do tipo de item, preservando nome, fonte e chip de status no bloco de ações.
