# Core

## Features

### Busca unificada com cache de índice e ranking
A busca unificada mantém em memória os dados ativos carregados dos providers, reaproveita índices Fuse por escopo de busca e reutiliza o ranking calculado para a mesma query. Para maximizar a performance com milhares de itens (ex: monstros), a busca ignora campos longos como `description` e `source`, utiliza `threshold` restrito de `0.15` para descartar matches distantes rapidamente e aplica paginação de forma "lazy" antes do mapping.

`src/core/utils/search-engine.ts` preserva a API compartilhada por rotas, hooks e serviços server-side. A lógica pura fica em `src/core/utils/search-core.ts`, permitindo que o frontend execute a busca de menções em `search.worker.ts` via `search-worker-client.ts`. O worker possui cache próprio por provider, filtros, índices e rankings, é aquecido por `useWarmSearchCache()` após um atraso curto no dashboard e é invalidado junto com `invalidateSearchCache()` no browser. Para menções, o worker usa providers já carregados e emite resultados parciais conforme endpoints ainda pendentes terminam, sem esperar o cache completo. Quando `Worker` não está disponível ou falha, a fachada client usa a busca principal como fallback.

### Geração de imagens com Gemini salva no bucket
`POST /api/core/ai/image` (login obrigatório) gera a imagem com o agente **Gerador de imagens** (Integrações › Provedores de IA › Gerador de imagens: provedor Gemini ou OpenAI, modelo de imagem, instruções, proporção padrão e memórias), salva o arquivo no Storage S3 em `ai/generated/{usuário}/…` e responde com `url`, `key` e `mimeType`. Aceita prompt livre ou o JSON completo de um formulário (o prompt final junta as instruções, as memórias, a proporção e o JSON) e bloqueia imagens acima de 5MB (422). Com o agente desativado ou o provedor desconectado, responde 409 em pt-BR — não há fallback.

Storage (`src/core/storage/s3.ts`), e-mail (`src/core/email/mailer.ts`) e realtime (`src/core/realtime/pusher-service.ts`) mantêm a API de antes, mas a configuração vem das integrações de `/integracoes` (ver `integrations.md`), resolvida a cada uso. O antigo `src/core/ai` (`@google/genai`) foi removido (ver `ai.md`).
