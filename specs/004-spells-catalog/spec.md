# Feature Specification: Catálogo de Magias D&D

**Feature Branch**: `004-spells-catalog`  
**Created**: 2026-02-25  
**Status**: Draft  
**Input**: User description: "Implementar catálogo de magias D&D com CRUD completo, filtros avançados, auditoria e sistema de menções, seguindo o padrão estabelecido pelas features de Regras e Talentos"

## Clarifications

### Session 2026-02-25

- Q: Como o sistema deve representar e armazenar valores de dados (ex: "2d6", "1d8")? → A: Objeto estruturado: `{ quantidade: 2, tipo: "d6" }` para validação tipada e queries eficientes
- Q: Qual paleta de cores deve ser usada para os chips de escola de magia (8 escolas D&D)? → A: Reutilizar paleta D&D rarity: distribuir as 8 escolas entre common/uncommon/rare/veryRare/legendary/artifact
- Q: Qual esquema de cores deve ser usado para diferenciar os tipos de dado (d4, d6, d8, d10, d12, d20) no componente glass-dice-value? → A: Gradiente baseado em raridade: d4=common(cinza), d6=uncommon(verde), d8=rare(azul), d10=veryRare(roxo), d12=legendary(dourado), d20=artifact(vermelho)
- Q: Quando o usuário filtra magias por círculo específico (ex: "3º Círculo"), o filtro deve incluir truques (círculo 0) nos resultados? → A: Truques separados: filtro por círculo N mostra APENAS círculo N; usuário precisa selecionar "Truque" explicitamente para vê-los
- Q: Como o campo "fonte" (referência bibliográfica) deve ser apresentado no formulário de criação/edição de magias? → A: Input de texto simples: usuário digita livremente a fonte (ex: "PHB pg. 230", "Homebrew", "UA 2023")
- Q: Qual deve ser a ordem de exibição das colunas na tabela de magias para otimizar a experiência de consulta? → A: Status (somente admin), Círculo, Nome, Escola, Atributo Resistência, Dado Base, Dado/Nível Extra, Ações (visualizar/editar/excluir)
- Q: Como deve ser tratada a largura da coluna "Escola" que contém nomes longos (ex: "Transmutação", "Adivinhação")? → A: Nome completo sempre: mostra nome inteiro da escola no chip, mesmo que ocupe mais espaço horizontal
- Q: Qual deve ser o limite superior de validação para quantidade de dados nas magias (ex: impedir "999d20")? → A: Sem limite superior: sistema valida apenas que quantidade seja inteiro positivo (>0), delegando sanidade ao julgamento do administrador
- Q: Quando o usuário tem alterações não salvas no modal de criação/edição de magia e tenta fechá-lo (clique fora, ESC, ou botão X), o que deve acontecer? → A: Diálogo de confirmação: exibir "Você tem alterações não salvas. Descartar?" com botões Cancelar/Descartar para prevenir perda acidental de dados
- Q: Quando uma operação de API falha (erro de rede, validação do backend, ou erro do servidor durante create/update/delete), como o sistema deve informar o usuário? → A: Toast de erro apenas: exibir notificação toast com mensagem de erro; usuário deve retentar manualmente clicando em salvar novamente

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar e Buscar Magias (Priority: P1)

Jogadores e mestres precisam visualizar e buscar magias disponíveis no sistema para consultar durante o planejamento de personagens ou sessões de jogo. O catálogo deve apresentar informações essenciais (círculo, escola, dados de dano) de forma clara e permitir busca por nome.

**Why this priority**: Visualização e busca formam a base do catálogo. Sem essa funcionalidade, usuários não podem acessar o conteúdo. É o MVP mínimo para entregar valor.

**Independent Test**: Pode ser testado acessando a página de magias, visualizando a lista formatada com chips de círculo e escola, e realizando buscas por nome. Entrega valor imediato de consulta.

**Acceptance Scenarios**:

