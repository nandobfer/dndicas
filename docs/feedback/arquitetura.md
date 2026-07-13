# Arquitetura

## Visao geral

O Centro de Desenvolvimento Agentico deve ser composto por UI, APIs, MongoDB, worker assincorno, OpenCode, GitHub CLI, infraestrutura de preview e realtime.

```text
Usuario/Admin
  -> Next.js UI
  -> API Routes
  -> MongoDB
  -> Job/Worker
  -> git worktree + branch
  -> OpenCode server via opencode run --attach
  -> GitHub CLI / PR
  -> Preview deploy
  -> Pusher/realtime
  -> Timeline na UI
```

## Responsabilidades

### UI Next.js

- Lista feedbacks.
- Exibe pagina detalhe estilo issue/PR.
- Mostra timeline e comentarios.
- Permite acoes administrativas conforme status.
- Permite escolher o modelo do OpenCode antes de gerar plano ou executar iteracao.
- Consome eventos realtime para progresso.

### API Routes

- Validam autenticacao e autorizacao.
- Validam payloads com Zod.
- Criam feedback, comentarios e jobs.
- Retornam respostas rapidas.
- Nunca executam OpenCode, Git, GitHub CLI ou deploy diretamente em requests longos.

### MongoDB

- Guarda estado de produto.
- Guarda timeline resumida e consultavel.
- Guarda `opencodeSessionId`, nao transcript completo por padrao.
- Guarda metadados de PR, branch, worktree, deploy e execucoes.

### Worker

- Consome jobs de planejamento, implementacao, iteracao, deploy, merge e cleanup.
- Cria locks para impedir execucao concorrente no mesmo feedback.
- Cria branch e worktree.
- Executa OpenCode com `opencode run --attach`.
- Persiste eventos de progresso.
- Publica eventos realtime.
- Executa validacoes focadas.
- Cria commit, push e PR.
- Publica preview.
- Faz cleanup.

### OpenCode

- Executa planejamento e implementacao.
- Mantem transcript completo da sessao.
- E continuado via `--session <opencodeSessionId>`.
- Expoe lista de modelos via `opencode models`.

### GitHub CLI

- Cria pull requests.
- Atualiza PRs.
- Faz merge quando o feedback e aprovado.
- Deleta branch remota quando aplicavel.

### Preview deploy

- Publica URL de teste por feedback/PR.
- Usa subdominio slugificado.
- Deve ser isolado da producao.
- Deve ser removido ao concluir/cancelar.

## Estados do feedback

Estados recomendados para `developmentStatus`:

- `aberto`: feedback criado, sem plano ativo.
- `planejando`: job de plano em execucao.
- `plano_pronto`: plano disponivel para revisao.
- `implementando`: agente executando implementacao.
- `aguardando_teste`: PR/deploy disponiveis para teste.
- `ajustes_solicitados`: usuario solicitou nova iteracao.
- `aprovado`: aprovado para merge.
- `mergeando`: merge/versionamento/cleanup em andamento.
- `concluido`: PR mergeado e feedback encerrado.
- `cancelado`: fluxo interrompido por decisao administrativa.
- `falhou`: ultima operacao falhou e exige acao.

## Permissoes

### Usuario autenticado

- Criar feedback.
- Comentar no proprio feedback ou em feedbacks visiveis conforme regra atual.
- Acessar preview quando autorizado.
- Solicitar ajustes, se permitido pelo status.

### Admin

- Gerar plano.
- Escolher modelo do OpenCode por iteracao.
- Iniciar implementacao.
- Cancelar jobs.
- Reexecutar iteracoes.
- Aprovar merge.
- Fechar/cancelar feedback.

### Sistema/worker

- Registrar eventos automaticos.
- Atualizar status operacional.
- Persistir metadados de execucao.
- Publicar realtime.

## Riscos e mitigacoes

### Prompt injection

Risco: usuario tenta instruir o agente a vazar secrets ou ignorar regras.

Mitigacoes:

- Tratar texto do usuario como requisito, nao instrucao de sistema.
- Usar prompt wrapper do worker com regras fixas.
- Restringir acoes criticas a admin.

### Execucao destrutiva

Risco: agente roda comandos perigosos ou altera arquivos fora do escopo.

Mitigacoes:

- Rodar sempre em worktree isolado.
- Evitar `--auto` ate existir politica segura de permissoes.
- Bloquear comandos destrutivos no worker quando possivel.
- Exigir PR e aprovacao antes de merge.

### Segredos em logs

Risco: logs do agente, export ou timeline conterem secrets.

Mitigacoes:

- Persistir timeline resumida, nao transcript bruto completo.
- Sanitizar exports opcionais.
- Redigir variaveis sensiveis antes de salvar eventos.

### Concorrencia

Risco: duas iteracoes alteram o mesmo worktree ou feedback simultaneamente.

Mitigacoes:

- Lock por feedback.
- Job idempotente.
- Status transacional.
- Rejeitar nova execucao se houver run ativo.

### Preview com dados reais

Risco: ambiente de preview acessa banco/servicos produtivos sem controle.

Mitigacoes:

- Usar variaveis separadas para preview.
- Limitar credenciais.
- Indicar visualmente ambiente preview.
- Aplicar TTL e cleanup.
