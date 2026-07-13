# Testes

## Objetivo

Garantir que o centro de desenvolvimento agentico seja confiavel, seguro e previsivel.

Os testes devem focar comportamento, permissoes, transicoes de estado, persistencia de timeline e orquestracao do worker.

## Backend

### Feedback

- Cria feedback com usuario autenticado.
- Rejeita criacao sem autenticacao.
- Rejeita payload invalido.
- Lista feedbacks com filtros existentes.
- Retorna detalhe com campos agenticos.
- Usuario comum nao altera campos administrativos.
- Admin altera prioridade/status quando permitido.

### Timeline

- Cria evento `feedback_created` ao criar feedback.
- Lista eventos em ordem cronologica.
- Cria comentario como evento de timeline.
- Rejeita comentario sem permissao.
- Sanitiza conteudo renderizavel.

### Status

- Permite transicoes validas.
- Rejeita transicoes invalidas.
- Marca `falhou` quando job falha.
- Marca `concluido` apos merge e cleanup.

### APIs agenticas

- Usuario comum nao consegue gerar plano.
- Usuario comum nao consegue implementar.
- Usuario comum nao consegue aprovar merge.
- Admin consegue criar job de plano com modelo valido.
- Admin consegue criar job de implementacao com modelo valido.
- API rejeita execucao se ja existe run ativo.
- API retorna erro em pt-BR quando OpenCode models esta indisponivel.

## Worker

### Planejamento

- Cria `FeedbackAgentRun` de plano.
- Executa adapter OpenCode com `--model` escolhido.
- Salva `opencodeSessionId` quando retornado.
- Persiste evento `plan_created`.
- Atualiza status para `plano_pronto`.

### Implementacao

- Cria branch e worktree corretos.
- Usa worktree, nao diretorio principal.
- Continua sessao com `--session <opencodeSessionId>`.
- Passa modelo escolhido para OpenCode.
- Parseia eventos JSON.
- Publica eventos realtime.
- Cria commit quando ha alteracoes.
- Cria PR via adapter GitHub.
- Atualiza status para `aguardando_teste`.

### Iteracao

- Reusa mesma branch/worktree.
- Reusa mesmo `opencodeSessionId`.
- Permite modelo diferente por iteracao.
- Registra comentario/ajuste na timeline.
- Atualiza PR e deploy.

### Merge e cleanup

- Executa version bump conforme politica definida.
- Faz merge do PR.
- Remove branch remota quando configurado.
- Remove worktree.
- Remove preview.
- Marca feedback como `concluido`.

### Falhas

- Falha do OpenCode vira `agent_failed`.
- Falha do GitHub CLI preserva logs resumidos.
- Falha de deploy nao perde PR.
- Falha de cleanup deixa acao administrativa de retry.
- Worker nao inicia segunda execucao com lock ativo.

## UI

### Lista

- Renderiza feedbacks com status agentico.
- Mostra indicador de PR quando houver.
- Mostra indicador de preview quando houver.
- Funciona em desktop e mobile.

### Detalhe

- Renderiza header, timeline, sidebar e composer.
- Renderiza plano gerado.
- Renderiza eventos de PR/deploy.
- Mostra botao de deploy quando `previewUrl` existir.
- Mostra erros do worker.
- Atualiza timeline via realtime.

### Permissoes

- Admin ve acoes agenticas.
- Usuario comum nao ve botoes administrativos.
- Usuario comum nao consegue acionar acoes por chamada direta de API.

### Selecao de modelo

- Carrega modelos de `GET /api/feedback/opencode/models`.
- Mostra loading enquanto carrega.
- Mostra erro acionavel quando falha.
- Permite refresh administrativo.
- Envia modelo selecionado ao gerar plano.
- Envia modelo selecionado ao implementar/iterar.
- Mostra modelo usado em cada run.

## Seguranca

- HTML malicioso em comentario e sanitizado.
- HTML malicioso em resposta do agente e sanitizado.
- Links perigosos sao bloqueados ou neutralizados.
- Usuario sem permissao nao acessa dados administrativos sensiveis.
- Logs nao exibem secrets conhecidos.

## Integracao com comandos externos

Comandos externos devem ser testados por adapters mockaveis:

- OpenCode adapter.
- Git adapter.
- GitHub CLI adapter.
- Deploy adapter.
- Realtime publisher.

Evitar testes que dependam de OpenCode real, `gh` real ou deploy real como parte da suite padrao.

## Testes manuais recomendados

- Criar feedback real.
- Gerar plano com modelo selecionado.
- Implementar em worktree.
- Confirmar PR criado.
- Confirmar timeline em tempo real.
- Confirmar preview abre.
- Solicitar ajuste e verificar mesma sessao OpenCode.
- Aprovar e verificar merge/cleanup.
