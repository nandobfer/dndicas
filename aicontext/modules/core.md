# Core

## Features

### Busca unificada com cache de índice e ranking
A busca unificada em `src/core/utils/search-engine.ts` mantém em memória os dados ativos carregados dos providers, reaproveita índices Fuse por escopo de busca e reutiliza o ranking calculado para a mesma query. Para maximizar a performance com milhares de itens (ex: monstros), a busca ignora campos longos como `description` e `source`, focando em `name` e `label`. Além disso, a paginação é aplicada de forma "lazy": os resultados brutos do Fuse são fatiados por `limit`/`offset` **antes** de converter os itens em objetos finais, economizando processamento e memória. `invalidateSearchCache()` limpa todos os caches para reconstrução.

### Geração de imagens com Gemini salva no bucket
`POST /api/core/ai/image` executa a geração de imagem no servidor com um modelo Gemini compatível, extrai o primeiro `inlineData` retornado, salva o arquivo no bucket S3/MinIO do projeto e responde com `url`, `key` e `mimeType`. O endpoint aceita tanto prompt livre quanto o JSON completo de um formulário, transforma esse payload em um prompt especializado em estética oficial de Dungeons & Dragons com preferência por composição 1:1 e bloqueia uploads gerados acima de 5MB antes de persistir no bucket.
