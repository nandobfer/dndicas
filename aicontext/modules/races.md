# Races

## Features

### Infinite scroll nas tabelas de catálogo
As tabelas de raças usam `useInfiniteRaces`, a mesma fonte de dados do modo lista. O carregamento deixa de buscar um bloco fixo de 100 itens para tabela e passa a buscar páginas seguintes automaticamente pelo sentinel no fim da tabela.

### Identidade visual na primeira coluna da tabela
A tabela de raças usa a primeira coluna como célula de identidade: imagem da raça quando disponível, fallback com ícone de impressão digital, nome linkado e fonte em texto auxiliar. A coluna dedicada de status não é exibida nessa tabela.
