# Inventário Funcional do Projeto

## Objetivo

Este documento descreve apenas o que está implementado hoje no worktree atual. O foco é mapear superfícies funcionais, fluxos observáveis e estados relevantes para servir como base de desenho da futura suíte de testes em Vitest.

Critério usado neste inventário:

- Priorizar comportamento sustentado pelo código.
- Descrever páginas, APIs, regras de permissão, estados e integrações transversais.
- Evitar backlog, escopo futuro e itens presentes apenas nas specs.

## Visão Geral do Produto

O projeto é uma aplicação Next.js com dashboard autenticado, catálogo de entidades de D&D, fichas de personagem, área administrativa e serviços transversais de autenticação, auditoria, storage, email, IA e realtime.

Áreas funcionais identificadas no código atual:

- Dashboard e navegação global.
- Autenticação com Clerk e sincronização local de usuários.
- Usuários e logs de auditoria.
- Catálogos CRUD de regras, habilidades, talentos, magias, classes, raças, origens e itens.
- Fichas de personagem para usuários e visão administrativa de fichas.
- Central de feedback.
- Ferramentas operacionais e scripts de importação/população.

## Capacidades Transversais

### Layout, navegação e UI base

- O layout do dashboard usa sidebar expansível/retrátil, cabeçalho mobile, fundo visual próprio e FAB de busca global.
- O estado do layout depende do hook `useSidebar`; o conteúdo principal muda a margem esquerda conforme desktop/mobile e estado da sidebar.
- Existe aquecimento de cache de busca via `useWarmSearchCache()` no layout principal.
- O dashboard expõe cards por entidade, busca inline e atalhos para módulos do sistema.
- Há páginas dedicadas a autenticação (`/sign-in`, `/sign-up`) e perfil (`/profile/[[...rest]]`).
- Existe uma página `/ui-components` para exibição/manual de componentes visuais.

Estados testáveis:

- Renderização desktop versus mobile.
- Sidebar expandida/recolhida e hidratação inicial.
- Presença de footer e FAB de busca.
- Fallbacks de carregamento em rotas com `Suspense` ou skeletons.

### Autenticação e permissões

- O frontend usa Clerk via `useAuth`, expondo `user`, `userId`, `isSignedIn`, `isLoaded`, `signOut` e `isAdmin`.
- `isAdmin` no cliente depende de `user.publicMetadata.role === "admin"`.
- Parte das páginas usa autenticação apenas para exibição/edição condicional; outras redirecionam explicitamente.
- A listagem administrativa de fichas (`/sheets`) redireciona usuários não autenticados para `/sign-in` e usuários sem papel admin para `/my-sheets`.
- A página `my-sheets` mostra uma view específica para visitantes não autenticados.

Estados testáveis:

- Usuário autenticado versus visitante.
- Admin versus usuário comum.
- Conteúdo editável versus somente leitura.
- Redirecionamentos condicionais no cliente.

### Sincronização de usuários com Clerk

- Existe sincronização Clerk → MongoDB em webhook e também em serviço reutilizável.
- `syncUserFromClerk` cria usuário local se não existir, atualiza usuários existentes, tenta reconciliar por `clerkId` e por email, reativa registros anteriores e preserva papel quando não há metadado explícito novo.
- Username é derivado de `username` do Clerk ou prefixo do email sanitizado.
- `deleteUserFromClerk` e o webhook de deleção marcam o usuário como inativo/deletado, em vez de remoção física.
- `ensureUserExists` serve como fallback para garantir presença local do usuário autenticado.

APIs e pontos de entrada:

- `POST /api/webhooks/clerk`
- Script `scripts/sync-clerk-users.ts`
- Script `scripts/bootstrap-admin.ts`

Estados testáveis:

- Criação inicial.
- Reativação de usuário previamente deletado.
- Reconciliação por email.
- Papel padrão `user`.
- Marcação de deleção em vez de hard delete.

### Auditoria

- Existe modelo de audit log com `action`, `collectionName`, `documentId`, `userId`, `details` e `timestamp`.
- `logAction` tenta registrar auditoria sem quebrar a operação principal em caso de falha.
- Há página dedicada de auditoria com filtros, tabela desktop, lista mobile e modal de detalhe.
- O modal de detalhe é usado junto de visualização de diff.