1. **Given** o usuário está na página de magias, **When** a página carrega, **Then** exibe lista de magias com colunas na ordem: Status (somente admin), Círculo (chip colorido), Nome, Escola (chip colorido), Atributo de Resistência (chip), Dado Base (com cor por tipo), Dado por Nível Extra (com cor por tipo), Ações (preview/editar/excluir)
2. **Given** o usuário está visualizando a lista de magias, **When** digita "Bola de Fogo" no campo de busca, **Then** a lista filtra para mostrar apenas magias com "Bola de Fogo" no nome ou descrição
3. **Given** o usuário visualiza uma magia nível 3, **When** observa o chip de círculo, **Then** vê "3º Círculo" com cor azul (rare/blue) seguindo a escala de raridade
4. **Given** o usuário visualiza uma magia escola Evocação, **When** observa o chip de escola, **Then** vê "Evocação" com cor vermelha distintiva
5. **Given** o usuário clica no botão de preview (ícone de olho), **When** o tooltip carrega, **Then** exibe detalhes completos da magia incluindo descrição formatada e atributos
6. **Given** existem 50 magias no sistema, **When** a página carrega, **Then** mostra paginação com 10 magias por página
7. **Given** uma magia é truque (círculo 0), **When** renderizado na tabela, **Then** o chip mostra "Truque" com cor cinza (common)

---

### User Story 2 - Filtrar Magias por Critérios Avançados (Priority: P2)

Usuários precisam filtrar magias por círculo, escola, atributo de resistência e tipo de dado para encontrar exatamente o que procuram (ex: "magias de 5º círculo de Evocação com dado d6").

**Why this priority**: Filtros transformam o catálogo de lista simples em ferramenta de pesquisa poderosa. Aumenta significativamente a usabilidade, mas a visualização básica (P1) já entrega valor.

**Independent Test**: Pode ser testado aplicando combinações de filtros e verificando se a lista atualiza corretamente. Funciona independentemente do CRUD.

**Acceptance Scenarios**:

1. **Given** o usuário está na página de magias, **When** seleciona "5º Círculo" no filtro de círculo, **Then** lista mostra apenas magias de 5º círculo
2. **Given** o usuário tem filtro de círculo ativo, **When** seleciona escola "Evocação" no multiselect, **Then** lista mostra apenas magias de 5º círculo E escola Evocação (AND lógico)
3. **Given** filtros ativos, **When** clica em "Limpar Filtros", **Then** todos os filtros resetam e lista completa reaparece
4. **Given** usuário filtra por atributo "Destreza", **When** lista atualiza, **Then** mostra apenas magias que exigem teste de resistência de Destreza
5. **Given** usuário seleciona "Até 5º" no modo de circulo, **When** lista atualiza, **Then** mostra truques + 1º ao 5º círculo
6. **Given** usuário seleciona múltiplas escolas (Evocação, Abjuração), **When** lista atualiza, **Then** mostra magias de qualquer escola selecionada (OR lógico)
7. **Given** usuário filtra por dado "d6", **When** lista atualiza, **Then** mostra apenas magias cujo dado base é d6

---

### User Story 3 - Criar e Editar Magias (Admin) (Priority: P3)

Administradores precisam criar novas magias e editar existentes para manter o catálogo atualizado com conteúdo oficial e homebrew.

**Why this priority**: CRUD é essencial para manutenção do catálogo, mas usuários podem consultar magias existentes sem essa funcionalidade. Pode ser implementado após visualização e filtros.

**Independent Test**: Admin acessa modal de criação, preenche campos (nome, círculo, escola, dados, descrição rica), salva e verifica persistência. Testa edição carregando magia existente e alterando campos.

**Acceptance Scenarios**:

1. **Given** admin clica em "Nova Magia", **When** modal abre, **Then** exibe formulário com campos vazios: nome, círculo (horizontal selector 0-9), escola (dropdown), atributo resistência (grid selector), dado base (dice selector), dado por nível (dice selector), descrição (rich text editor), status toggle
2. **Given** admin preenche nome "Raio Congelante", círculo "Truque", escola "Evocação", dado base "1d8", **When** salva, **Then** magia aparece na lista com todos os dados corretos
3. **Given** admin cria magia com circulo "5º", **When** salva e visualiza na lista, **Then** chip de círculo mostra "5º Círculo" com cor roxa (veryRare)
4. **Given** admin edita magia existente, **When** altera descrição usando rich text editor com menções (@Regra), **Then** salva e menções aparecem formatadas na visualização
5. **Given** admin cria magia sem dado por nível, **When** salva, **Then** campo fica vazio e na tabela mostra "-" ou estado vazio elegante
6. **Given** admin marca magia como "Inativa", **When** salva, **Then** magia fica visível apenas para admins na lista (com chip de status)
7. **Given** admin seleciona atributo "Constituição" no selector, **When** salva, **Then** chip de atributo (CON) aparece com cor vermelha na tabela

---

### User Story 4 - Deletar Magias com Confirmação (Admin) (Priority: P4)

