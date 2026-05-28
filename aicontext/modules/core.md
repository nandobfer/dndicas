# Core

## Features

### Geração de imagens com Gemini salva no bucket
`POST /api/core/ai/image` executa a geração de imagem no servidor com um modelo Gemini compatível, extrai o primeiro `inlineData` retornado, salva o arquivo no bucket S3/MinIO do projeto e responde com `url`, `key` e `mimeType`. O endpoint aceita tanto prompt livre quanto o JSON completo de um formulário, transforma esse payload em um prompt especializado em estética oficial de Dungeons & Dragons com preferência por composição 1:1 e bloqueia uploads gerados acima de 5MB antes de persistir no bucket.