APIs relacionadas:

- `GET /api/audit-logs`
- `GET /api/audit-logs/[id]`

Estados testáveis:

- Filtros por ação, tipo de entidade e intervalo de datas.
- Carregamento mobile versus desktop.
- Abertura de detalhe.
- Tratamento de erro com retry.

### Busca, filtros e paginação

- O sistema usa busca em múltiplos módulos com filtros por texto, status e critérios específicos por entidade.
- Em catálogos principais existe alternância entre view em lista infinita e tabela paginada.
- Há endpoint `GET /api/sources?entity=...` para alimentar filtros por fonte, retornando nomes normalizados de livros.
- Fichas do usuário usam busca com `useDeferredValue` antes de consultar a API.

Estados testáveis:

- Digitação e debounce/deferred search.
- Reset e combinação de filtros.
- Lista infinita versus paginação tradicional.
- Comportamento de “nenhum resultado”.

### Rich text, menções e referências

- O editor rico usa Tiptap.
- Há suporte a formatação básica, listas, undo/redo, placeholder, imagens e menções.
- O editor inclui comportamento especializado para notação de dados e tipos de dano, com destaque visual e node inline dedicado para novos valores de dado.
- Menções são tratadas por configuração de suggestion própria.
- Existe uma auditoria administrativa para referências pendentes baseada em descrições contendo `@` sem spans de menção válidos.
- A página de auditoria de menções permite abrir edição contextual de regra, magia, habilidade e talento.

APIs relacionadas:

- `GET /api/admin/mention-audit`

Estados testáveis:

- Conteúdo com `@` sem menção válida.
- Abertura do editor correto por tipo da entidade.
- Refresh manual da auditoria.
- View em tabela versus lista.

### Storage, upload e download

- Existe upload autenticado para storage com geração de chave por usuário e timestamp.
- O sistema expõe rotas dedicadas de upload e download no namespace `core/storage`.
- Há também rota legada/auxiliar em `/api/upload`.
- O editor rico e a ficha de personagem usam componentes de upload e imagem no ecossistema visual.

APIs relacionadas:

- `POST /api/core/storage/upload`
- `GET /api/core/storage/download`
- `GET /api/upload`
- `POST /api/upload`

Estados testáveis:

- Requisição sem arquivo.
- Usuário não autenticado.
- Geração de chave de arquivo.
- Resposta com metadados do upload.

### IA, email, saúde e realtime

- Existe exemplo e API para geração de texto por IA via `generateText`.
- Existe exemplo e API para envio de email via `sendEmail`.
- Existe endpoint de health check do core.
- Existe configuração de Pusher tanto no core quanto em rotas públicas para o frontend.
- Fichas de personagem usam integração realtime com origem própria para evitar eco local.

APIs relacionadas:

- `POST /api/core/ai`
- `POST /api/core/email`
- `GET /api/core/health`
- `GET /api/realtime/pusher-config`

Estados testáveis:

- Payload válido/inválido.
- Erro de serviço.
- Disponibilidade do health check.
- Configuração pública de realtime.

## Dashboard e Navegação

### Dashboard principal

Página:

- `/`

Capacidades implementadas:

- Exibe logo e texto introdutório do produto.
- Renderiza cards por entidade para classes, raças, magias, origens, habilidades, talentos, itens, monstros e fichas.
- Busca inline disponível no dashboard.
- Card específico de usuários busca estatísticas de `/api/stats/users`.
- Há cards de estatística para regras e fichas.
- Monstros aparecem como área ainda não pronta por meio de card WIP.
- Existe card informativo sobre o repositório/população manual do catálogo.

APIs relacionadas:

- `GET /api/stats/users`
- `GET /api/stats/rules`
- `GET /api/stats/sheets`
- Demais endpoints `/api/stats/*` por entidade

Estados testáveis:

- Renderização dos cards de entidade.
- Carregamento assíncrono do card de usuários.
- Navegação a partir dos cards.

### Sidebar e navegação secundária

Capacidades implementadas:

- Sidebar expansível com comportamento específico para mobile.
- Header mobile aparece apenas em telas menores.
- Há componentes reutilizáveis de navegação lateral, toggle e busca global.

Estados testáveis:

