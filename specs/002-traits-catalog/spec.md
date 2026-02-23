# Feature Specification: Cadastro de Habilidades (Traits)

**Feature Branch**: `002-traits-catalog`  
**Created**: 2026-02-23  
**Status**: Draft  
**Input**: User description: "vamos especificar o cadastro de habilidades (traits) nesse catálogo de d&d. Vamos implementar uma tabela e formulário, seguindo exatamente o mesmo padrão, estrutura e componentes do cadastro de regras já existente."

## Clarifications

### Session 2026-02-23
- Q: Quais papéis podem gerenciar habilidades (Admin/Mestre/Usuário)? → A: Apenas Admins têm acesso ao dashboard administrativo; os termos são Admin e Usuário (sem "Mestre").
- Q: Qual a cor oficial da entidade no entityColors? → A: Gray/Slate (simbolizando raridade comum).
- Q: Como tratar menções a entidades excluídas? → A: Estilo visual "quebrado" e tooltip "Habilidade não encontrada".
- Q: Qual será o caminho da URL (rota)? → A: /traits (consistente com o nome interno).
- Q: Quais ações de auditoria serão rastreadas e filtráveis? → A: Apenas o trio padrão: CREATE, UPDATE, DELETE.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar Catálogo de Habilidades (Priority: P1)

Administradores e jogadores de D&D precisam visualizar rapidamente todas as habilidades disponíveis no sistema, filtrando por nome, descrição ou fonte, e verificando seu status (ativo/inativo).

**Why this priority**: Este é o caso de uso fundamental - os usuários precisam poder ver e buscar habilidades antes de criar ou editar. Sem visualização, nenhuma outra funcionalidade faz sentido.

**Independent Test**: Pode ser totalmente testado acessando a página /traits e verificando se a tabela exibe habilidades existentes com colunas de status, nome, descrição, fonte e ações. A busca pode ser testada digitando termos no campo de pesquisa e observando a filtragem em tempo real.

**Acceptance Scenarios**:

1. **Given** o usuário está autenticado e acessa /traits, **When** a página carrega, **Then** deve ver uma tabela listando todas as habilidades com colunas: Status, Nome, Descrição, Fonte, Prever e Ações
2. **Given** existem 50 habilidades cadastradas, **When** o usuário visualiza a página, **Then** deve ver paginação com 10 itens por página por padrão
3. **Given** o usuário está na página de habilidades, **When** digita "Fúria" no campo de busca, **Then** a tabela filtra mostrando apenas habilidades cujo nome, descrição ou fonte contenham "Fúria"
4. **Given** o usuário aplicou filtros de busca, **When** clica no chip de status "Ativo" ou "Inativo", **Then** a tabela filtra mostrando apenas habilidades com aquele status
5. **Given** não existem habilidades cadastradas, **When** o usuário acessa /traits, **Then** deve ver uma mensagem "Nenhuma habilidade encontrada" com sugestão para criar uma nova

---

### User Story 2 - Criar Nova Habilidade (Priority: P2)

Administradores precisam cadastrar novas habilidades no catálogo, preenchendo nome, fonte e uma descrição rica com formatação, menções a outras entidades e imagens.

**Why this priority**: Criação de conteúdo é essencial após a visualização. Permite que o catálogo seja populado com habilidades personalizadas ou de livros oficiais.

**Independent Test**: Pode ser testado clicando no botão "Nova Habilidade", preenchendo o formulário modal com nome, fonte e descrição formatada, e verificando se a habilidade aparece na tabela após salvar.

**Acceptance Scenarios**:

1. **Given** o usuário está na página /traits, **When** clica no botão "Nova Habilidade", **Then** deve abrir um modal com formulário contendo campos: Nome, Fonte, Status (switch ativo/inativo) e Descrição (editor rich-text)
2. **Given** o formulário está aberto, **When** o usuário preenche Nome como "Fúria Bárbara", Fonte como "PHB pg. 48", e adiciona uma descrição formatada, **Then** o botão "Salvar" fica habilitado
3. **Given** o usuário preencheu todos os campos obrigatórios, **When** clica em "Salvar", **Then** a habilidade é criada, o modal fecha, a tabela atualiza mostrando a nova habilidade, e uma mensagem de sucesso é exibida
4. **Given** o usuário está editando a descrição, **When** digita "@" seguido de texto, **Then** deve aparecer um menu dropdown com sugestões de entidades (Regras, Habilidades) para mencionar
5. **Given** o usuário está editando a descrição, **When** cola ou faz upload de uma imagem, **Then** a imagem deve ser incorporada no editor rich-text
6. **Given** o formulário está aberto, **When** o usuário deixa o campo Nome vazio e tenta salvar, **Then** deve ver uma mensagem de erro "Nome é obrigatório"
7. **Given** a habilidade foi criada com sucesso, **When** o sistema registra a ação, **Then** um log de auditoria é criado com ação "CREATE", entidade "Trait", e autor identificado