Administradores precisam remover magias obsoletas ou incorretas do catálogo, com confirmação para evitar exclusões acidentais.

**Why this priority**: Deleção é importante para manutenção, mas menos crítica que criação/edição. Sistema pode funcionar sem essa funcionalidade inicialmente.

**Independent Test**: Admin clica em deletar, confirma no dialog, verifica que magia sumiu da lista e foi registrado no audit log.

**Acceptance Scenarios**:

1. **Given** admin clica no menu de ações de uma magia, **When** seleciona "Excluir", **Then** abre dialog de confirmação com nome da magia
2. **Given** dialog de confirmação aberto, **When** admin confirma exclusão, **Then** magia desaparece da lista e toast de sucesso aparece
3. **Given** dialog de confirmação aberto, **When** admin cancela, **Then** dialog fecha e magia permanece na lista
4. **Given** admin deleta magia, **When** verifica audit logs, **Then** vê registro de DELETE com performedBy, timestamp e dados anteriores da magia

---

### User Story 5 - Referenciar Magias em Outros Conteúdos (Priority: P5)

Usuários precisam mencionar magias em descrições de regras, talentos e traits usando sistema @mention para criar referências cruzadas navegáveis.

**Why this priority**: Sistema de menções melhora descoberta de conteúdo e navegação, mas catálogo funciona independentemente. Pode ser adicionado após funcionalidades core.

**Independent Test**: Usuário digita "@" em rich text editor, busca "Bola", seleciona "Bola de Fogo", salva e verifica que badge de menção aparece clicável com preview.

**Acceptance Scenarios**:

1. **Given** usuário edita descrição de talento, **When** digita "@Bola", **Then** dropdown sugere "Bola de Fogo" com tipo "Magia" e círculo
2. **Given** usuário seleciona magia no dropdown de menções, **When** salva conteúdo, **Then** menção aparece como badge colorido roxo com nome da magia
3. **Given** usuário passa mouse sobre badge de magia, **When** tooltip carrega, **Then** exibe preview com círculo, escola, dados, descrição resumida
4. **Given** usuário clica em badge de magia, **When** navegação ocorre, **Then** abre página de detalhes da magia (ou modal se implementado)

---

### Edge Cases

- **Truque (círculo 0)**: Como renderizar chips e filtros quando círculo é 0? Sistema deve mostrar "Truque" como opção distinta no seletor e chip cinza na tabela
- **Magia sem atributo de resistência**: Algumas magias não exigem teste. Campo deve aceitar valor vazio/null e mostrar "-" ou "Nenhum" na tabela
- **Magia sem dado base/por nível**: Magias utilitárias não causam dano. Campos opcionais devem renderizar estado vazio elegante (não erro ou quebra de layout)
- **Dado customizado ou múltiplos dados**: Como lidar com "1d6 + 1d4" ou "2d8 por alvo"? Campos aceitam apenas formato padrão (quantidade + tipo), descrição rica complementa detalhes
- **Escola inválida ou customizada**: Sistema valida escola contra lista predefinida (8 escolas D&D). Homebrew requer extensão da enum no backend
- **Busca com caracteres especiais**: Busca por "@", "+" ou números deve funcionar (ex: buscar "1d6" ou "5º círculo")
- **Paginação com filtros ativos**: Mudar de página mantém filtros ativos. Limpar filtros reseta para página 1
- **Magia inativa no sistema de menções**: Magias inativas aparecem em dropdown de @ mas com indicador visual (opacidade reduzida)
- **Múltiplas edições simultâneas**: Última gravação vence. Futura implementação pode adicionar versionamento ou lock otimista
- **Upload de imagem na descrição**: Rich text editor permite upload S3. Validar tamanho/tipo e exibir preview na descrição formatted
- **Alterações não salvas no modal**: Ao tentar fechar modal (ESC, clique fora, botão X) com alterações pendentes, sistema exibe diálogo de confirmação "Você tem alterações não salvas. Descartar?" com botões Cancelar/Descartar
- **Falhas de API (rede, validação, servidor)**: Sistema exibe toast de erro com mensagem descritiva; usuário retenta manualmente clicando em salvar novamente. Modal permanece aberto preservando dados do formulário

## Requirements *(mandatory)*

### Functional Requirements

