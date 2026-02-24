# Feature Specification: Catálogo de Talentos (Feats)

**Feature Branch**: `003-feats-catalog`  
**Created**: 2026-02-24  
**Status**: Draft  
**Input**: User description: "Implementar catálogo de talentos (Feats) no sistema D&D seguindo o padrão do cadastro de regras existente"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar Lista de Talentos (Priority: P1)

Como usuário do sistema D&Dicas, quero visualizar uma lista paginada de talentos disponíveis no sistema, com informações básicas (nome, nível, pré-requisitos, fonte, status), para que eu possa explorar os talentos disponíveis e encontrar aqueles que interessam para meu personagem.

**Why this priority**: É a funcionalidade básica de leitura. Sem a capacidade de visualizar talentos, nenhuma outra operação faz sentido. Entrega valor imediato ao permitir consulta do catálogo.

**Independent Test**: Pode ser totalmente testado acessando a rota `/talentos`, verificando que a lista carrega corretamente com dados mockados ou reais, e que a paginação funciona. Não depende de criação ou edição de talentos.

**Acceptance Scenarios**:

1. **Given** o usuário está autenticado e acessa `/talentos`, **When** a página carrega, **Then** deve exibir uma tabela com todos os talentos ativos, mostrando nome, nível (com chip colorido de acordo com raridade), pré-requisitos (listados de forma compacta), fonte, status e ações de preview/editar/deletar
2. **Given** existem talentos com diferentes níveis (1-20), **When** a lista é exibida, **Then** cada talento deve mostrar seu nível com um chip colorido correspondente à progressão de raridade (nível 1 = common/cinza, nível 20 = artifact/vermelho)
3. **Given** um talento possui pré-requisitos, **When** exibido na tabela, **Then** os pré-requisitos devem ser listados de forma compacta e bonita sem quebrar a altura da linha, mostrando o nível como primeiro item destacado
4. **Given** existem mais de 10 talentos, **When** o usuário navega pela paginação, **Then** deve carregar a próxima página mantendo os filtros aplicados
5. **Given** o usuário clica no ícone de preview, **When** o hover tooltip aparece, **Then** deve mostrar detalhes completos do talento incluindo descrição formatada e pré-requisitos destacados

---

### User Story 2 - Criar Novo Talento (Priority: P2)

Como administrador do sistema, quero criar novos talentos no catálogo, preenchendo nome, fonte, descrição rica, nível e pré-requisitos, para que eu possa expandir o conteúdo disponível aos usuários.

**Why this priority**: Funcionalidade de escrita essencial. Sem ela, o catálogo permanece estático. Depende apenas da US1 (visualização) para validar que o talento foi criado.

**Independent Test**: Pode ser testado clicando em "Novo Talento", preenchendo o formulário com dados válidos, submetendo e verificando que o talento aparece na lista. Requer apenas que a API de criação esteja funcionando.

**Acceptance Scenarios**:

1. **Given** o usuário clica em "Novo Talento", **When** o modal abre, **Then** deve exibir campos para nome, fonte, descrição (rich text editor com suporte a imagens e menções), nível (numérico, default 1, min 1, max 20), e uma lista dinâmica de pré-requisitos (strings) que pode ser vazia
2. **Given** o usuário preenche apenas os campos obrigatórios (nome, fonte, descrição) sem definir nível ou pré-requisitos, **When** submete o formulário, **Then** o sistema deve criar o talento com nível = 1 e pré-requisitos = array vazio
3. **Given** o usuário define nível como 15, **When** submete, **Then** o talento é criado com nível 15 e aparece na lista com chip de cor correspondente (próximo de legendary/laranja)
4. **Given** o usuário adiciona pré-requisitos dinamicamente ("Força 13+", "Proficiência em Armaduras Pesadas"), **When** submete, **Then** o talento é salvo com esse array de strings e exibe os pré-requisitos na tabela
5. **Given** o usuário usa menções (@) na descrição para referenciar outras regras/talentos/habilidades, **When** salva, **Then** as menções devem ser renderizadas corretamente como badges clicáveis
6. **Given** o formulário é submetido com sucesso, **When** a criação é concluída, **Then** o modal fecha, a lista de talentos é atualizada sem reload, e os logs de auditoria registram a ação CREATE em tempo real

