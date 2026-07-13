# Roadmap de Implementacao

## Principios

- Implementar em fases pequenas e verificaveis.
- Preservar comportamento atual de feedback enquanto a nova experiencia nasce.
- Nao executar jobs longos em API Routes.
- Nao rodar agente no worktree principal.
- Nao hardcodar modelos OpenCode no frontend.
- Nao exportar sessoes completas para MongoDB por padrao.
- PRs agênticos devem apontar para `main`.
- Worktrees devem ser criados em `/home/burgos/dndicas/worktrees`.
- Worker inicial roda como script manual via `zsh`.
- Version bump ocorre em `src/lib/config/version.ts`.

## Fase 1: Base de dados e timeline

Objetivo: preparar o feedback para funcionar como issue interna.

Entregas:

- Expandir `FeedbackModel` com campos agenticos basicos.
- Criar modelo de timeline.
- Criar comentarios como eventos de timeline.
- Criar API de timeline.
- Criar pagina detalhe `/feedback/[id]`.
- Atualizar lista para navegar ao detalhe.
- Adicionar testes de modelo/API/timeline.

Critério de aceite:

- Usuario cria feedback.
- Feedback possui pagina detalhe.
- Comentarios aparecem na timeline.
- Permissoes basicas funcionam.

## Fase 2: Modelos OpenCode e planejamento

Objetivo: permitir gerar plano com modelo escolhido pelo admin.

Entregas:

- Criar adapter para `opencode models`.
- Criar API `GET /api/feedback/opencode/models`.
- Criar select de modelo na UI administrativa.
- Criar worker minimo para job de plano.
- Executar `opencode run --attach --model <model> --format json`.
- Salvar `opencodeSessionId` no feedback.
- Persistir plano na timeline.
- Adicionar testes de adapter mockado e UI do select.

Critério de aceite:

- Admin ve lista de modelos vinda do OpenCode.
- Admin escolhe modelo.
- Plano e gerado e aparece na timeline.
- Feedback guarda `opencodeSessionId`.

## Fase 3: Worktree, implementacao e PR

Objetivo: executar implementacao isolada e abrir pull request.

Entregas:

- Criar Git adapter.
- Criar GitHub CLI adapter.
- Criar worktree por feedback.
- Criar branch padronizada.
- Executar OpenCode no worktree com `--session`.
- Persistir progresso na timeline.
- Criar commit/push.
- Criar PR via `gh`.
- Atualizar feedback com `pullRequestUrl`.
- Adicionar testes de worker com adapters mockados.

Critério de aceite:

- Admin inicia implementacao.
- Agente usa a sessao existente.
- PR e criado.
- Timeline mostra progresso e link do PR.

## Fase 4: Iteracoes

Objetivo: permitir ajustes continuando a mesma sessao OpenCode.

Entregas:

- Adicionar fluxo de solicitar ajustes.
- Permitir escolher modelo por nova iteracao.
- Reusar branch/worktree/PR.
- Reusar `opencodeSessionId`.
- Criar novos commits.
- Atualizar PR.
- Registrar iteracoes na timeline.

Critério de aceite:

- Usuario/admin comenta ajuste.
- Admin inicia nova iteracao com modelo selecionado.
- OpenCode continua a mesma sessao.
- PR recebe novo commit.

## Fase 5: Preview deploy

Objetivo: publicar URL testavel por feedback.

Entregas:

- Definir infraestrutura de wildcard DNS/proxy.
- Criar deploy adapter.
- Criar modelo `FeedbackDeployment`.
- Publicar preview por branch/commit.
- Mostrar botao `Abrir deploy` na UI.
- Adicionar cleanup por status.

Critério de aceite:

- Apos implementacao, preview fica disponivel.
- Timeline mostra status do deploy.
- Botao abre URL do preview.

## Fase 6: Aprovacao, versionamento e merge

Objetivo: fechar o ciclo ate producao/main.

Entregas:

- Criar acao de aprovacao.
- Aplicar version bump em `src/lib/config/version.ts`.
- Executar version bump no worktree/branch.
- Atualizar PR.
- Fazer merge via `gh pr merge`.
- Deletar branch.
- Remover worktree.
- Remover preview.
- Marcar feedback como `concluido`.

Critério de aceite:

- Admin aprova.
- PR e mergeado.
- Recursos temporarios sao limpos.
- Feedback fica concluido.

## Fase 7: Hardening operacional

Objetivo: tornar o sistema confiavel em uso continuo.

Entregas:

- Locks robustos.
- Retry administrativo.
- Timeout de jobs presos.
- Observabilidade de worker.
- Redacao de secrets em logs.
- Snapshot/export opcional de sessao OpenCode.
- TTL de previews antigos.
- Dashboard administrativo de runs.

Critério de aceite:

- Falhas sao recuperaveis.
- Recursos temporarios nao acumulam indefinidamente.
- Admin consegue diagnosticar e retentar.

## Decisoes pendentes

- Infra final de preview: Caddy, Traefik ou Nginx.
- Retencao de sessoes OpenCode.
- Retencao de timeline detalhada.
- Se usuarios comuns podem solicitar iteracao diretamente ou apenas comentar.