**Data Management**
- **FR-001**: Sistema DEVE permitir criação de magias com campos obrigatórios (nome, descrição, círculo, escola) e opcionais (atributo resistência, dado base, dado por nível)
- **FR-002**: Sistema DEVE validar dados de entrada: círculo entre 0-9, escola em lista predefinida, formato de dado (quantidade inteira positiva >0 sem limite superior + tipo: d4/d6/d8/d10/d12/d20)
- **FR-003**: Sistema DEVE persistir magias no banco de dados com status (ativo/inativo) controlado por administradores
- **FR-004**: Sistema DEVE permitir edição de magias existentes preservando histórico via audit log
- **FR-005**: Sistema DEVE permitir exclusão de magias apenas para administradores, com confirmação obrigatória

**Visualização e Organização**
- **FR-006**: Sistema DEVE exibir lista paginada de magias com 10 itens por página
- **FR-007**: Sistema DEVE renderizar colunas da tabela na seguinte ordem: Status (somente admin), Círculo, Nome, Escola, Atributo Resistência, Dado Base, Dado/Nível Extra, Ações; cada coluna com chips visuais diferenciados por cores
- **FR-008**: Sistema DEVE exibir dados de dano em formato legível (ex: "2d6") com ícone de dado e cor baseada no tipo: d4=common(cinza), d6=uncommon(verde), d8=rare(azul), d10=veryRare(roxo), d12=legendary(dourado), d20=artifact(vermelho)
- **FR-009**: Sistema DEVE exibir descrição completa da magia apenas no preview tooltip (botão de olho) e no modal de detalhes, não na tabela principal
- **FR-010**: Sistema DEVE mostrar truques (círculo 0) com label "Truque" em chip cinza/common
- **FR-011**: Sistema DEVE renderizar estados vazios elegantes para campos opcionais não preenchidos (atributo, dados)

**Busca e Filtragem**
- **FR-012**: Sistema DEVE permitir busca textual em tempo real por nome e descrição de magias
- **FR-013**: Sistema DEVE permitir filtro por círculo único (0-9) ou modo "até N" (similar a filtro de nível de talentos); truques (círculo 0) são tratados como categoria separada e não incluídos automaticamente em outros filtros
- **FR-014**: Sistema DEVE permitir filtro multiselect por escola (OR lógico entre escolas selecionadas)
- **FR-015**: Sistema DEVE permitir filtro multiselect por atributo de resistência
- **FR-016**: Sistema DEVE permitir filtro multiselect por tipo de dado base (d4, d6, d8, d10, d12, d20)
- **FR-017**: Sistema DEVE aplicar filtros de forma cumulativa (AND lógico entre categorias diferentes)
- **FR-018**: Sistema DEVE manter filtros ativos ao navegar entre páginas da paginação
- **FR-019**: Sistema DEVE exibir apenas magias ativas para usuários comuns; admins veem todas com indicador de status

**Rich Text e Menções**
- **FR-020**: Sistema DEVE suportar descrições formatadas com rich text editor (negrito, itálico, listas, imagens S3)
- **FR-021**: Sistema DEVE permitir menção de outras entidades (@Regra, @Habilidade, @Talento, @Magia) dentro de descrições
- **FR-022**: Sistema DEVE indexar magias no sistema de sugestões @mention para serem referenciáveis em outros conteúdos
- **FR-023**: Sistema DEVE renderizar badges de menção com cor roxa (veryRare) e preview tooltip ao hover

**Auditoria e Segurança**
- **FR-024**: Sistema DEVE registrar toda operação CREATE, UPDATE, DELETE em audit log com: performedBy, timestamp, dados anteriores (UPDATE/DELETE), dados novos (CREATE/UPDATE)
- **FR-025**: Sistema DEVE restringir operações de escrita (criar, editar, deletar) apenas para administradores
- **FR-026**: Sistema DEVE permitir visualização de audit logs de magias integrada à página de logs gerais

**UI/UX**
- **FR-027**: Sistema DEVE seguir padrão visual estabelecido por features Rules e Feats (glassmorphism, animações Framer Motion, cores D&D rarity)
- **FR-028**: Sistema DEVE exibir modal de formulário responsivo com validação em tempo real e proteção contra perda de dados (diálogo de confirmação ao fechar com alterações não salvas)
- **FR-029**: Sistema DEVE exibir toast notifications para feedback de ações: sucesso (verde), erro de validação/rede/servidor (vermelho com mensagem descritiva); modal permanece aberto após erro preservando dados do formulário para retentativa manual
- **FR-030**: Sistema DEVE adicionar item "Magias" no menu de navegação do dashboard, abaixo de "Talentos"