---

### User Story 3 - Editar Talento Existente (Priority: P3)

Como administrador, quero editar talentos existentes, atualizando qualquer um de seus campos, para corrigir erros ou adicionar informações.

**Why this priority**: Manutenção do conteúdo. Depende de US1 e US2, mas é menos crítica que criação inicial.

**Independent Test**: Clicar em editar um talento, modificar campos, salvar e verificar que as mudanças foram persistidas e aparecem na lista.

**Acceptance Scenarios**:

1. **Given** o usuário clica em editar um talento, **When** o modal abre, **Then** todos os campos devem estar preenchidos com os valores atuais (nome, fonte, descrição com formatação preservada, nível, pré-requisitos)
2. **Given** o usuário altera o nível de 5 para 10, **When** salva, **Then** o chip de nível na tabela deve atualizar para a cor correspondente
3. **Given** o usuário adiciona/remove pré-requisitos, **When** salva, **Then** a lista de pré-requisitos exibida na tabela e no preview deve refletir as mudanças
4. **Given** o usuário edita a descrição, **When** salva, **Then** a auditoria deve registrar um log UPDATE com previousData e newData

---

### User Story 4 - Deletar Talento (Priority: P4)

Como administrador, quero deletar talentos que não são mais relevantes, com confirmação antes da exclusão, para manter o catálogo limpo.

**Why this priority**: Operação destrutiva, menos comum. Requer confirmação para evitar acidentes.

**Independent Test**: Clicar em deletar, confirmar e verificar que o talento foi removido da lista e logs de auditoria registram DELETE.

**Acceptance Scenarios**:

1. **Given** o usuário clica em deletar um talento, **When** o modal de confirmação aparece, **Then** deve exibir o nome do talento e botões "Cancelar" e "Deletar"
2. **Given** o usuário confirma a deleção, **When** a operação completa, **Then** o talento é removido da lista, modal fecha, e auditoria registra DELETE

---

### User Story 5 - Filtrar Talentos por Nível (Priority: P5)

Como usuário, quero filtrar talentos por nível (exato ou todos até um nível máximo), para encontrar talentos apropriados para o nível do meu personagem.

**Why this priority**: Melhoria de UX. Facilita navegação em catálogos grandes. Não bloqueia funcionalidade básica.

**Independent Test**: Aplicar filtro de nível e verificar que apenas talentos correspondentes aparecem na lista.

**Acceptance Scenarios**:

1. **Given** o usuário seleciona "Nível 5 (Exato)", **When** aplica o filtro, **Then** apenas talentos de nível 5 devem aparecer na lista
2. **Given** o usuário seleciona "Até Nível 10", **When** aplica o filtro, **Then** talentos de nível 1 a 10 devem aparecer
3. **Given** filtros de nível e status estão ativos, **When** combinados, **Then** deve retornar interseção dos resultados

---

### User Story 6 - Buscar Talentos por Texto (Priority: P6)

Como usuário, quero buscar talentos por nome, descrição ou fonte, para encontrar talentos específicos rapidamente.

**Why this priority**: Complementa filtros. Útil para catálogos com muitos itens.

**Independent Test**: Digitar texto no campo de busca e verificar que resultados aparecem em tempo real.

**Acceptance Scenarios**:

1. **Given** o usuário digita "Mago" na busca, **When** a requisição completa, **Then** deve retornar talentos que contenham "Mago" no nome, descrição ou fonte
2. **Given** busca e filtros estão ativos, **When** combinados, **Then** deve aplicar ambos os critérios

---

### User Story 7 - Mencionar Talentos em Descrições (Priority: P7)

Como usuário criando/editando conteúdo, quero mencionar talentos usando `@` no editor de texto rico, para criar links entre conteúdos relacionados.

**Why this priority**: Melhora navegação e descoberta de conteúdo relacionado.

