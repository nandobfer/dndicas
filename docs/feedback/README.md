# Centro de Desenvolvimento Agentico de Feedback

## Objetivo

Transformar a Central de Feedback em um fluxo de desenvolvimento assistido por agente, com experiencia parecida com issues e pull requests do GitHub.

O usuario cria um feedback, acompanha plano, comentarios, execucoes, pull request, deploy de preview e pode aprovar ou pedir novas iteracoes ate a conclusao.

## Fluxo-alvo

1. Usuario cria um item na Central de Feedback.
2. Administrador solicita a geracao de plano.
3. OpenCode gera um plano de implementacao e o sistema salva o `opencodeSessionId` no feedback.
4. Usuario/admin le o plano na timeline.
5. Administrador escolhe o modelo do OpenCode e clica em implementar.
6. Worker cria branch e git worktree isolados.
7. Worker executa `opencode run --attach` no worktree, continuando a sessao quando existir `opencodeSessionId`.
8. O progresso e publicado em tempo real e persistido como eventos de timeline no MongoDB.
9. Worker cria commit, push e pull request via `gh`.
10. Worker publica um deploy de preview em subdominio dinamico.
11. Usuario testa pelo botao de deploy.
12. Usuario/admin aprova ou solicita ajustes.
13. Novas iteracoes continuam a mesma sessao OpenCode usando `--session`.
14. Ao aprovar, worker altera versao do app, faz merge do PR, remove branch/worktree/preview e conclui o feedback.

## Decisoes principais

- MongoDB guarda estado de produto, timeline, comentarios, plano, PR, deploy e `opencodeSessionId`.
- OpenCode continua sendo a fonte do transcript tecnico completo da sessao.
- Nao exportar a sessao inteira para MongoDB por padrao.
- Export de sessao deve existir apenas como snapshot opcional, administrativo ou final.
- Execucoes longas devem ocorrer em worker, nao dentro de API Route.
- Cada feedback em execucao deve usar branch e worktree isolados.
- PRs agênticos devem ser abertos contra `main`; `dev` é a branch local de desenvolvimento.
- Worktrees devem ficar em `/home/burgos/dndicas/worktrees`.
- O worker inicial deve rodar manualmente via `zsh`, para aproveitar credenciais do OpenCode exportadas no ambiente.
- Version bump de aprovação deve alterar `src/lib/config/version.ts`.
- A UI deve permitir que o admin escolha o modelo do OpenCode em cada iteracao.
- A lista de modelos deve vir do proprio OpenCode, via comando `opencode models`.
- Preview deploy deve preferir wildcard DNS/certificado wildcard e reverse proxy, nao `certbot` por feedback como primeira opcao.

## Documentos

- [`arquitetura.md`](./arquitetura.md): componentes, estados, permissoes e riscos.
- [`backend.md`](./backend.md): modelos, APIs e contratos de dados.
- [`worker-opencode.md`](./worker-opencode.md): orquestracao com OpenCode, Git e GitHub CLI.
- [`ui-timeline.md`](./ui-timeline.md): experiencia de usuario e timeline estilo GitHub.
- [`deploy-preview.md`](./deploy-preview.md): estrategia de previews em subdominios dinamicos.
- [`testes.md`](./testes.md): cobertura minima necessaria.
- [`roadmap-implementacao.md`](./roadmap-implementacao.md): fases recomendadas de implementacao.
- [`aicontext-feedback.md`](./aicontext-feedback.md): plano para documentar posteriormente `aicontext/modules/feedback.md`.

## Fora do escopo inicial

- Expor transcript bruto inteiro do OpenCode na UI.
- Usar API HTTP interna nao documentada do OpenCode como dependencia principal.
- Fazer merge automatico sem permissao administrativa explicita.
- Rodar agente no worktree principal do repositorio.
- Criar certificado SSL individual por feedback sem necessidade operacional clara.
