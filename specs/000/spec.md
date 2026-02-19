# Feature Specification: Liquid Glass Core - Design System, Auth & Foundation

**Feature Branch**: `spec/000`  
**Created**: 2026-02-19  
**Status**: Draft  
**Input**: User description: "Base design/theme liquid glass + D&D, authentication, users CRUD, audit logs - Dashboard foundation with translucent UI, expandable sidebar, core reusable components"

---

## Overview

Esta é a especificação fundacional do projeto Dungeons & Dicas. Define o sistema de design Liquid Glass + D&D, componentes core reutilizáveis, autenticação integrada com Clerk, CRUD de usuários e sistema de auditoria. Todos os padrões visuais e componentes criados aqui serão reutilizados em todas as futuras implementações.

**Arquitetura de Design**: Liquid Glass com tema de fantasia D&D - visual extremamente moderno e translúcido sem fugir da estética medieval/fantástica.

---

## Clarifications

### Session 2026-02-19

- Q: Comportamento de exclusão de usuários - soft delete ou hard delete? → A: Soft delete (marcar como "inativo")
- Q: Criação do primeiro administrador - somente Clerk webhook ou suporte a criação local? → A: Criar local + Clerk via script `bootstrap-admin --email`
- Q: Retenção de logs de auditoria - tempo limitado ou ilimitado? → A: Retenção ilimitada com paginação server-side
- Q: Estado inicial do sidebar - expandido ou recolhido? → A: Inicialmente expandido
- Q: Persistência do estado do sidebar - localStorage, sessionStorage ou URL? → A: Somente sessão (sessionStorage)
- Q: Campos do formulário de usuário - quais obrigatórios vs opcionais? → A: username (obrigatório), email (obrigatório), name (opcional), avatar (opcional), role com seletor tipo tabs Liquid Glass (admin=vermelho, user=roxo)
- Q: Registros por página na tabela - quantidade e comportamento de paginação? → A: 10 registros, animações fluidas de transição e auto-scroll para topo
- Q: Tempo de debounce para busca e comportamento visual? → A: 500ms com barra de progresso visual no componente de input

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navegação no Dashboard com Sidebar Expansível (Priority: P1)

Um administrador acessa o dashboard e visualiza um sidebar elegante à esquerda com navegação clara. Ele pode expandir ou recolher o sidebar usando um botão de menu no cabeçalho, com animações fluidas e transições suaves que mantêm o contexto visual.

**Why this priority**: A navegação é fundamental para todas as outras funcionalidades. Sem uma base de layout sólida, nenhuma outra feature pode ser entregue adequadamente.

**Independent Test**: Pode ser testado navegando pelo dashboard, clicando no botão de menu para expandir/recolher o sidebar, e verificando que as animações são suaves e o estado persiste.

**Acceptance Scenarios**:

1. **Given** usuário está no dashboard, **When** clica no botão de menu no cabeçalho, **Then** o sidebar recolhe com animação fluida e o conteúdo principal expande
2. **Given** sidebar está recolhido, **When** usuário clica no botão de menu, **Then** sidebar expande com animação fluida mostrando ícones e labels
3. **Given** usuário navega entre páginas, **When** muda de rota, **Then** o estado do sidebar (expandido/recolhido) é mantido
4. **Given** sidebar está recolhido, **When** usuário passa o mouse sobre um item, **Then** aparece tooltip com o nome do item

---

### User Story 2 - Tema Liquid Glass Imersivo (Priority: P1)

Um usuário acessa o dashboard e é impactado visualmente por um tema escuro elegante com elementos translúcidos (glass morphism). Modais, popovers, sidebars e dropdowns têm fundo transparente com blur, gradientes fluidos e efeitos de luz sutis que remetem a fantasia medieval.

**Why this priority**: O tema visual define a identidade do produto e afeta diretamente a experiência do usuário em todas as interações.

**Independent Test**: Pode ser testado abrindo qualquer modal, popover ou dropdown e verificando os efeitos de transparência, blur e gradientes. Todas as cores devem seguir a paleta D&D definida.

**Acceptance Scenarios**:

1. **Given** usuário está no dashboard, **When** qualquer elemento de overlay é aberto (modal, popover, dropdown), **Then** o elemento exibe fundo translúcido com blur visível
2. **Given** tema está ativo, **When** usuário visualiza cards e containers, **Then** observa gradientes sutis e bordas com glow sutil
3. **Given** usuário interage com elementos, **When** hover ou focus ocorre, **Then** animações suaves de Framer Motion são executadas
4. **Given** tema está configurado, **When** desenvolvedor precisa usar cores, **Then** cores de raridade D&D estão disponíveis via configuração centralizada

---

### User Story 3 - Autenticação e Sincronização de Usuário (Priority: P1)

Um novo usuário faz login através do Clerk. Após autenticação bem-sucedida, seus dados básicos são automaticamente sincronizados com o banco de dados local, incluindo a atribuição de função padrão "usuário".

**Why this priority**: Autenticação é pré-requisito para qualquer funcionalidade protegida e para o CRUD de usuários.

**Independent Test**: Pode ser testado fazendo login com uma nova conta e verificando que o registro foi criado no banco local com a função correta.

**Acceptance Scenarios**:

1. **Given** usuário não existe no banco local, **When** faz primeiro login via Clerk, **Then** registro é criado com dados básicos e função "usuário"
2. **Given** usuário existe no banco local, **When** faz login, **Then** dados básicos são atualizados se houver mudanças no Clerk
3. **Given** usuário autenticado, **When** acessa área protegida, **Then** suas permissões são verificadas pelo banco local
4. **Given** administrador existente, **When** acessa dashboard, **Then** visualiza todas as funcionalidades de admin

---

### User Story 4 - CRUD de Usuários com Tabela Moderna (Priority: P2)

Um administrador acessa a seção "Cadastros > Usuários" e visualiza uma tabela moderna com filtros, busca textual e paginação. Pode adicionar novos usuários via modal translúcido, editar usuários existentes ou deletar com confirmação.

**Why this priority**: Gerenciamento de usuários é funcionalidade administrativa essencial, mas depende da autenticação e tema estarem funcionando.

**Independent Test**: Pode ser testado acessando a tabela de usuários, aplicando filtros, buscando por nome, clicando em adicionar/editar/deletar e verificando as operações no banco.

**Acceptance Scenarios**:

1. **Given** administrador está na listagem de usuários, **When** digita no campo de busca, **Then** tabela filtra usuários por nome ou email em tempo real
2. **Given** administrador está na listagem, **When** clica em "Adicionar Usuário", **Then** modal translúcido abre com formulário de cadastro
3. **Given** modal de cadastro está aberto, **When** preenche dados válidos e submete, **Then** usuário é criado e tabela atualiza
4. **Given** administrador visualiza um usuário na tabela, **When** clica no botão editar, **Then** modal abre com dados preenchidos para edição
5. **Given** administrador clica em deletar, **When** confirma no modal de confirmação, **Then** usuário é removido e tabela atualiza
6. **Given** dados inválidos são submetidos, **When** formulário é validado, **Then** mensagens de erro claras são exibidas nos campos

---

### User Story 5 - Registro de Auditoria Automático (Priority: P2)

Toda operação CRUD (criação, leitura, atualização, exclusão) é automaticamente registrada em log de auditoria com informações detalhadas sobre a ação, entidade afetada, usuário responsável e timestamp.

**Why this priority**: Auditoria é essencial para compliance e rastreabilidade, mas depende do CRUD estar funcionando.

**Independent Test**: Pode ser testado criando/editando/deletando um usuário e verificando que o registro de auditoria foi criado com todos os campos corretos.

**Acceptance Scenarios**:

1. **Given** administrador cria um novo usuário, **When** operação é concluída, **Then** registro de auditoria é criado com ação "CREATE", entidade "User" e dados do documento
2. **Given** administrador edita um usuário, **When** operação é concluída, **Then** registro de auditoria contém estado anterior e novo estado do documento
3. **Given** administrador deleta um usuário, **When** operação é concluída, **Then** registro de auditoria contém ação "DELETE" e dados do documento removido
4. **Given** qualquer operação CRUD, **When** registro é criado, **Then** contém ID do usuário responsável e timestamp preciso

---

### User Story 6 - Visualização de Logs de Auditoria (Priority: P3)

Um administrador acessa a seção "Logs de Auditoria" e visualiza uma tabela moderna com todos os registros de auditoria. Pode filtrar por ação, entidade, usuário ou período. Cada registro exibe chips coloridos para ação e entidade, e um chip de usuário com avatar e tooltip com detalhes.

**Why this priority**: Visualização de auditoria depende do sistema de registro estar funcionando.