**Independent Test**: Digitar `@` em qualquer rich text editor e verificar que talentos aparecem na lista de sugestões junto com Regras e Habilidades.

**Acceptance Scenarios**:

1. **Given** o usuário digita `@` na descrição de uma regra/habilidade/talento, **When** a lista de sugestões aparece, **Then** deve incluir talentos com badge laranja/âmbar
2. **Given** o usuário seleciona um talento da lista, **When** inserido, **Then** deve aparecer como badge clicável com preview hover

---

### User Story 8 - Monitorar Dashboard com Estatísticas de Talentos (Priority: P8)

Como administrador, quero ver estatísticas de talentos no dashboard (total, ativos, crescimento), para monitorar a evolução do catálogo.

**Why this priority**: Visibilidade administrativa. Não bloqueia funcionalidade core.

**Independent Test**: Acessar dashboard e verificar que o card de Talentos exibe métricas corretas.

**Acceptance Scenarios**:

1. **Given** o usuário acessa o dashboard, **When** a página carrega, **Then** deve exibir um card "Talentos" com ícone Zap, total de talentos, total de ativos, e gráfico de crescimento nos últimos 30 dias
2. **Given** o card é clicado, **When** navegação ocorre, **Then** deve redirecionar para `/talentos`

---

### User Story 9 - Auditar Operações em Talentos (Priority: P9)

Como administrador, quero visualizar logs de auditoria para todas as operações CRUD em talentos, para rastrear mudanças no catálogo.

**Why this priority**: Compliance e rastreabilidade. Essencial para ambientes de produção mas não bloqueia MVP.

**Independent Test**: Criar/editar/deletar um talento e verificar que logs aparecem na página de auditoria com filtro "Talento".

**Acceptance Scenarios**:

1. **Given** um talento é criado, **When** o usuário acessa logs de auditoria, **Then** deve aparecer um log com ação CREATE, entidade "Talento", nome do talento, e autor
2. **Given** o filtro de entidade é aplicado para "Talento", **When** a lista é filtrada, **Then** deve mostrar apenas logs relacionados a talentos
3. **Given** um log de talento é clicado, **When** o modal de detalhes abre, **Then** deve exibir diff completo de previousData e newData

---

### Edge Cases

- **Nível fora do intervalo**: O que acontece se o usuário tentar criar um talento com nível < 1 ou > 20? Sistema deve validar e retornar erro "Nível deve estar entre 1 e 20"
- **Pré-requisitos vazios**: Como o sistema renderiza talentos sem pré-requisitos? Deve mostrar apenas o chip de nível, sem lista vazia
- **Descrição muito longa**: Como a tabela lida com descrições extensas? Deve truncar com "..." e mostrar preview completo no hover tooltip
- **Duplicação de nome**: O sistema permite talentos com nomes duplicados? Deve validar unicidade e retornar erro 409 se já existir
- **Concorrência de edição**: Dois usuários editando o mesmo talento simultaneamente? Sistema deve usar last-write-wins, com logs de auditoria preservando ambas as mudanças
- **Menções de talentos deletados**: Como o sistema renderiza menções de talentos que foram deletados? Deve manter o badge mas desabilitar preview e adicionar indicação visual (opaco, riscado)
- **Filtro de nível sem resultados**: O que exibir se filtro de nível não retorna resultados? Deve mostrar EmptyState com mensagem "Nenhum talento encontrado para este nível"
- **Migração de dados**: Como talentos existentes serão migrados para o novo schema? Deve aplicar valor default de nível = 1 e pré-requisitos = []

## Requirements *(mandatory)*

### Functional Requirements

