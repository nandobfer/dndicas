# Deploy Preview

## Objetivo

Publicar uma URL de teste para cada feedback/PR implementado pelo agente.

Formato desejado:

```text
https://<slug>.preview.nandoburgos.dev
```

O slug deve ser derivado do titulo do feedback, com fallback para ID quando necessario.

## Recomendacao inicial

Usar:

- wildcard DNS para `*.preview.nandoburgos.dev`.
- certificado wildcard.
- reverse proxy com Caddy, Traefik ou Nginx.
- container/processo isolado por feedback ou PR.
- cleanup por merge, cancelamento ou TTL.

Essa abordagem evita gerar certificado individual para cada feedback.

## Por que evitar certbot por feedback inicialmente

Rodar `certbot` a cada feedback e possivel, mas nao e a primeira recomendacao.

Contras:

- Mais lento.
- Mais fragil operacionalmente.
- Pode exigir alteracao dinamica de Nginx/Apache.
- Pode bater limite do Let's Encrypt.
- Cria cleanup adicional de certificados.
- Aumenta o acoplamento entre app, servidor e proxy.

## Estrategia de proxy

Opcoes:

- Caddy com wildcard TLS e upstream dinamico.
- Traefik com labels de container.
- Nginx com templates gerados pelo worker.

Para MVP, Traefik ou Caddy tende a reduzir complexidade operacional.

## Dados persistidos

Cada deploy deve guardar:

- `feedbackId`
- `agentRunId`
- `slug`
- `url`
- `status`
- `branchName`
- `commitSha`
- `containerName`
- `port`
- `createdAt`
- `removedAt`
- `errorMessage`

## Ambientes

Preview nao deve compartilhar automaticamente todos os secrets de producao.

Recomendacoes:

- Usar banco ou database separada para preview quando possivel.
- Usar Clerk/configs adequadas para preview.
- Exibir banner visual de ambiente preview.
- Usar variaveis especificas de preview.
- Evitar credenciais com permissoes destrutivas.

## Build e custo

Preview pode exigir build Docker ou build Next.js.

Como builds completos sao custosos neste repositorio, o deploy preview deve ser tratado como etapa explicita do worker e nao como validacao local automatica comum.

Pontos a medir:

- tempo medio de build.
- consumo de CPU/RAM.
- espaco em disco por preview.
- numero maximo de previews simultaneos.

## Cleanup

Cleanup deve ocorrer:

- apos merge aprovado.
- apos cancelamento.
- quando feedback ficar inativo alem de TTL.
- manualmente por admin.

Cleanup deve remover:

- container/processo.
- config do proxy, se houver.
- porta/registro interno.
- worktree, se o fluxo estiver encerrado.
- branch local, se aplicavel.

## Estados de deploy

- `queued`: deploy solicitado.
- `building`: build/publicacao em andamento.
- `ready`: URL disponivel.
- `failed`: falha ao publicar.
- `removed`: preview removido.

## Timeline

Eventos de deploy devem aparecer na timeline:

- `deploy_started`
- `deploy_ready`
- `deploy_failed`
- `deploy_removed`

Quando `ready`, a UI deve disponibilizar botao destacado para abrir a URL.
