# Backgrounds

## Features

### Infinite scroll nas tabelas de catálogo
As tabelas de origens usam `useInfiniteBackgrounds`, a mesma fonte de dados do modo lista. O modo tabela substitui a paginação placeholder por carregamento automático no fim da tabela.

Filtros client-side de atributos, perícias e talentos continuam sendo aplicados sobre os itens carregados. Quando esses filtros estão ativos e a página carregada ainda não contém resultados, a hook busca páginas adicionais enquanto houver próxima página para evitar empty state prematuro.
