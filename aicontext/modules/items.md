# Items

## Features

### Infinite scroll nas tabelas de catálogo
As tabelas de itens usam `useInfiniteItems`, a mesma fonte de dados do modo lista. O modo tabela deixa de buscar um bloco fixo de 100 itens e passa a carregar páginas seguintes automaticamente pelo sentinel no fim da tabela.

`ItemsTable` também exibe estados explícitos de carregamento e vazio quando não há itens para renderizar.