**Independent Test**: Pode ser testado gerando alguns logs de auditoria e verificando a visualização na tabela com filtros e tooltips funcionando.

**Acceptance Scenarios**:

1. **Given** administrador está nos logs de auditoria, **When** visualiza a tabela, **Then** vê colunas: Ação, Entidade, ID do Documento, Usuário, Data/Hora, Ações
2. **Given** tabela está carregada, **When** visualiza coluna Ação, **Then** cada ação aparece como chip colorido (CREATE=verde, UPDATE=azul, DELETE=vermelho)
3. **Given** tabela está carregada, **When** visualiza coluna Usuário, **Then** cada usuário aparece como chip com avatar e nome
4. **Given** usuário passa mouse sobre chip de usuário, **When** tooltip aparece, **Then** exibe detalhes do usuário em tooltip translúcido
5. **Given** chip de usuário exibido, **When** usuário é "administrador", **Then** chip tem borda/cor vermelha
6. **Given** chip de usuário exibido, **When** usuário é "usuário", **Then** chip tem borda/cor roxa

---

### User Story 7 - Visualização de Detalhes de Auditoria com Diff (Priority: P3)

Ao clicar em "Visualizar" em um log de auditoria, um modal translúcido abre mostrando detalhes completos da operação, incluindo uma visualização lado a lado (diff view) comparando estado anterior e novo estado do documento, destacando as linhas alteradas.

**Why this priority**: É uma feature de visualização avançada que depende de toda a infraestrutura de auditoria.

**Independent Test**: Pode ser testado editando um usuário e visualizando o log de auditoria correspondente para verificar o diff.

**Acceptance Scenarios**:

1. **Given** administrador está nos logs de auditoria, **When** clica em "Visualizar" em um log de UPDATE, **Then** modal translúcido abre com detalhes
2. **Given** modal de detalhes está aberto, **When** ação é UPDATE, **Then** exibe diff view com estado anterior à esquerda e novo estado à direita
3. **Given** diff view está exibido, **When** existem diferenças, **Then** linhas alteradas são destacadas com cores distintas (remoção=vermelho, adição=verde)
4. **Given** modal de detalhes está aberto, **When** ação é CREATE, **Then** exibe apenas o novo estado do documento
5. **Given** modal de detalhes está aberto, **When** ação é DELETE, **Then** exibe apenas o estado final do documento removido

---

### Edge Cases

- O que acontece quando usuário tenta deletar a si mesmo? Sistema deve impedir a auto-exclusão.
- Como sistema trata erros de sincronização com Clerk? Deve logar erro e manter funcionalidade local.
- O que acontece quando há muitos logs de auditoria? Tabela deve ter paginação eficiente.
- Como lidar com dados de usuário deletado nos logs? Manter referência histórica, não deletar registros de auditoria.
- O que acontece com sessão quando função do usuário é alterada? Deve refletir imediatamente em novas requisições.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Sistema de Design e Tema

- **FR-001**: Sistema DEVE implementar tema escuro como padrão com estética Liquid Glass
- **FR-002**: Sistema DEVE aplicar efeitos de transparência e blur em todos os elementos de overlay (modais, popovers, dropdowns, sidebars)
- **FR-003**: Sistema DEVE fornecer paleta de cores centralizada baseada em raridades D&D (common, uncommon, rare, very rare, legendary, artifact)
- **FR-004**: Sistema DEVE fornecer configurações centralizadas de animações Framer Motion para uso consistente
- **FR-005**: Sistema DEVE incluir gradientes, bordas com glow e efeitos de luz sutis nos componentes principais
- **FR-006**: Sistema DEVE ser totalmente configurável para permitir ajustes de tema

#### Layout e Navegação

- **FR-007**: Dashboard DEVE ter sidebar expansível (drawer persistente) à esquerda
- **FR-008**: Cabeçalho DEVE ter botão de menu para expandir/recolher sidebar
- **FR-009**: Animações de expansão/recolhimento do sidebar DEVEM ser fluidas via Framer Motion
- **FR-010**: Sidebar DEVE exibir seção "Cadastros" substituindo "Módulos"
- **FR-011**: Módulo "Empresas" DEVE ser removido do sidebar
- **FR-012**: Estado do sidebar (expandido/recolhido) DEVE persistir usando sessionStorage (somente durante sessão do browser)
- **FR-053**: Sidebar DEVE iniciar expandido por padrão na primeira visita da sessão