#### Data Model & Storage
- **FR-001**: Sistema DEVE persistir talentos com campos: `_id` (ObjectId gerado automaticamente), `name` (string, 3-100 caracteres, único), `description` (string, 10-50000 caracteres, suporta HTML com imagens S3), `source` (string, 1-200 caracteres), `level` (número inteiro, 1-20, default 1), `prerequisites` (array de strings, pode ser vazio), `status` (enum: "active" | "inactive", default "active"), `createdAt` (data), `updatedAt` (data)
- **FR-002**: Sistema DEVE validar unicidade do campo `name` (case-insensitive) no banco de dados e retornar erro 409 Conflict se duplicado
- **FR-003**: Sistema DEVE validar que `level` está no intervalo 1-20 (inclusive) e retornar erro 400 Bad Request com mensagem clara se inválido
- **FR-004**: Sistema DEVE permitir array vazio de `prerequisites` e não deve gerar erro se omitido (fallback para [])
- **FR-005**: Sistema DEVE aplicar índices no banco de dados para `name`, `level`, `status` e `createdAt` para otimizar queries

#### API Endpoints
- **FR-006**: Sistema DEVE implementar `GET /api/feats` com suporte a query params: `page` (default 1), `limit` (default 10), `search` (filtro texto em name/description/source), `searchField` (opções: "all" | "name"), `status` (opções: "all" | "active" | "inactive"), `level` (filtro exato), `levelMax` (filtro até nível máximo)
- **FR-007**: Sistema DEVE implementar `POST /api/feats` que recebe `CreateFeatInput` (name, description, source, status, level?, prerequisites?), valida dados, cria talento e retorna 201 Created com o documento criado, ou erros 400/409/500
- **FR-008**: Sistema DEVE implementar `GET /api/feats/[id]` que retorna talento específico por ObjectId ou erro 404 Not Found
- **FR-009**: Sistema DEVE implementar `PUT /api/feats/[id]` que recebe `UpdateFeatInput` (campos parciais), atualiza talento e retorna 200 OK com documento atualizado, ou erros 400/404/409/500
- **FR-010**: Sistema DEVE implementar `DELETE /api/feats/[id]` que deleta talento e retorna 200 OK com mensagem de sucesso, ou erros 404/500
- **FR-011**: Sistema DEVE implementar `GET /api/feats/search?q={query}&limit=10` para busca rápida usada no sistema de menções, retornando apenas talentos ativos com campos `_id`, `name`, `source`, `entityType: "Talento"`
- **FR-012**: Todas as rotas de escrita (POST, PUT, DELETE) DEVEM exigir autenticação via Clerk e retornar 401 Unauthorized se não autenticado

#### Frontend Components
- **FR-013**: Sistema DEVE implementar página `/talentos` acessível via sidebar com componente `FeatsPage` que orquestra `FeatsFilters`, `FeatsTable` e modais de criação/edição/deleção
- **FR-014**: `FeatsTable` DEVE exibir colunas: Status (chip), Nome, Nível (chip colorido por raridade), Pré-requisitos (lista compacta), Descrição (truncada com EntityDescription), Fonte, Preview (tooltip hover), Ações (editar/deletar)
- **FR-015**: Coluna de Nível DEVE usar chips coloridos mapeando progressão 1-20 para cores de raridade: nível 1-3 = common (cinza), 4-8 = uncommon (verde), 9-13 = rare (azul), 14-17 = veryRare (roxo), 18-19 = legendary (dourado/âmbar), 20 = artifact (vermelho)
- **FR-016**: Coluna de Pré-requisitos DEVE listar itens de forma compacta (inline, separados por vírgula ou chips pequenos) sem quebrar altura da linha, mostrando nível como primeiro item destacado (ex: "Nv. 5, Força 13+, Proficiência em...")
- **FR-017**: `FeatFormModal` DEVE implementar formulário com campos: nome (GlassInput), fonte (GlassInput), status (GlassSwitch), nível (GlassInput numérico com min=1 max=20 default=1), pré-requisitos (lista dinâmica com botões +/- para adicionar/remover strings), descrição (RichTextEditor com suporte a menções e upload de imagens)
- **FR-018**: Campo de pré-requisitos DEVE permitir usuário adicionar/remover itens dinamicamente, validar que não estejam vazios, e renderizar de forma moderna e bonita (ex: lista com animações de entrada/saída)
- **FR-019**: Campo de nível DEVE aparecer visualmente integrado aos pré-requisitos (como primeiro item da lista) mas ser um campo separado no formulário para permitir filtros e ordenação
- **FR-020**: `FeatsFilters` DEVE implementar filtro de nível com opções: seletor de nível (1-20), toggle "Exato / Até este nível", SearchInput para busca de texto, StatusChips para filtrar por status
- **FR-021**: Filtro de nível DEVE enviar `level` (modo exato) ou `levelMax` (modo "até") como query params
- **FR-022**: Sistema DEVE adicionar entrada "Talentos" no `expandable-sidebar.tsx` com ícone Zap (lucide-react), label "Talentos", rota `/talentos`, cor de destaque laranja/âmbar

