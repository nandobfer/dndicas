# Spells

## Features

### Infinite scroll nas tabelas de catálogo
As tabelas de magias usam `useInfiniteSpells`, a mesma fonte de dados do modo lista. O modo tabela carrega a primeira página e busca páginas seguintes automaticamente quando o sentinel no fim da tabela entra na viewport, sem paginação tradicional.

### Identidade visual na primeira coluna da tabela
A tabela de magias usa a primeira coluna como célula de identidade: imagem da magia quando disponível, fallback com ícone de varinha, nome linkado e fonte em texto auxiliar. A coluna dedicada de status não é exibida nessa tabela.