#### Autenticação e Usuários

- **FR-013**: Autenticação DEVE ser gerenciada pelo Clerk
- **FR-014**: Sistema DEVE sincronizar dados do usuário (email, nome, avatar) do Clerk para banco local
- **FR-015**: Sistema DEVE atribuir função padrão "usuário" para novos registros
- **FR-016**: Sistema DEVE suportar funções: "administrador" e "usuário"
- **FR-017**: Somente administradores DEVEM ter acesso às funcionalidades de gerenciamento
- **FR-054**: Sistema DEVE fornecer script `bootstrap-admin --email <email>` para criar primeiro administrador (cria no banco local e no Clerk)
- **FR-055**: Script bootstrap-admin DEVE validar se já existe administrador antes de criar novo

#### CRUD de Usuários

- **FR-018**: Sistema DEVE exibir tabela de usuários com colunas: Avatar, Nome, Email, Função, Data Cadastro, Ações
- **FR-019**: Sistema DEVE fornecer campo de busca textual com debounce de 500ms e barra de progresso visual durante digitação
- **FR-020**: Sistema DEVE fornecer filtros por função (todos, administrador, usuário) e status (ativos, inativos, todos)
- **FR-050**: Componente de busca DEVE exibir indicador visual de progresso (barra) enquanto aguarda debounce
- **FR-021**: Botão "Adicionar Usuário" DEVE abrir modal translúcido com formulário
- **FR-022**: Formulário de usuário DEVE validar campos: username (obrigatório, único), email (obrigatório, válido, único), name (opcional), avatar URL (opcional)
- **FR-047**: Seletor de função DEVE ser estilo tabs Liquid Glass com cores distintas (admin=vermelho, user=roxo)
- **FR-023**: Coluna de ações DEVE ter botões para Editar e Deletar
- **FR-024**: Botão Editar DEVE abrir modal com dados preenchidos
- **FR-025**: Botão Deletar DEVE abrir modal de confirmação antes de executar
- **FR-026**: Sistema DEVE impedir usuário de deletar a si mesmo
- **FR-027**: Tabela DEVE exibir 10 registros por página com paginação server-side
- **FR-044**: Exclusão de usuários DEVE ser soft delete, marcando status como "inativo"
- **FR-045**: Usuários inativos DEVEM ser filtráveis na tabela (filtro de status: ativos/inativos/todos)
- **FR-046**: Paginação DEVE executar animação fluida de transição entre páginas com auto-scroll para topo

#### Componentes Core Reutilizáveis

- **FR-028**: Sistema DEVE fornecer componente DataTable genérico e configurável
- **FR-029**: Sistema DEVE fornecer componente de Filtros reutilizável
- **FR-030**: Sistema DEVE fornecer componente FormModal translúcido genérico
- **FR-031**: Sistema DEVE fornecer componente Chip/Badge com variantes de cor
- **FR-032**: Sistema DEVE fornecer componente UserChip com avatar e tooltip
- **FR-033**: Sistema DEVE fornecer componente DiffView para comparação de estados
- **FR-034**: Sistema DEVE fornecer componente ConfirmDialog translúcido
- **FR-035**: Todos componentes Core DEVEM ter documentação via comentários JSDoc

#### Sistema de Auditoria

- **FR-036**: Sistema DEVE registrar automaticamente todas as operações CRUD
- **FR-037**: Registro de auditoria DEVE conter: ação, entidade, ID do documento, ID do usuário, timestamp, dados anteriores (se aplicável), dados novos
- **FR-038**: Sistema DEVE exibir tabela de logs com colunas: Ação, Entidade, ID Documento, Usuário, Data/Hora, Ações
- **FR-051**: Logs de auditoria DEVEM ter retenção ilimitada
- **FR-052**: Tabela de logs DEVE implementar paginação server-side otimizada para grandes volumes
- **FR-039**: Chips de ação DEVEM ter cores distintas: CREATE=verde, READ=cinza, UPDATE=azul, DELETE=vermelho
- **FR-040**: Chip de usuário DEVE exibir avatar, nome e cor baseada na função
- **FR-041**: Tooltip do chip de usuário DEVE mostrar detalhes completos do usuário
- **FR-042**: Botão "Visualizar" DEVE abrir modal com detalhes e diff view
- **FR-043**: Diff view DEVE destacar linhas adicionadas, removidas e modificadas