- Alteração de layout conforme largura da janela.
- Presença/ausência do header mobile.
- Margem do conteúdo principal após hidratação.

## Usuários e Auditoria

### Usuários

Página:

- `/users`

APIs:

- `GET /api/users`
- `POST /api/users`
- `GET /api/users/[id]`
- `PUT /api/users/[id]`
- `DELETE /api/users/[id]`

Capacidades implementadas:

- Página com `Suspense` e fallback de carregamento.
- Busca textual e filtros por papel e status.
- Tabela no desktop e lista infinita no mobile.
- Modal de criação/edição.
- Dialog de exclusão.
- Ações de criação condicionadas a admin no frontend.
- O módulo trata usuários como entidade administrativa do sistema.

Estados testáveis:

- Admin visualiza CTA de criação; usuário comum não.
- Filtro por role.
- Filtro por status.
- Paginação desktop.
- Carregamento incremental mobile.
- Fluxos de editar e excluir.

### Logs de auditoria

Página:

- `/audit-logs`

APIs:

- `GET /api/audit-logs`
- `GET /api/audit-logs/[id]`

Capacidades implementadas:

- Filtros por ação, tipo de entidade e intervalo de datas.
- Tabela no desktop, lista no mobile.
- Modal/detalhe de log.
- Tela de erro com retry.

Estados testáveis:

- Filtro combinando múltiplos critérios.
- Clique na linha/cartão abre detalhe.
- Estados de erro e recuperação.

## Catálogos D&D

Os catálogos principais seguem um padrão recorrente:

- Página de listagem.
- Página de detalhe por slug.
- APIs CRUD.
- Busca, filtros e fontes.
- Alternância entre lista infinita e tabela.
- Modal de formulário.
- Dialog de exclusão.
- Pré-visualização detalhada via componentes específicos.
- Ações administrativas condicionadas a `isAdmin`.

### Regras

Páginas:

- `/rules`
- `/rules/[slug]`

APIs:

- `GET /api/rules`
- `POST /api/rules`
- `GET /api/rules/[id]`
- `PUT /api/rules/[id]`
- `DELETE /api/rules/[id]`

Capacidades implementadas:

- Filtros por texto, status e fonte.
- Lista infinita via `EntityList` e tabela dedicada.
- Formulário com editor rico.
- Exclusão via dialog.
- Página de detalhe usa container genérico de entidade.

Estados testáveis:

- Alternância de view.
- Busca + filtro de status + filtro de fonte.
- Edição e deleção a partir da listagem.
- Carregamento da página de detalhe por slug.

### Habilidades

Páginas:

- `/traits`
- `/traits/[slug]`

APIs:

- `GET /api/traits`
- `POST /api/traits`
- `GET /api/traits/[id]`
- `PUT /api/traits/[id]`
- `DELETE /api/traits/[id]`
- `GET /api/traits/search`

Capacidades implementadas:

- Página de catálogo própria.
- Formulário e dialog dedicados.
- Hooks específicos para listagem, mutações e filtros.
- Utilitário de cargas (`trait-charges`) indicando lógica de comportamento especializado.

Estados testáveis:

- Busca na listagem.
- Fluxo create/edit/delete.
- Busca dedicada via endpoint `/search`.

### Talentos

Páginas:

- `/feats`
- `/feats/[slug]`

APIs:

- `GET /api/feats`
- `POST /api/feats`
- `GET /api/feats/[id]`
- `PUT /api/feats/[id]`
- `DELETE /api/feats/[id]`
- `GET /api/feats/search`

Capacidades implementadas:

- Página de catálogo com filtros, tabela/lista e modais.
- Lógica específica de validação e categorias de feat.
- Página de detalhe via container genérico.

Estados testáveis:

- Busca e filtros.
- Categoria válida/inválida no formulário.
- Exclusão e atualização.

### Magias

Páginas:

- `/spells`
- `/spells/[slug]`

APIs:

- `GET /api/spells`
- `POST /api/spells`
- `GET /api/spells/[id]`
- `PUT /api/spells/[id]`
- `PATCH /api/spells/[id]`
- `DELETE /api/spells/[id]`
- `GET /api/spells/search`

Capacidades implementadas:

- Filtros por texto, status, círculo, escolas e fontes.
- Listagem em tabela ou lista.
- Modal de criação/edição.
- Dialog de exclusão.
- Helpers próprios (`spell-helpers`) e componentes visuais específicos para escola/círculo/dado.

Estados testáveis:

- Combinação de filtros avançados.
- Criação e edição.
- Patch parcial via endpoint por ID.
- Busca dedicada.

### Classes

Páginas:

- `/classes`
- `/classes/[slug]`

APIs:

- `GET /api/classes`
- `POST /api/classes`
- `GET /api/classes/[id]`
- `PUT /api/classes/[id]`
- `PATCH /api/classes/[id]`
- `DELETE /api/classes/[id]`
- `GET /api/classes/search`

Capacidades implementadas:

- Catálogo com filtros por texto, status e fontes.
- Tabela/lista, modal e dialog.
- Componentes especializados para preview de classe, subclasse e tabela de progressão.
- Utilitário `progression-utils` indica cálculo/transformação importante de progressão.

Estados testáveis:

- Exibição de progressão.
- Busca via search endpoint.
- Patch parcial.
- Fluxos create/edit/delete.

### Raças

Páginas:

- `/races`
- `/races/[slug]`

APIs:

- `GET /api/races`
- `POST /api/races`
- `GET /api/races/[id]`
- `PUT /api/races/[id]`
- `DELETE /api/races/[id]`

Capacidades implementadas:

- Catálogo com componentes de filtro, preview, tabela, formulário e deleção.
- Página possui loading dedicado.
- Existe integração forte com scripts de seed/importação.

Estados testáveis:

- Loading da página.
- CRUD básico.
- Visualização detalhada.

### Origens

Páginas:

- `/backgrounds`
- `/backgrounds/[slug]`

APIs:

- `GET /api/backgrounds`
- `POST /api/backgrounds`
- `GET /api/backgrounds/[id]`
- `PUT /api/backgrounds/[id]`
- `DELETE /api/backgrounds/[id]`
- `GET /api/backgrounds/search`

Capacidades implementadas:

- Filtros por texto, status, atributos, perícias, talentos e fontes.
- Tabela no desktop e lista nas demais situações.
- Modal e dialog dedicados.
- Hook próprio de página com controle de view mode.

Estados testáveis:

- Filtros específicos de background.
- Search endpoint.
- Lista versus tabela.

### Itens

Páginas:

- `/items`
- `/items/[slug]`

APIs:

- `GET /api/items`
- `POST /api/items`
- `GET /api/items/[id]`
- `PUT /api/items/[id]`
- `DELETE /api/items/[id]`
- `GET /api/items/search`

Capacidades implementadas:

- Catálogo com preview específico de arma, armadura e ferramenta.
- Formulário com subcomponentes por tipo.
- Entity chooser compartilhado para relações.
- Filtros, tabela/lista, modal e dialog.

Estados testáveis:

- Variação de formulário por tipo de item.
- Busca dedicada.
- Fluxos CRUD.
- Preservação de campos especializados no submit.

### Detalhe por slug para catálogos

Páginas:

- `/rules/[slug]`
- `/traits/[slug]`
- `/feats/[slug]`
- `/spells/[slug]`
- `/classes/[slug]`
- `/races/[slug]`
- `/backgrounds/[slug]`
- `/items/[slug]`

Capacidades implementadas:

- Todas usam `GenericEntityPage`.
- O container resolve a entidade por slug fazendo busca textual e depois refetch por ID.
- A página usa `EntityPage` para renderização.
- Para admins, ações de editar/excluir ficam acopladas aos hooks específicos da entidade.
- Há suporte a abrir a entidade em “janela solta”.
- Em classes, `query string` pode pré-selecionar subclasse na renderização.
- Se o nome mudar após edição, a rota é atualizada para o novo slug.

Estados testáveis:

- Resolução por slug.
- Fallback quando a busca retorna vários resultados.
- Invalidação e refetch após edição.
- Redirecionamento para novo slug após renomear.

## Fichas de Personagem

### Minhas fichas

Páginas:

- `/my-sheets`
- `/my-sheets/loading`

APIs:

- `GET /api/character-sheets`
- `POST /api/character-sheets`

Capacidades implementadas:

- Lista das fichas do usuário autenticado.
- Busca por texto com valor diferido.
- Paginação infinita.
- Botão para criar nova ficha.
- View específica para usuário não autenticado.
- Componentes de busca, lista e botão dedicados.

Estados testáveis:

- Usuário não autenticado vê tela alternativa.
- Busca atualiza a consulta.
- Load more de páginas.
- Criação de ficha em branco.

### Página da ficha

Páginas:

- `/sheets/[...slug]`
- `/sheets/[...slug]/loading`
- `/sheets/[...slug]/not-found`

APIs:

- `GET /api/character-sheets/by-slug`
- `GET /api/character-sheets/[id]`
- `PATCH /api/character-sheets/[id]`
- `DELETE /api/character-sheets/[id]`
- `POST /api/character-sheets/[id]/long-rest`
- `GET|POST /api/character-sheets/[id]/items`
- `PATCH|DELETE /api/character-sheets/[id]/items/[itemId]`
- `GET|POST /api/character-sheets/[id]/spells`
- `PATCH|DELETE /api/character-sheets/[id]/spells/[spellId]`
- `GET|POST /api/character-sheets/[id]/traits`
- `DELETE /api/character-sheets/[id]/traits/[traitId]`
- `GET|POST /api/character-sheets/[id]/feats`
- `DELETE /api/character-sheets/[id]/feats/[featId]`
- `GET|POST /api/character-sheets/[id]/attacks`
- `PATCH|DELETE /api/character-sheets/[id]/attacks/[attackId]`

Capacidades implementadas:

- Busca da ficha por slug e renderização de skeleton durante carregamento.
- Se a ficha não for encontrada, a página chama `notFound()`.
- `SheetForm` entra em modo somente leitura quando o usuário atual não é o dono da ficha.
- O formulário combina:
  - cabeçalho da ficha,
  - atributos e itens,
  - ataques, traços e magias,
  - notas,
  - layout desktop e mobile diferentes.
- Há autosave por campo com `PATCH` incremental.
- Se o nome muda e o backend retorna novo slug, a rota é atualizada com `router.replace`.
- Há sincronização de menções na ficha.
- Há integração realtime da ficha.
- Existem utilitários de cálculo, preenchimento automático de ataque, slug e cargas de recurso.
- Existe botão/fluxo de descanso longo.

Estados testáveis:

- Dono versus leitura pública/sem edição.
- Autosave de um campo.
- Atualização de slug após renomear.
- Skeleton inicial.
- Not-found.
- Desktop versus mobile.
- Descanso longo.
- Adição/edição/remoção de itens, magias, ataques, talentos e traits da ficha.

### Visão administrativa de fichas

Página:

- `/sheets`

APIs:

- `GET /api/admin/sheets`

Capacidades implementadas:

- Acesso restrito a admin no cliente.
- Redireciona não autenticado para sign-in e não admin para my-sheets.
- Busca e listagem de todas as fichas da plataforma.
- Tabela no desktop, lista no mobile.
- Retry em erro de listagem.

Estados testáveis:

- Controle de acesso.
- Filtro de busca.
- Tabela versus lista.
- Retry.

## Feedback

Página:

- `/feedback`

APIs:

- `GET /api/feedback`
- `POST /api/feedback`
- `PATCH /api/feedback/[id]`

Capacidades implementadas:

- Usuários autenticados podem abrir modal de novo feedback.
- Página usa filtros por busca, status e prioridade.
- Tabela no desktop e lista no mobile.
- Edição reaproveita o mesmo modal.
- Permissões distinguem campos principais e campos administrativos:
  - dono ou admin edita campos principais,
  - apenas admin edita campos administrativos.

Estados testáveis:

- Visitante não vê botão de criação.
- Usuário dono versus usuário não dono versus admin.
- Busca e filtros.
- Fluxo criar/editar.

## APIs Auxiliares e Estatísticas

### Stats por entidade

APIs:

- `GET /api/stats/backgrounds`
- `GET /api/stats/classes`
- `GET /api/stats/feats`
- `GET /api/stats/items`
- `GET /api/stats/races`
- `GET /api/stats/rules`
- `GET /api/stats/sheets`
- `GET /api/stats/spells`
- `GET /api/stats/traits`
- `GET /api/stats/users`

Capacidades implementadas:

- Alimentam cards e gráficos do dashboard.
- São parte da superfície pública interna do painel.

