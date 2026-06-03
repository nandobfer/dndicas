# Core

## Features

### Busca unificada com cache de índice e ranking
A busca unificada mantém em memória os dados ativos carregados dos providers, reaproveita índices Fuse por escopo de busca e reutiliza o ranking calculado para a mesma query. Para maximizar a performance com milhares de itens (ex: monstros), a busca ignora campos longos como `description` e `source`, utiliza `threshold` restrito de `0.15` para descartar matches distantes rapidamente e aplica paginação de forma "lazy" antes do mapping.

`src/core/utils/search-engine.ts` preserva a API compartilhada por rotas, hooks e serviços server-side. A lógica pura fica em `src/core/utils/search-core.ts`, permitindo que o frontend execute a busca de menções em `search.worker.ts` via `search-worker-client.ts`. O worker possui cache próprio por provider, filtros, índices e rankings, é aquecido por `useWarmSearchCache()` após um atraso curto no dashboard e é invalidado junto com `invalidateSearchCache()` no browser. Para menções, o worker usa providers já carregados e emite resultados parciais conforme endpoints ainda pendentes terminam, sem esperar o cache completo. Quando `Worker` não está disponível ou falha, a fachada client usa a busca principal como fallback.

### Geração de imagens com Gemini salva no bucket
`POST /api/core/ai/image` executa a geração de imagem no servidor com um modelo Gemini compatível, extrai o primeiro `inlineData` retornado, salva o arquivo no bucket S3/MinIO do projeto e responde com `url`, `key` e `mimeType`. O endpoint aceita tanto prompt livre quanto o JSON completo de um formulário, transforma esse payload em um prompt especializado em estética oficial de Dungeons & Dragons com preferência por composição 1:1 e bloqueia uploads gerados acima de 5MB antes de persistir no bucket.
