# UI e Timeline

## Objetivo

Substituir a experiencia atual de tabela/modal por uma central parecida com GitHub Issues/Pull Requests, mantendo a identidade visual do projeto.

## Paginas

### Lista

Rota atual:

```text
/feedback
```

Deve continuar listando feedbacks, mas com indicadores de fluxo agentico:

- status de desenvolvimento.
- PR aberto.
- preview disponivel.
- ultima atividade.
- prioridade.
- autor.

### Detalhe

Nova rota sugerida:

```text
/feedback/[id]
```

Deve concentrar plano, timeline, comentarios, acoes e links operacionais.

## Layout sugerido

```text
Header
  Titulo, status, tipo, prioridade
  Acoes principais

Conteudo
  Timeline central
  Composer de comentario

Sidebar
  Autor
  Desenvolvimento
  Modelo atual/ultimo modelo usado
  PR
  Deploy preview
  Sessao OpenCode
  Datas
```

## Timeline

Eventos devem aparecer em ordem cronologica.

Tipos visuais:

- Comentario do usuario.
- Comentario/admin note.
- Plano gerado pelo agente.
- Inicio/fim de execucao.
- Progresso resumido do agente.
- Commit criado.
- PR criado/atualizado.
- Deploy iniciado/pronto/falho.
- Aprovacao.
- Merge.
- Cleanup.
- Erro.

## Composer de comentarios

Requisitos:

- Enviar comentario comum.
- Quando houver PR/deploy aguardando teste, permitir pedir ajustes.
- Mensagens devem entrar na timeline.
- Comentarios que disparam iteracao devem exigir admin ou fluxo de permissao definido.

## Acoes administrativas

As acoes devem aparecer conforme status e permissao.

### `aberto`

- Gerar plano.
- Cancelar feedback.

### `plano_pronto`

- Implementar.
- Regenerar plano.
- Cancelar feedback.

### `aguardando_teste`

- Abrir deploy.
- Solicitar ajustes.
- Aprovar e fazer merge.
- Cancelar fluxo.

### `falhou`

- Tentar novamente.
- Ver detalhes do erro.
- Cancelar fluxo.

## Selecao de modelo OpenCode

O admin deve escolher o modelo a cada iteracao agentica.

Pontos de UI:

- Select de modelo no modal ou painel de acao.
- Lista carregada de `GET /api/feedback/opencode/models`.
- Botao administrativo de refresh.
- Mostrar ultimo modelo usado na sidebar.
- Mostrar modelo usado em cada evento/run da timeline.

A origem da lista deve ser o comando:

```bash
opencode models
```

Nao hardcodar modelos no frontend.

Estados do select:

- carregando modelos.
- modelos indisponiveis.
- erro ao consultar OpenCode.
- modelo previamente usado como valor sugerido.

Mensagens devem ser em pt-BR, por exemplo:

- `Carregando modelos do OpenCode...`
- `Nao foi possivel carregar os modelos disponiveis.`
- `Atualizar lista de modelos`

## Realtime

A pagina detalhe deve assinar eventos por feedback.

Comportamento esperado:

- Novo evento aparece na timeline sem reload.
- Status muda em tempo real.
- Botao de deploy aparece quando preview estiver pronto.
- Erros de worker aparecem como cards acionaveis.

## Responsividade

Desktop:

- Timeline ampla.
- Sidebar lateral fixa ou sticky.

Mobile:

- Header compacto.
- Sidebar vira secoes recolhiveis.
- Acoes principais ficam em bloco destacado.
- Timeline preserva legibilidade.

## Renderizacao segura

Plano, comentarios e eventos podem conter HTML ou Markdown.

Requisitos:

- Nao renderizar HTML gerado por agente sem sanitizacao.
- Preferir Markdown renderizado com allowlist.
- Se usar `dangerouslySetInnerHTML`, aplicar sanitizacao server-side e client-side.
- Bloquear scripts, handlers inline, iframes e URLs perigosas.

## Estados vazios e erros

Estados necessarios:

- Feedback sem timeline alem da criacao.
- Plano ainda nao gerado.
- Nenhum deploy disponivel.
- PR ainda nao criado.
- Falha ao carregar timeline.
- Falha ao carregar modelos OpenCode.
- Worker indisponivel.

Todas as mensagens devem estar em pt-BR.
