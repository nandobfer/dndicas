# Spells

## Features

### Geração de arte com IA no formulário
O formulário de magias reutiliza o `GlassImageUploader` com ação premium de IA para gerar a arte a partir do JSON inteiro do form, sem seleção manual de campos. A geração usa o backend de imagem especializado em D&D, prefere composição 1:1 e substitui a imagem do campo pela URL persistida no bucket.

### Geração com IA por magia
Admins podem usar a ação `Gerar com IA` nos menus de magias da tabela, da lista em cards e do preview tooltip. A ação abre a modal genérica de geração de entidades com adapter específico de magia, usa o modelo `gemini-3.1-flash-lite`, consome progresso por Pusher no canal `entity-generation.<runId>`, busca candidatos em `spells-xphb.json`, gera nome/descrição via `GenAITranslator` e mapeia campos determinísticos no mesmo formato do provider de spells. Ao salvar, a magia sobrescreve os campos gerados e preserva a imagem atual quando o candidato não fornece uma nova.

### Infinite scroll nas tabelas de catálogo
As tabelas de magias usam `useInfiniteSpells`, a mesma fonte de dados do modo lista. O modo tabela carrega a primeira página e busca páginas seguintes automaticamente quando o sentinel no fim da tabela entra na viewport, sem paginação tradicional.

### Identidade visual na primeira coluna da tabela
A tabela de magias usa a primeira coluna como célula de identidade: imagem da magia quando disponível, fallback com ícone de varinha, nome linkado e fonte em texto auxiliar. A coluna dedicada de status não é exibida nessa tabela.

### Canonização compartilhada das fontes
Os filtros de fonte das entidades usam o `SourceFilter` compartilhado com opções vindas de `GET /api/sources`. O pipeline canoniza aliases e abreviações para nomes completos no multiselect; no caso de PHB/XPHB/Player's Handbook/LDJ, tudo converge para `Livro do Jogador`, enquanto o backend continua aceitando aliases legados ao montar o filtro por `source`.
