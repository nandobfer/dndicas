# Backgrounds

## Features

### Geração de arte com IA no formulário
O formulário de origens reutiliza o `GlassImageUploader` com uma ação premium de IA que lê o JSON inteiro do formulário, pede uma arte consistente com o visual editorial de D&D e grava a imagem gerada no bucket antes de preencher o campo `image`.

### Infinite scroll nas tabelas de catálogo
As tabelas de origens usam `useInfiniteBackgrounds`, a mesma fonte de dados do modo lista. O modo tabela substitui a paginação placeholder por carregamento automático no fim da tabela.

Filtros client-side de atributos, perícias e talentos continuam sendo aplicados sobre os itens carregados. Quando esses filtros estão ativos e a página carregada ainda não contém resultados, a hook busca páginas adicionais enquanto houver próxima página para evitar empty state prematuro.

### Tabela sem coluna dedicada de status
A tabela de origens mantém a célula de identidade existente com imagem/fallback, nome linkado e fonte, e não exibe uma coluna dedicada de status para evitar redundância visual.
