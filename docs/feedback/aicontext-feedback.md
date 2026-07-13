# Documentacao futura em aicontext/modules/feedback.md

## Objetivo

Quando a implementacao do Centro de Desenvolvimento Agentico comecar, o modulo `feedback` tambem deve ganhar documentacao contextual em:

```text
aicontext/modules/feedback.md
```

Este arquivo em `docs/feedback/` documenta o que devera ser escrito posteriormente, mas a documentacao em `aicontext/` ainda nao deve ser criada nesta etapa.

## Quando criar

Criar `aicontext/modules/feedback.md` na primeira fase de implementacao que alterar comportamento real do modulo, especialmente quando ocorrer qualquer uma das mudancas abaixo:

- novos modelos MongoDB para feedback/timeline/runs/deploys.
- novas APIs de timeline, comentarios, planejamento ou execucao.
- nova pagina detalhe `/feedback/[id]`.
- integracao real com OpenCode.
- worker de feedback.
- deploy preview.

## Conteudo minimo esperado

O arquivo deve conter:

### Objetivo

Descrever que o modulo de feedback funciona como central de desenvolvimento agentico, conectando feedbacks de usuario a planejamento, implementacao, PR, deploy preview, iteracoes e aprovacao.

### Estrutura

Listar arquivos e diretorios principais:

- `src/app/(dashboard)/feedback/page.tsx`
- `src/app/(dashboard)/feedback/[id]/page.tsx`
- `src/app/api/feedback/**`
- `src/features/feedback/**`
- worker/scripts relacionados, quando existirem.

### Modelos

Documentar:

- `Feedback`
- `FeedbackTimelineEvent`
- `FeedbackAgentRun`
- `FeedbackDeployment`
- cache de modelos OpenCode, se implementado.

### APIs

Documentar endpoints existentes e novos:

- listagem/criacao/edicao de feedback.
- detalhe.
- timeline.
- comentarios.
- modelos OpenCode.
- gerar plano.
- implementar.
- iterar.
- aprovar.
- cancelar.

### Fluxo agentico

Documentar o ciclo:

1. Criacao do feedback.
2. Geracao de plano.
3. Escolha de modelo OpenCode.
4. Criacao de worktree.
5. Execucao do agente.
6. Criacao de PR.
7. Deploy preview.
8. Iteracoes.
9. Aprovacao.
10. Merge e cleanup.

### Regras de permissao

Documentar claramente:

- usuario comum cria/comenta/testa.
- admin gera plano/implementa/aprova/cancela.
- worker registra eventos de sistema.

### Regras OpenCode

Documentar:

- usar `opencode run --attach`, nao `opencode attach`, para automacao.
- continuar contexto com `--session <opencodeSessionId>`.
- salvar apenas `opencodeSessionId` no MongoDB por padrao.
- nao exportar transcript completo para MongoDB por padrao.
- usar `opencode models` como origem da lista de modelos.
- persistir o modelo usado em cada `FeedbackAgentRun`.

### Regras de seguranca

Documentar:

- executar sempre em worktree isolado.
- nao rodar no diretorio principal.
- proteger acoes agenticas por permissao de admin.
- sanitizar HTML/Markdown de comentarios e respostas do agente.
- nao expor secrets em timeline.

### Testes

Documentar onde ficam os testes e quais comportamentos sao cobertos.

### Decisoes pendentes/resolvidas

Manter uma secao curta com decisoes operacionais tomadas durante a implementacao, por exemplo:

- base dos PRs.
- provider de preview deploy.
- local dos worktrees.
- politica de retencao de previews.

## Relacao com docs/feedback

`docs/feedback/` e a documentacao de planejamento e arquitetura.

`aicontext/modules/feedback.md` deve ser a documentacao operacional condensada para agentes futuros desenvolverem e manterem o modulo sem reler todo o plano completo.