### Key Entities

- **Spell (Magia)**: Representa uma magia de D&D. Atributos: nome (string), descrição (HTML rico), círculo (0-9), escola (enum: Abjuração, Adivinhação, Conjuração, Encantamento, Evocação, Ilusão, Necromancia, Transmutação), atributoResistencia (opcional: Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma), dadoBase (opcional: DiceValue objeto `{ quantidade: number, tipo: 'd4'|'d6'|'d8'|'d10'|'d12'|'d20' }`), dadoPorNivel (opcional: DiceValue objeto), status (ativo/inativo), fonte (string), createdAt, updatedAt
- **SpellSchool (Escola de Magia)**: Enum das 8 escolas oficiais de D&D (Abjuração, Adivinhação, Conjuração, Encantamento, Evocação, Ilusão, Necromancia, Transmutação), cada uma mapeada para uma cor da paleta de raridade D&D (common, uncommon, rare, veryRare, legendary, artifact) para chips visuais distintivos
- **DiceValue (Valor de Dado)**: Estrutura para representar dados D&D com `quantidade` (number, inteiro positivo >0 sem limite superior - validação confia no julgamento do administrador) e `tipo` (enum: 'd4', 'd6', 'd8', 'd10', 'd12', 'd20')

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuários conseguem visualizar lista completa de magias com círculo, escola e dados renderizados corretamente em até 2 segundos após carregamento da página
- **SC-002**: Administradores conseguem criar nova magia preenchendo formulário e salvando em até 1 minuto, com dados aparecendo imediatamente na lista após salvar
- **SC-003**: Usuários conseguem filtrar magias por círculo + escola e obter resultados em menos de 500ms
- **SC-004**: Busca textual retorna resultados relevantes em menos de 300ms para consultas com 15+ caracteres
- **SC-005**: Sistema exibe preview tooltip de magia em menos de 400ms após hover sobre badge de menção ou botão de preview
- **SC-006**: 100% das operações de criação, edição e exclusão de magias são registradas em audit log com dados completos
- **SC-007**: Paginação funciona corretamente com filtros ativos, mantendo estado ao navegar entre páginas
- **SC-008**: Chips visuais (círculo, escola, atributo, dado) são renderizados com cores corretas para 100% dos casos, incluindo edge cases (truque, campos vazios)
- **SC-009**: Rich text editor salva e exibe formatação corretamente, incluindo menções e imagens S3
- **SC-010**: Usuários comuns não conseguem acessar endpoints de escrita (POST, PUT, DELETE) de magias (retorna 403 Forbidden)

## Assumptions

- Sistema de autenticação e autorização (admin vs user) já está implementado e funcional
- Infraestrutura de upload S3 para imagens já existe e será reutilizada
- Sistema de audit log (AuditLogExtended) já está configurado e aceita nova entidade "Spell"
- Rich text editor (TipTap) e sistema de menções (@) já estão funcionais para outras entidades
- Banco de dados suporta schema adequado para nova coleção/tabela de Spells
- Design system de cores, glassmorphism e componentes UI (GlassCard, GlassModal, Chip, etc.) já está estabelecido
- Padrão de 8 escolas de magia D&D 5e é fixo e não requer customização inicial (homebrew pode ser adicionado futuramente)
- Sistema de navegação (sidebar menu) permite adicionar novos itens facilmente

## Out of Scope

- **Detalhes avançados de magia**: Componentes materiais, tempo de conjuração, alcance, duração (podem ser adicionados futuramente como campos extras)
- **Sistema de favoritos**: Permitir usuários salvarem magias favoritas para acesso rápido
- **Comparação de magias**: Visualização lado a lado de múltiplas magias
- **Exportação**: Download de lista de magias em PDF ou CSV
- **Versionamento de conteúdo**: Histórico completo de mudanças com diff visual (audit log registra mas não exibe diff na UI)
- **Permissões granulares**: Por enquanto apenas admin vs user; futuro pode ter "editor de conteúdo" role
- **Localization**: Suporte para idiomas além de português
- **Magias homebrew compartilhadas**: Sistema de submissão de magias por usuários para revisão admin
- **Tags customizáveis**: Além de escola e círculo, permitir tags livres (ex: "dano em área", "cura", "controle")
- **Integrações externas**: Importação de magias de D&D Beyond ou outros sistemas
- **Calculadora de dano**: Ferramenta para calcular dano médio baseado em dados