---

### User Story 3 - Editar Habilidade Existente (Priority: P3)

Usuários precisam corrigir ou atualizar informações de habilidades já cadastradas, mantendo histórico de mudanças via auditoria.

**Why this priority**: Edição permite refinamento e correção de conteúdo ao longo do tempo, mas não é crítico para ter um catálogo funcional inicial.

**Independent Test**: Pode ser testado clicando no ícone de editar em uma habilidade existente, modificando campos no formulário modal, salvando, e verificando se as alterações aparecem na tabela.

**Acceptance Scenarios**:

1. **Given** o usuário visualiza a tabela de habilidades, **When** clica no ícone de editar (lápis) em uma habilidade, **Then** abre o mesmo modal usado para criação, pré-preenchido com os dados atuais da habilidade
2. **Given** o modal de edição está aberto, **When** o usuário altera a descrição adicionando uma menção a outra habilidade usando "@", **Then** a menção é renderizada como badge interativo
3. **Given** o usuário editou campos e clicou em "Salvar", **When** a operação é concluída, **Then** a tabela atualiza exibindo as mudanças e um log de auditoria é criado com ação "UPDATE"
4. **Given** o usuário editou o nome de uma habilidade, **When** outras habilidades ou regras mencionam essa habilidade, **Then** as menções devem continuar funcionando (referência por ID, não por nome)

---

### User Story 4 - Excluir Habilidade (Priority: P4)

Usuários precisam remover habilidades obsoletas ou incorretas do catálogo, com confirmação para evitar exclusões acidentais.

**Why this priority**: Exclusão é importante para manutenção, mas é a última prioridade pois não afeta a criação e visualização inicial do catálogo.

**Independent Test**: Pode ser testado clicando no ícone de deletar em uma habilidade, confirmando a exclusão no dialog, e verificando se a habilidade desaparece da tabela.

**Acceptance Scenarios**:

1. **Given** o usuário visualiza a tabela de habilidades, **When** clica no ícone de deletar (lixeira) em uma habilidade, **Then** deve aparecer um dialog de confirmação perguntando "Tem certeza que deseja excluir [Nome da Habilidade]?"
2. **Given** o dialog de confirmação está aberto, **When** o usuário clica em "Cancelar", **Then** o dialog fecha e nada acontece
3. **Given** o dialog de confirmação está aberto, **When** o usuário clica em "Confirmar", **Then** a habilidade é deletada, desaparece da tabela, uma mensagem de sucesso é exibida, e um log de auditoria é criado com ação "DELETE"
4. **Given** uma habilidade foi excluída, **When** outras entidades mencionam essa habilidade, **Then** a menção deve continuar visível mas pode indicar que a entidade não existe mais (ou comportamento definido no sistema)

---

### User Story 5 - Navegar para Habilidades e Visualizar Card no Dashboard (Priority: P5)

Usuários precisam acessar o cadastro de habilidades através do menu lateral e visualizar estatísticas rápidas no dashboard.

**Why this priority**: Navegação é importante para descoberta, mas não afeta a funcionalidade core do módulo. É mais sobre integração com o resto do sistema.

**Independent Test**: Pode ser testado clicando no item "Habilidades" no sidebar (seção Cadastros) e verificando se navega para /traits. No dashboard (/), o card de Habilidades deve mostrar o total de habilidades cadastradas.

**Acceptance Scenarios**:

1. **Given** o usuário está em qualquer página do sistema, **When** expande o sidebar e visualiza a seção "Cadastros", **Then** deve ver os itens "Usuários", "Regras" e "Habilidades" listados
2. **Given** o usuário está visualizando o sidebar, **When** clica em "Habilidades", **Then** navega para /traits exibindo a tabela de habilidades
3. **Given** o usuário está no dashboard (/), **When** a página carrega, **Then** deve ver um card "Habilidades" mostrando o total de habilidades cadastradas e o número de habilidades ativas
4. **Given** o usuário está no dashboard, **When** clica no card "Habilidades", **Then** navega para /traits

---

### User Story 6 - Mencionar Habilidades em Outras Entidades (Priority: P6)

Usuários precisam criar menções interativas para habilidades ao escrever descrições de regras ou outras habilidades, permitindo navegação rápida e contexto.

