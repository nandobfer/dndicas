# Core

## Features

### Busca unificada com cache de índice e ranking
A busca unificada em `src/core/utils/search-engine.ts` mantém em memória os dados ativos carregados dos providers, reaproveita índices Fuse por escopo de busca e reutiliza o ranking calculado para a mesma query. Paginação por `limit`/`offset` corta o ranking já calculado, evitando reconstruir o índice e recalcular resultados enquanto o cache estiver válido. `invalidateSearchCache()` limpa os dados unificados, índices Fuse, rankings e escopos filtrados para que a próxima busca reconstrua os caches.

### Geração de imagens com Gemini salva no bucket
`POST /api/core/ai/image` executa a geração de imagem no servidor com um modelo Gemini compatível, extrai o primeiro `inlineData` retornado, salva o arquivo no bucket S3/MinIO do projeto e responde com `url`, `key` e `mimeType`. O endpoint aceita tanto prompt livre quanto o JSON completo de um formulário, transforma esse payload em um prompt especializado em estética oficial de Dungeons & Dragons com preferência por composição 1:1 e bloqueia uploads gerados acima de 5MB antes de persistir no bucket.
