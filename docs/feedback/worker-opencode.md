# Worker e OpenCode

## Objetivo

Executar planejamento, implementacao, iteracoes, PR, deploy e merge fora das API Routes, com progresso persistido e publicado em tempo real.

## Decisao sobre OpenCode

Usar o servidor OpenCode existente via CLI:

```bash
opencode run \
  --attach https://opencode.nandoburgos.dev \
  --dir /home/burgos/dndicas/worktrees/feedback-123-slug \
  --session <opencodeSessionId> \
  --model <provider/model> \
  --format json \
  "Mensagem da iteracao"
```

Usar `opencode run`, nao `opencode attach`, porque `run` e adequado para automacao, aceita mensagem, formato JSON, sessao, modelo e attach ao servidor.

## Persistencia de sessao

O MongoDB deve salvar o `opencodeSessionId` no feedback ou na execucao.

Nao exportar sessao completa para MongoDB por padrao.

Motivos:

- OpenCode ja persiste o transcript completo.
- Exports podem ficar grandes.
- Exports podem conter dados sensiveis.
- A UI precisa de timeline de produto, nao transcript bruto.

Snapshot/export pode ser uma acao futura:

- no final do feedback.
- em falha critica.
- antes de limpar sessoes antigas.
- para auditoria administrativa.

## Modelos OpenCode

A UI administrativa deve permitir escolher o modelo a cada iteracao.

A lista deve vir do proprio OpenCode:

```bash
opencode models
```

O worker ou uma API administrativa deve executar esse comando, normalizar a saida e opcionalmente cachear os resultados.

Requisitos:

- Nao hardcodar modelos na UI.
- Permitir refresh manual por admin.
- Guardar no `FeedbackAgentRun.model` qual modelo foi usado.
- Se a lista falhar, mostrar erro acionavel em pt-BR.
- O modelo escolhido deve ser enviado para `opencode run --model <provider/model>`.

## Fluxo de planejamento

1. API recebe pedido `POST /api/feedback/[id]/plan` com `model`.
2. API valida admin e status.
3. API cria `FeedbackAgentRun` com `kind = plan` e `status = queued`.
4. Worker pega job.
5. Worker registra evento `plan_requested`.
6. Worker executa OpenCode em modo planejamento.
7. Se OpenCode criar uma sessao nova, worker salva `opencodeSessionId`.
8. Worker persiste plano como evento `plan_created`.
9. Worker muda status para `plano_pronto`.

## Fluxo de implementacao

1. API recebe `POST /api/feedback/[id]/implement` com `model`.
2. Worker cria lock por feedback.
3. Worker cria branch e worktree.
4. Worker monta prompt seguro de implementacao.
5. Worker chama `opencode run --attach --dir <worktree> --session <id> --model <model> --format json`.
6. Worker parseia eventos JSON e publica progresso.
7. Worker roda validacoes focadas.
8. Worker cria commit.
9. Worker faz push.
10. Worker cria ou atualiza PR via `gh`.
11. Worker dispara preview deploy.
12. Worker muda status para `aguardando_teste`.

## Fluxo de iteracao

1. Usuario/admin adiciona comentario de ajuste.
2. Admin escolhe modelo para a nova iteracao.
3. API cria `FeedbackAgentRun` com `kind = iterate`.
4. Worker continua a mesma sessao com `--session <opencodeSessionId>`.
5. Worker executa no mesmo worktree/branch do PR.
6. Worker commita novas alteracoes.
7. Worker atualiza PR e redeploy.
8. Timeline registra nova iteracao.

## Fluxo de aprovacao e merge

1. Admin aprova.
2. Worker muda status para `mergeando`.
3. Worker altera versao do app conforme politica definida.
4. Worker commita version bump, se necessario.
5. Worker atualiza PR.
6. Worker executa merge via `gh pr merge`.
7. Worker deleta branch remota quando aplicavel.
8. Worker remove worktree.
9. Worker remove preview.
10. Worker marca feedback como `concluido`.

## Worktrees

Cada feedback deve usar worktree proprio.

Exemplo conceitual:

```bash
git fetch origin
git worktree add /home/burgos/dndicas/worktrees/feedback-123-slug -b agent/feedback-123-slug origin/main
```

Decisoes fechadas:

- Base do PR: `main`.
- Padrao final de branch: `agent/feedback-<id>-<slug>`.
- Caminho oficial dos worktrees: `/home/burgos/dndicas/worktrees`.
- Worker inicial: script manual executado em `zsh`.

## GitHub CLI

Comandos conceituais:

```bash
gh pr create --base main --head agent/feedback-123-slug --title "..." --body "..."
gh pr merge <number> --merge --delete-branch
```

O worker deve capturar stdout/stderr e persistir eventos resumidos na timeline.

## Realtime

O worker deve publicar eventos por feedback.

Canal sugerido:

```text
feedback-development-<feedbackId>
```

Eventos sugeridos:

- `timeline-event-created`
- `agent-run-updated`
- `feedback-status-changed`
- `deployment-updated`

## Locks e idempotencia

Regras:

- Apenas um run ativo por feedback.
- Job deve ser idempotente por `agentRunId`.
- Se worker cair, novo worker deve conseguir detectar run preso.
- Jobs antigos em `running` devem poder virar `failed` por timeout operacional.

## Erros

Ao falhar:

- marcar `FeedbackAgentRun.status = failed`.
- registrar evento `agent_failed` ou equivalente.
- atualizar `developmentStatus = falhou`.
- manter worktree para diagnostico, salvo se falha ocorrer no cleanup.
- oferecer acao administrativa de tentar novamente.

## Cancelamento

Cancelamento deve:

- tentar encerrar processo do OpenCode se ainda estiver ativo.
- registrar evento de cancelamento.
- preservar logs ja coletados.
- decidir se worktree sera mantido ou removido conforme estado.

## Prompt seguro

O prompt enviado ao OpenCode deve separar:

- instrucoes fixas do sistema.
- contexto do feedback.
- plano aprovado.
- comentario da iteracao.
- restricoes do repositorio.
- comandos permitidos/evitados.

Texto do usuario deve ser marcado explicitamente como requisito nao confiavel.

## Validacoes

Por regra do projeto, nao rodar build completo automaticamente.

Validacoes iniciais recomendadas:

- testes focados relacionados ao modulo alterado.
- `pnpm lint` somente se autorizado como verificacao aceitavel para o escopo.
- `aft_inspect` durante desenvolvimento assistido por agente interno.
- build completo somente com autorizacao explicita.