**Why this priority**: Menções criam links semânticos entre entidades, enriquecendo o catálogo, mas não são críticas para o cadastro funcionar inicialmente.

**Independent Test**: Pode ser testado abrindo o editor de uma regra ou habilidade, digitando "@Habilidade" e verificando se a lista de sugestões inclui habilidades cadastradas. Ao selecionar, verificar se a menção é renderizada como badge clicável.

**Acceptance Scenarios**:

1. **Given** o usuário está editando a descrição de uma regra ou habilidade, **When** digita "@" seguido de texto, **Then** o menu de sugestões deve incluir habilidades (além de regras) filtradas pelo texto digitado
2. **Given** o menu de sugestões está aberto, **When** o usuário seleciona uma habilidade, **Then** a menção é inserida no editor como badge com cor cinza/branco (raridade comum)
3. **Given** uma descrição contém menções a habilidades, **When** o usuário visualiza a descrição renderizada, **Then** as menções aparecem como badges clicáveis com tooltip mostrando prévia da habilidade (nome, fonte, descrição resumida)
4. **Given** o usuário passa o mouse sobre uma menção de habilidade, **When** aguarda brevemente, **Then** deve aparecer um tooltip com prévia dos dados da habilidade referenciada

---

### User Story 7 - Visualizar Habilidades nos Logs de Auditoria (Priority: P7)

Administradores precisam monitorar todas as operações realizadas em habilidades (criar, editar, excluir) através da página de logs de auditoria.

**Why this priority**: Auditoria é essencial para governança, mas é uma funcionalidade transversal que não bloqueia o uso do cadastro de habilidades.

**Independent Test**: Pode ser testado criando, editando ou excluindo uma habilidade, depois acessando /audit-logs e verificando se os logs aparecem com entidade "Habilidade" e ações correspondentes.

**Acceptance Scenarios**:

1. **Given** o usuário criou uma nova habilidade, **When** acessa /audit-logs, **Then** deve ver um log com ação "CREATE", entidade "Habilidade", nome da habilidade, e autor da ação
2. **Given** o usuário está em /audit-logs, **When** abre o filtro de entidades e seleciona "Habilidade", **Then** apenas logs relacionados a habilidades devem ser exibidos
3. **Given** existem logs de criação, edição e exclusão de habilidades, **When** o usuário aplica filtro de ação "DELETE", **Then** apenas logs de exclusão de habilidades devem aparecer
4. **Given** o usuário visualiza logs de auditoria, **When** clica em um log referente a uma habilidade, **Then** deve ver detalhes completos da operação (dados antes/depois, timestamp, IP, etc.)

---

### Edge Cases