### Key Entities

- **User**: Representa um usuário do sistema. Atributos: ID local, Clerk ID, username (único), nome, email (único), avatar URL, função (administrador/usuário), status (ativo/inativo), data de criação, data de atualização.
- **AuditLog**: Representa um registro de auditoria. Atributos: ID, ação (CREATE/READ/UPDATE/DELETE), entidade (nome da entidade), documento ID, usuário ID (referência ao User), dados anteriores (JSON), dados novos (JSON), timestamp.
- **ThemeConfig**: Configuração de tema centralizada. Atributos: cores, gradientes, configurações de blur, variantes de animação.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos elementos de overlay (modais, popovers, dropdowns) exibem efeitos visuais Liquid Glass (transparência + blur)
- **SC-002**: Animação de expansão/recolhimento do sidebar completa em menos de 400ms
- **SC-003**: Todas as operações CRUD em usuários são registradas automaticamente no log de auditoria
- **SC-004**: Tabela de usuários carrega em menos de 2 segundos com até 100 registros
- **SC-005**: Sincronização Clerk → banco local ocorre em menos de 1 segundo após login
- **SC-006**: 100% dos componentes Core incluem documentação JSDoc adequada
- **SC-007**: Filtros e busca na tabela respondem em menos de 300ms
- **SC-008**: Diff view exibe corretamente diferenças entre estados anterior e novo
- **SC-009**: 100% das cores de raridade D&D são configuráveis via arquivo centralizado
- **SC-010**: Usuários conseguem identificar visualmente ações e funções pelo sistema de chips coloridos

---

## Assumptions

- Clerk já está configurado e funcional no projeto Core
- MongoDB Atlas está configurado e acessível
- Framer Motion está instalado como dependência
- Shadcn/ui está configurado para componentes base
- O desenvolvedor seguirá os padrões de código definidos no arquivo react.instructions.md
- Tailwind CSS está configurado com suporte a glass morphism (backdrop-blur)

---

## Out of Scope

- Catálogo público (será implementado em feature posterior)
- Conteúdo de D&D (classes, raças, magias, etc.)
- Integração com Owlbear Rodeo
- Sistema de permissões granulares (além de admin/usuário)
- Internacionalização (i18n)
- Modo claro do tema
- PWA e funcionalidades offline

---

## Dependencies

- **Clerk**: Autenticação e gerenciamento de identidade
- **MongoDB**: Banco de dados para persistência
- **Framer Motion**: Animações e transições
- **Shadcn/ui**: Componentes base
- **TailwindCSS**: Estilização
- **React Hook Form + Zod**: Formulários e validação

---

## Technical Notes (for implementation reference)

> **Nota**: Esta seção é informativa para o planejamento, não prescreve implementação específica.

### Estrutura Sugerida de Arquivos de Configuração

```
src/
├── lib/
│   └── config/
│       ├── colors.ts          # Paleta de cores D&D + Liquid Glass
│       ├── motion-configs.ts  # Variantes de animação Framer Motion
│       └── glass-config.ts    # Configurações de glassmorphism
├── core/
│   └── ui/
│       ├── data-table/        # Componente DataTable genérico
│       ├── filters/           # Componente de filtros reutilizável
│       ├── form-modal/        # Modal de formulário translúcido
│       ├── chip/              # Chip/Badge com variantes
│       ├── user-chip/         # Chip de usuário com avatar
│       ├── diff-view/         # Visualização de diff
│       └── confirm-dialog/    # Modal de confirmação
```

### Cores de Referência (ajustáveis)

| Tipo     | Nome          | Propósito                    |
| -------- | ------------- | ---------------------------- |
| Rarity   | Common        | Elementos neutros, cinza     |
| Rarity   | Uncommon      | Sucesso, verde               |
| Rarity   | Rare          | Informação, azul             |
| Rarity   | Very Rare     | Destaque, roxo               |
| Rarity   | Legendary     | Alerta, dourado              |
| Rarity   | Artifact      | Perigo, vermelho             |
| Role     | Administrador | Badge/borda vermelha         |
| Role     | Usuário       | Badge/borda roxa             |
| Action   | CREATE        | Chip verde                   |
| Action   | UPDATE        | Chip azul                    |
| Action   | DELETE        | Chip vermelho                |
| Action   | READ          | Chip cinza                   |