#### Mentions & Integration
- **FR-023**: Sistema DEVE registrar provedor "Talento" no `ENTITY_PROVIDERS` de `suggestion.ts` com endpoint `/api/feats/search?q={query}&limit=10` e mapeamento para `entityType: "Talento"`
- **FR-024**: Sistema DEVE adicionar configuração de cores para entidade "Talento" no `entityColors` de `colors.ts` com: `name: "Talento"`, `color: "amber"`, `mention: "bg-amber-500/10 text-amber-400 border-amber-400/20"`, `badge: "bg-amber-400/20 text-amber-400"`, `border: "border-amber-500/20"`, `hoverBorder: "hover:border-amber-500/40"`, `bgAlpha: "bg-amber-500/10"`, `text: "text-amber-400"`, `hex: rarityColors.legendary` (cor dourada/âmbar do sistema de raridade)
- **FR-025**: `mention-list.tsx` DEVE exibir talentos na lista de sugestões com badge laranja/âmbar e label "Talento"
- **FR-026**: `mention-badge.tsx` DEVE renderizar menções de talentos com estilo laranja/âmbar e permitir hover para preview
- **FR-027**: `entity-preview-tooltip.tsx` DEVE implementar componente `FeatPreview` que exibe: nome, nível (destacado, chip colorido), pré-requisitos (lista bonita e moderna, nível como primeiro item com maior destaque), descrição formatada (MentionContent com mode="block"), fonte, status
- **FR-028**: Preview de pré-requisitos DEVE exibir nível como primeiro item com estilo diferenciado (maior, chip colorido, ícone de trending-up) seguido de outros pré-requisitos em lista vertical com ícones de check-circle

#### Dashboard & Monitoring
- **FR-029**: Sistema DEVE adicionar card "Talentos" no dashboard (`page.tsx`) substituindo card WIP, exibindo: ícone Zap, título "Talentos", total de talentos, total de ativos, gráfico de crescimento dos últimos 30 dias, cor de borda laranja/âmbar
- **FR-030**: API `/api/dashboard/stats` DEVE incluir seção `feats` com: `total` (count de todos os talentos), `active` (count de talentos com status active), `growth` (array de { date, count } dos últimos 30 dias)
- **FR-031**: Card clicked DEVE redirecionar para `/talentos`

#### Audit Logs
- **FR-032**: Sistema DEVE criar logs de auditoria para todas as operações CRUD em talentos com `entity: "Feat"`, `entityId: feat._id`, `action: CREATE|UPDATE|DELETE`, `performedBy: userId`, `newData` (para CREATE/UPDATE), `previousData` (para UPDATE/DELETE)
- **FR-033**: `AuditLogExtended` model DEVE aceitar valor "Feat" no campo `entity` sem erro de validação enum
- **FR-034**: `audit-logs-table.tsx` DEVE mapear entity "Feat" para label "Talento" na coluna de entidade e usar ícone Zap
- **FR-035**: `entity-multiselect.tsx` DEVE adicionar opção "Talento" no filtro de entidades com ícone Zap e cor laranja/âmbar
- **FR-036**: API `/api/audit-logs` DEVE aceitar filtro `entityType=Talento` ou `entityType=Feat` e retornar logs correspondentes
- **FR-037**: Mutation hooks DEVEM invalidar query `['audit-logs']` após operações CRUD em talentos para atualização em tempo real