- O que acontece quando o usuário tenta criar uma habilidade com nome duplicado? (Sistema deve permitir, pois habilidades de diferentes fontes podem ter nomes iguais)
- O que acontece quando o usuário tenta salvar uma habilidade com descrição vazia? (Campo opcional - deve permitir)
- O que acontece quando uma habilidade é excluída mas está mencionada em outras entidades? (Menção deve continuar visível, mas tooltip pode indicar "Entidade não encontrada" ou mostrar cache dos dados)
- Como o sistema lida com upload de imagens muito grandes no editor rich-text? (Deve validar tamanho máximo e comprimir/redimensionar antes de salvar)
- O que acontece quando o usuário busca por um termo que não existe em nenhuma habilidade? (Exibir estado vazio com mensagem "Nenhuma habilidade encontrada" e sugestão para ajustar filtros)
- Como funciona a paginação quando o usuário aplica filtros? (Deve resetar para página 1 e recalcular total de páginas baseado nos resultados filtrados)
- O que acontece se dois usuários tentam editar a mesma habilidade simultaneamente? (Última gravação vence - comportamento padrão sem lock otimista, mas pode ser aprimorado futuramente)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE permitir aos usuários visualizar uma lista paginada de todas as habilidades cadastradas, mostrando colunas: Status, Nome, Descrição, Fonte, Prever (checkbox) e Ações
- **FR-002**: Sistema DEVE fornecer campo de busca que filtra habilidades em tempo real por nome, descrição ou fonte
- **FR-003**: Sistema DEVE permitir filtrar habilidades por status (Todas, Ativo, Inativo) através de chips interativos
- **FR-004**: Sistema DEVE exibir paginação com navegação entre páginas, mostrando total de itens e limite por página (padrão: 10 itens)
- **FR-005**: Sistema DEVE permitir criar novas habilidades através de modal com formulário contendo: Nome (obrigatório), Fonte (obrigatório), Status (switch ativo/inativo, padrão ativo), e Descrição (editor rich-text, opcional)
- **FR-006**: Sistema DEVE validar campos obrigatórios (Nome e Fonte) antes de permitir salvar habilidade
- **FR-007**: Sistema DEVE permitir editar habilidades existentes através do mesmo modal usado para criação, pré-preenchido com dados atuais
- **FR-008**: Sistema DEVE permitir excluir habilidades com confirmação obrigatória via dialog
- **FR-009**: Sistema DEVE fornecer editor de texto rico (rich-text) para o campo Descrição, suportando: formatação (negrito, itálico, listas, cabeçalhos), menções a outras entidades, e upload/incorporação de imagens
- **FR-010**: Sistema DEVE suportar menções a habilidades e regras no editor rich-text através do gatilho "@" seguido de pesquisa por nome
- **FR-011**: Sistema DEVE renderizar menções como badges interativos com cor específica (cinza/branco para habilidades) e tooltip com prévia da entidade referenciada
- **FR-012**: Sistema DEVE registrar todas as operações de criação, edição e exclusão de habilidades em logs de auditoria com ação, entidade, autor e timestamp
- **FR-013**: Sistema DEVE permitir filtrar logs de auditoria por entidade "Habilidade" através do filtro de entidades multi-selecionável
- **FR-014**: Sistema DEVE exibir item "Habilidades" no sidebar (menu lateral) na seção "Cadastros", entre "Regras" e outros cadastros
- **FR-015**: Sistema DEVE exibir card "Habilidades" no dashboard (/) mostrando total de habilidades cadastradas e número de habilidades ativas
- **FR-016**: Sistema DEVE navegar para /traits ao clicar no item "Habilidades" do sidebar ou no card do dashboard
- **FR-017**: Sistema DEVE persistir habilidades com atributos: ID único, Nome, Descrição (HTML formatado), Fonte, Status (ativo/inativo), Data de criação, Data de atualização, Autor
- **FR-018**: Sistema DEVE exibir estados visuais apropriados: loading durante carregamento, empty state quando não há habilidades, e skeleton durante paginação
- **FR-019**: Sistema DEVE limitar busca e sugestões de menções a no máximo 10 resultados para performance
- **FR-020**: Sistema DEVE permitir transição suave entre estados (loading, carregado, vazio) com animações de entrada/saída de elementos da tabela

### Key Entities

- **Trait (Habilidade)**: Representa uma habilidade de D&D (trait de raça, classe, talento, etc.). Atributos principais: ID único, Nome (ex: "Fúria Bárbara"), Descrição (HTML formatado com menções e imagens), Fonte (ex: "PHB pg. 48"), Status (ativo/inativo), Timestamps (createdAt, updatedAt), Autor (referência ao usuário que criou). Relacionamentos: Pode ser mencionada por Regras, outras Habilidades, ou outras entidades futuras; menções são armazenadas como referências de ID no HTML da descrição.

- **Mention (Menção)**: Representa uma referência semântica entre entidades. Não é um registro separado no banco, mas um nó especial no HTML da descrição. Atributos: ID da entidade referenciada, Label (nome exibido), EntityType (tipo da entidade: "Regra", "Habilidade", etc.). Renderizado como badge interativo com cor baseada no tipo de entidade.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuários conseguem visualizar a lista completa de habilidades em menos de 2 segundos após carregar a página /traits
- **SC-002**: Usuários conseguem criar uma nova habilidade preenchendo formulário e salvando em menos de 1 minuto (tempo médio)
- **SC-003**: Busca em tempo real filtra resultados em menos de 500ms após o usuário parar de digitar
- **SC-004**: 100% das operações de criar, editar e excluir habilidades geram logs de auditoria correspondentes
- **SC-005**: Usuários conseguem mencionar habilidades em descrições com no máximo 3 cliques/teclas: digitar "@", selecionar da lista (teclas de seta + Enter ou clique)
- **SC-006**: Tooltips de prévia de menções aparecem em menos de 400ms após hover (delay configurável)
- **SC-007**: Upload e incorporação de imagem no editor rich-text completa em menos de 3 segundos para imagens até 5MB
- **SC-008**: Sistema suporta pelo menos 1000 habilidades cadastradas sem degradação perceptível na visualização ou busca (paginação server-side)
- **SC-009**: 90% dos usuários conseguem criar sua primeira habilidade sem erros de validação na primeira tentativa (assumindo campos preenchidos corretamente)
- **SC-010**: Navegação entre páginas de paginação atualiza a tabela em menos de 1 segundo