Estados testáveis:

- Resposta bem-sucedida.
- Estrutura mínima esperada para cards e gráficos.

### Sources

API:

- `GET /api/sources?entity=...`

Capacidades implementadas:

- Retorna fontes distintas por entidade após extrair nome de livro do campo `source`.
- Valida o parâmetro `entity` contra entidades suportadas.

Estados testáveis:

- Entidade inválida.
- Lista ordenada e sem duplicados.

## Componentes e Hooks Reutilizáveis Relevantes para Testes

### Core hooks

Hooks relevantes:

- `useApi`
- `useAuth`
- `useClickAway`
- `useDebounce`
- `useGlobalSearch`
- `useMediaQuery`
- `useSources`
- `useStorage`
- `useViewMode`
- `useWarmSearchCache`

Valor para testes:

- São pontos de comportamento transversal usados por múltiplas features.
- Mudanças neles tendem a gerar regressões amplas.

### Componentes UI reutilizáveis fora do core/ui

Componentes relevantes:

- `expandable-sidebar`
- `global-search-fab`
- `inline-search`
- `search-input`
- `data-table-pagination`
- `data-table-filters`
- `confirm-dialog`
- `empty-state`
- `error-state`
- `loading-state`
- família `glass-*`
- `glass-entity-chooser`
- `glass-image-uploader`

Valor para testes:

- Afetam navegação, filtros, busca, modais, uploads e responsividade em vários módulos.

## Scripts Operacionais

### Administração e manutenção

Scripts:

- `scripts/bootstrap-admin.ts`
- `scripts/sync-clerk-users.ts`
- `scripts/database-test.ts`
- `scripts/migrate-spell-images.ts`
- `scripts/search-cli.ts`

Capacidades implementadas:

- Bootstrap/promoção do primeiro admin.
- Sincronização em lote de usuários do Clerk.
- CLI de busca fuzzy diretamente no banco.
- Scripts utilitários para banco e migração.

Estados testáveis:

- Parsing de argumentos.
- Fluxo feliz e erros de conexão.
- Resultado de promoção/sincronização.

### Seed/importação de dados

Scripts e estrutura:

- `scripts/seed-data/index.ts`
- providers para magias, raças, talentos e itens
- tradução via GenAI, Google Cloud e LibreTranslate
- armazenamento de progresso e glossário
- testes já existentes para base provider e races provider

Capacidades implementadas:

- CLI interativa para seleção de provider e tradutor.
- Flags para dry-run, auto, reset de progresso e operações de glossário.
- Importação estruturada de dados do catálogo.
- Progresso persistido e restaurável.

Estados testáveis:

- Flags de execução.
- Seleção de provider.
- Modo dry-run versus persistência.
- Transformação de dados dos providers.

## Prioridades para a Futura Suíte Vitest

### Prioridade crítica

- Autenticação e sincronização Clerk ↔ MongoDB.
- Regras de permissão por papel e por ownership.
- APIs CRUD de usuários e auditoria.
- APIs e hooks de fichas de personagem.
- Autosave, troca de slug e descanso longo em fichas.
- Editor rico com menções e upload.

### Alto valor

- Páginas de catálogo com filtros, view mode e paginação/lista infinita.
- GenericEntityPage e resolução por slug.
- Feedback com permissões diferenciadas.
- Admin sheets e mention audit.
- Endpoints de sources e stats.

### Cobertura complementar

- Componentes visuais compartilhados.
- Hooks utilitários do core.
- Pages de exemplo do core.
- Scripts operacionais e seed-data.

## Resumo de Alvos Funcionais para Derivar Testes

O sistema atual permite construir a suíte futura a partir de quatro grupos principais:

- Fluxos administrativos: usuários, auditoria, referência pendente, admin sheets.
- Catálogos D&D: CRUD, filtros, detalhes por slug, preview, permissões.
- Fichas de personagem: criação, listagem, edição incremental, realtime e recursos aninhados.
- Infra compartilhada: auth, storage, email, IA, busca, sources, stats e componentes base.

Esse conjunto já é suficientemente amplo para justificar uma migração estruturada para Vitest em etapas, começando pelos serviços e fluxos críticos antes de expandir para UI compartilhada e catálogos completos.