#### Validation & Error Handling
- **FR-038**: Sistema DEVE validar schema de criação/edição usando Zod: `name` (min 3, max 100, required), `description` (min 10, max 50000, required), `source` (min 1, max 200, required), `level` (min 1, max 20, default 1, número inteiro), `prerequisites` (array de strings, cada string min 1 caractere), `status` (enum "active" | "inactive")
- **FR-039**: Sistema DEVE retornar erros 400 Bad Request com mensagens amigáveis para validações falhas (ex: "Nível deve estar entre 1 e 20", "Nome é obrigatório e deve ter entre 3 e 100 caracteres")
- **FR-040**: Sistema DEVE exibir mensagens de erro no formulário usando `error` prop do GlassInput e alertas visuais
- **FR-041**: Operações de escrita DEVEM usar try-catch e exibir toast de sucesso/erro ao usuário

#### Performance & UX
- **FR-042**: Sistema DEVE usar TanStack Query para cache e invalidação automática de queries (`['feats']`, `['feat', id]`, `['audit-logs']`)
- **FR-043**: Tabela DEVE exibir skeleton loaders enquanto carrega dados, EmptyState quando não há resultados, e ErrorState com botão de retry em caso de erro
- **FR-044**: Filtros DEVEM aplicar debounce de 300ms na busca de texto para evitar requisições excessivas
- **FR-045**: Paginação DEVE preservar filtros aplicados ao navegar entre páginas
- **FR-046**: Modal de formulário DEVE resetar campos ao abrir/fechar e ao alternar entre modos criar/editar
- **FR-047**: Todas as animações DEVEM usar Framer Motion com configurações do `motionConfig` para consistência

### Key Entities

- **Feat (Talento)**: Representa um talento de D&D 5e. Atributos essenciais: `_id` (identificador único), `name` (nome do talento, ex: "Mage Slayer"), `description` (descrição formatada em HTML com suporte a imagens e menções), `source` (fonte/referência bibliográfica, ex: "PHB pg. 168"), `level` (nível mínimo do personagem, 1-20), `prerequisites` (array de condições necessárias para obter o talento, ex: ["Força 13 ou superior", "Proficiência em Armaduras Pesadas"]), `status` (ativo ou inativo), `createdAt` (timestamp de criação), `updatedAt` (timestamp de última atualização). Relacionamentos: pode ser mencionado em descrições de Regras, Habilidades ou outros Talentos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuários podem visualizar lista completa de talentos com paginação funcionando em menos de 2 segundos para até 1000 registros
- **SC-002**: Administradores podem criar um novo talento preenchendo todos os campos em menos de 3 minutos (incluindo descrição formatada e pré-requisitos)
- **SC-003**: Sistema processa operações CRUD (criar, editar, deletar) em menos de 500ms cada e atualiza UI sem necessidade de refresh manual
- **SC-004**: Filtro de nível retorna resultados corretos em menos de 300ms tanto para modo "exato" quanto "até nível máximo"
- **SC-005**: Busca por texto retorna sugestões em tempo real (debounce de 300ms) com máximo de 3 segundos para queries complexas
- **SC-006**: Sistema de menções exibe talentos na lista de sugestões ao digitar `@` com latência máxima de 500ms
- **SC-007**: Logs de auditoria aparecem automaticamente na página de auditoria em menos de 2 segundos após operação CRUD sem necessidade de refresh
- **SC-008**: Dashboard carrega estatísticas de talentos (total, ativos, crescimento) em menos de 1 segundo junto com outras métricas
- **SC-009**: Preview tooltip de talentos carrega e renderiza em menos de 400ms ao fazer hover
- **SC-010**: 100% das operações de escrita (CREATE, UPDATE, DELETE) são auditadas corretamente com `previousData` e `newData` capturados
- **SC-011**: Interface renderiza corretamente em resoluções de 1920x1080 e superiores sem quebras de layout ou truncamento indevido
- **SC-012**: Sistema suporta até 10.000 talentos no catálogo sem degradação perceptível de performance em listagem e filtros
