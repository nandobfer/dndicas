# Feature Specification: Minhas Fichas — Fichas de Personagem D&D 2024

**Feature Branch**: `005-character-sheets`  
**Created**: 2026-03-12  
**Status**: Draft  

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar Lista de Fichas (Priority: P1)

Um usuário autenticado acessa "Minhas Fichas" na barra lateral (abaixo de "Perfil") e visualiza todas as suas fichas de personagem em formato de grade. A página exibe um campo de busca no topo e um botão "Nova Ficha". Cada card mostra a foto do personagem (ou avatar genérico), nome, raça, classe, subclasse (se houver), pontos de vida máximos e os seis modificadores de atributo. Se a classe (ou subclasse) possuir uma imagem cadastrada no catálogo, ela aparece como plano de fundo do card com opacidade reduzida e leve desfoque, mantendo o padrão visual Liquid Glass.

**Why this priority**: É a porta de entrada para o gerenciamento de personagens. Sem essa tela, o usuário não consegue acessar ou criar fichas.

**Independent Test**: Pode ser testado acessando "/my-sheets" com um usuário autenticado que já possua fichas, verificando o grid 3-colunas e os dados exibidos nos cards.

**Acceptance Scenarios**:

1. **Given** o usuário está autenticado e acessa "Minhas Fichas", **When** a página carrega, **Then** exibe um grid de 3 colunas com os cards de suas fichas, um campo de busca e o botão "Nova Ficha"
2. **Given** o usuário possui fichas cadastradas, **When** a lista carrega, **Then** cada card mostra: imagem de fundo (da classe/subclasse, com baixa opacidade e blur leve), foto do personagem com fallback para avatar genérico, nome do personagem, raça, classe (e subclasse se houver), HP máximo e os 6 modificadores de atributo (STR, DEX, CON, INT, WIS, CHA)
3. **Given** o usuário não possui fichas, **When** a lista carrega, **Then** exibe empty state animado com mensagem encorajadora e botão de ação para criar a primeira ficha
4. **Given** a lista está carregando, **When** a requisição ainda não foi concluída, **Then** exibe estado de loading com skeleton animado nos cards
5. **Given** o usuário possui fichas, **When** a lista é renderizada, **Then** os cards aparecem com animação de entrada escalonada (stagger)
6. **Given** o usuário digita um nome com pequeno erro de digitação no campo de busca, **When** a busca processa, **Then** exibe fichas que correspondam aproximadamente ao termo digitado (busca tolerante a erros)
7. **Given** o usuário clica em um card, **When** a navegação ocorre, **Then** é redirecionado para `/sheets/[slug]` onde o slug contém o ID único da ficha

---

### User Story 2 - Criar Nova Ficha (Priority: P1)

O usuário clica em "Nova Ficha" e o sistema cria imediatamente uma ficha em branco no banco de dados, exibe o novo card na lista com animação de entrada e navega automaticamente para a página de edição da nova ficha.

**Why this priority**: Criar ficha é o pré-requisito para qualquer edição. Deve ser instantâneo e sem fricção.

**Independent Test**: Pode ser testado clicando em "Nova Ficha", verificando que um card aparece na lista e que a navegação para `/sheets/[slug]` ocorre automaticamente.

**Acceptance Scenarios**:

1. **Given** o usuário está na lista de fichas, **When** clica em "Nova Ficha", **Then** o sistema cria uma ficha em branco, o novo card aparece na lista com animação de entrada e o usuário é redirecionado para `/sheets/[slug]` da nova ficha
2. **Given** o sistema está criando a ficha, **When** a requisição está em andamento, **Then** o botão "Nova Ficha" exibe estado de carregamento e fica desabilitado para evitar duplo clique
3. **Given** a criação da ficha falha, **When** um erro ocorre, **Then** o usuário recebe uma notificação de erro e nenhum card é inserido na lista

---

### User Story 3 - Editar Ficha de Personagem com Auto-Save (Priority: P1)

O usuário acessa a página da ficha (`/sheets/[slug]`) e visualiza o formulário completo organizado como a ficha oficial D&D 2024 (conforme PDF de referência). O logotipo D&D é substituído pelo logotipo Dungeons & Dicas. Ao editar qualquer campo, o sistema aguarda 500ms de inatividade e salva automaticamente apenas o campo alterado. Cada campo exibe um indicador de carregamento individual enquanto o salvamento está em progresso. O plano de fundo da página usa a imagem da classe (ou subclasse, se houver) com baixa opacidade e leve desfoque.

**Why this priority**: A edição da ficha é o coração da feature. Todos os outros stories dependem desta base.

**Independent Test**: Pode ser testado abrindo uma ficha, editando o nome do personagem, aguardando 500ms e verificando que o valor é persistido após recarregar a página.

**Acceptance Scenarios**:

1. **Given** o usuário está na página da ficha, **When** a página carrega, **Then** exibe o formulário organizado nas seções da ficha oficial D&D 2024: identidade, atributos e modificadores, salvaguardas, perícias, combate (CA, iniciativa, deslocamento, HP), inspiração, ataques, equipamentos, personalidade/ideais/vínculos/falhas e características
2. **Given** o usuário edita um campo, **When** para de digitar por 500ms, **Then** o sistema salva apenas aquele campo (operação PATCH) e o indicador de carregamento do campo desaparece
3. **Given** o sistema está salvando um campo, **When** a requisição está em andamento, **Then** o campo exibe um indicador visual de carregamento (spinner ou animação sutil dentro do input)
4. **Given** o salvamento falha, **When** um erro ocorre, **Then** o campo indica o erro visualmente (borda vermelha) e exibe mensagem de erro; o valor original é restaurado
5. **Given** a ficha tem classe com imagem no catálogo, **When** a página exibe o plano de fundo, **Then** a imagem da classe aparece com baixa opacidade e leve desfoque; se houver subclasse com imagem, usa a da subclasse
6. **Given** múltiplos campos são editados rapidamente, **When** novos campos são editados antes do debounce do anterior, **Then** cada campo gerencia seu próprio debounce e salvamento independentemente
7. **Given** o usuário acessa a ficha via link direto, **When** o slug não corresponde a nenhuma ficha do usuário, **Then** exibe página de erro 404 com opção de voltar para a lista

---

### User Story 4 - Seleção por Catálogo com Preenchimento Automático (Priority: P2)

Cada campo da ficha que tem correspondência em um catálogo existente (raça, classe, subclasse, origem, magias, talentos, itens, habilidades) possui um botão de ícone dentro do input (lado direito). Ao clicar nesse botão, abre-se um seletor do catálogo correspondente. Ao escolher um item do catálogo, o campo é preenchido e campos relacionados são preenchidos automaticamente.

**Why this priority**: Agiliza o preenchimento e garante consistência com o conteúdo do catálogo, mas o usuário já pode preencher manualmente (P1).

**Independent Test**: Pode ser testado clicando no botão de catálogo do campo "Raça", selecionando "Humano" e verificando que raça, deslocamento, tamanho e a lista de habilidades são preenchidos automaticamente.

**Acceptance Scenarios**:

1. **Given** o usuário clica no botão de catálogo do campo raça, **When** seleciona uma raça (ex: Humano), **Then** o campo raça recebe "Humano", deslocamento recebe "9 metros", tamanho recebe "Médio" e as habilidades de raça são adicionadas à lista de características
2. **Given** o usuário clica no botão de catálogo do campo classe, **When** seleciona uma classe (ex: Guerreiro), **Then** o campo classe é preenchido, proficiências de armaduras/armas/ferramentas são adicionadas, salvaguardas de atributo são marcadas conforme a classe e as características de classe (nível 1) são adicionadas à lista
3. **Given** a classe selecionada concede magia, **When** o preenchimento automático ocorre, **Then** o sistema exibe um modal para o usuário escolher suas magias conhecidas (cantripos e magias de nível 1) da lista disponível para a classe
4. **Given** a classe selecionada tem lista de proficiências de perícias a escolher, **When** o preenchimento automático ocorre, **Then** o sistema exibe um seletor para o usuário escolher X perícias da lista permitida pela classe
5. **Given** o usuário clica no botão de catálogo do campo origem, **When** seleciona uma origem (ex: Sábio), **Then** origem é preenchida, proficiências e características de origem são adicionadas
6. **Given** o usuário clica em "adicionar magia" na seção de magias, **When** seleciona uma magia do catálogo, **Then** a magia é adicionada à lista de magias da ficha com seu avatar (ou fallback de magia genérica)
7. **Given** o usuário clica em "adicionar item" na lista de equipamentos, **When** seleciona um item do catálogo, **Then** o item é adicionado com quantidade padrão 1 e seu avatar (ou fallback genérico de item)
8. **Given** o usuário clica em "adicionar habilidade" na seção de características, **When** seleciona uma habilidade do catálogo, **Then** a habilidade é adicionada à lista de características
9. **Given** qualquer lista (itens, magias, habilidades), **When** o usuário também pode inserir manualmente sem usar o catálogo, **Then** o item é adicionado sem Avatar, exibindo apenas fallback

---

### User Story 5 - Gerenciamento de Nível e Progressão de Classe (Priority: P2)

O usuário pode editar o nível manualmente ou usar um botão dedicado de "Subir de Nível" que guia o processo de forma interativa. Ao subir de nível, o sistema consulta a tabela de progressão da classe cadastrada e apresenta apenas as escolhas necessárias para aquele nível, aplicando automaticamente os recursos que não requerem decisão.

**Why this priority**: Melhora significativamente a experiência de jogo para usuários de longo prazo, mas a edição manual já resolve o caso básico.

**Independent Test**: Pode ser testado com um personagem de nível 1 clicando em "Subir de Nível", completando o fluxo do nível 2 e verificando os recursos adicionados.

**Acceptance Scenarios**:

1. **Given** o usuário edita o campo de nível manualmente, **When** altera de 1 para 2, **Then** o nível é salvo com debounce padrão sem apresentar fluxo de escolhas
2. **Given** o usuário clica em "Subir de Nível", **When** o fluxo é iniciado, **Then** o sistema apresenta apenas as escolhas exigidas pelo próximo nível da classe (ex: magia adicional, talento, habilidade de aptidão); recursos automáticos são adicionados sem interação
3. **Given** o nível concede um "Improvement of Ability Score", **When** o usuário recebe essa opção no fluxo, **Then** pode escolher distribuir +2 em um atributo, ou +1/+1 em dois atributos, ou um talento
4. **Given** o fluxo de subida de nível é cancelado, **When** o usuário fecha o modal sem concluir, **Then** o nível não é atualizado e nenhum recurso é adicionado

---

### User Story 6 - Gerenciar Itens com Quantidade e Avatar (Priority: P2)

A seção de equipamentos da ficha exibe os itens do personagem em uma lista. Cada item tem um avatar à esquerda (imagem do catálogo se disponível, ou fallback genérico), nome, quantidade e campo de notas. O usuário pode adicionar itens pelo catálogo ou manualmente, alterar quantidade e remover itens.

**Why this priority**: Equipamentos são parte essencial de qualquer ficha, mas a mecânica de seleção de catálogo para itens não bloqueia o uso da ficha.

**Independent Test**: Pode ser testado adicionando um item manualmente, ajustando a quantidade para 3, e verificando a persistência após recarregar.

**Acceptance Scenarios**:

1. **Given** o usuário está na seção de equipamentos, **When** visualiza a lista, **Then** cada item exibe avatar (imagem do item ou ícone genérico de mochila), nome, quantidade e botão de remoção
2. **Given** o usuário altera a quantidade de um item, **When** para de editar por 500ms, **Then** a quantidade é salva automaticamente (debounce padrão)
3. **Given** o usuário remove um item, **When** clica no botão de remover, **Then** o item desaparece da lista com animação de saída e é removido do banco

---

### Edge Cases

- O que acontece quando o usuário acessa `/sheets/[slug]` de uma ficha de outro usuário? → Retorna erro 404 (não expõe a existência da ficha)
- O que acontece quando um campo de catálogo é removido do catálogo global após ter sido referenciado na ficha? → O valor textual salvo na ficha permanece; o vínculo ao catálogo é removido silenciosamente
- O que acontece quando o usuário edita um campo enquanto o save anterior ainda está em progresso? → Cada campo cancela o debounce anterior e reinicia os 500ms; o save anterior é cancelado se ainda não enviado
- O que acontece quando a busca na lista de fichas não retorna resultados? → Exibe empty state específico de "nenhuma ficha encontrada para [termo]" com opção de limpar busca
- O que acontece quando a imagem da classe/subclasse não carrega? → Plano de fundo da ficha e do card usa cor sólida dark como fallback
- O que acontece quando o usuário acessa a página sem estar autenticado? → É redirecionado para a tela de login

## Requirements *(mandatory)*

### Functional Requirements

#### Lista de Fichas (Minhas Fichas)

- **FR-001**: A barra lateral DEVE exibir o item "Minhas Fichas" abaixo de "Perfil", visível apenas para usuários autenticados
- **FR-002**: A página "Minhas Fichas" DEVE ser acessível apenas por usuários autenticados; acessos não autenticados devem redirecionar para login
- **FR-003**: A página DEVE exibir as fichas do usuário em grade de 3 colunas
- **FR-004**: A busca DEVE filtrar fichas em tempo real com tolerância a pequenos erros de digitação (busca aproximada)
- **FR-005**: O botão "Nova Ficha" DEVE criar uma ficha em branco, exibir o card na lista com animação e navegar para `/sheets/[slug]`
- **FR-006**: O slug da URL DEVE conter o ID único da ficha para garantir unicidade
- **FR-007**: Cada card DEVE exibir: foto do personagem (com fallback para avatar genérico), nome, raça, classe, subclasse (se houver), HP máximo e os seis modificadores de atributo
- **FR-008**: Se a classe (ou subclasse) do personagem possuir imagem no catálogo, ela DEVE ser exibida como plano de fundo do card com baixa opacidade e desfoque leve
- **FR-009**: A lista DEVE apresentar estados animados de: carregamento (loading), vazio (empty state) e preenchido
- **FR-010**: Transições entre estados e adições/remoções de cards DEVEM ser animadas

#### Página da Ficha

- **FR-011**: A página da ficha DEVE seguir a estrutura e organização da ficha oficial D&D 2024 (conforme documento de referência anexado), substituindo o logotipo D&D pelo logotipo Dungeons & Dicas
- **FR-012**: Todos os campos da ficha DEVEM ser opcionais
- **FR-013**: Toda alteração em qualquer campo DEVE disparar um salvamento automático (PATCH) com debounce de 500ms, enviando apenas o ID da ficha e o campo alterado
- **FR-014**: Cada campo que está sendo salvo DEVE exibir indicador de carregamento individual (loading state dentro do input)
- **FR-015**: O plano de fundo da página da ficha DEVE usar a imagem da classe (ou subclasse, se o personagem a possuir) com baixa opacidade e leve desfoque; se nenhuma imagem disponível, usa fundo escuro padrão
- **FR-016**: Campos com correspondência no catálogo (raça, classe, subclasse, origem, perícias, magias, habilidades, itens) DEVEM ter um botão de ícone dentro do input (lado direito) para abrir o seletor do catálogo
- **FR-017**: O usuário DEVE poder editar qualquer campo manualmente, independente de usar ou não o catálogo

#### Campos da Ficha (conforme ficha oficial D&D 2024)

- **FR-018**: A seção de identidade DEVE incluir: nome do personagem, classe, nível, subclasse, origem, raça/espécie, XP e inspiração
- **FR-019**: A seção de atributos DEVE incluir os seis atributos base (Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma) com seus modificadores calculados automaticamente a partir do valor base
- **FR-020**: A seção de competências DEVE incluir: bônus de proficiência, lista de salvaguardas (com checkbox de proficiência para cada atributo) e lista de perícias (com checkbox de proficiência e expertise)
- **FR-021**: A seção de combate DEVE incluir: Classe de Armadura, Iniciativa, Deslocamento, Pontos de Vida máximos/atuais/temporários, Dados de Vida e Testes de Morte (saves de sucesso/falha)
- **FR-022**: A seção de percepção passiva DEVE ser calculada automaticamente com base na perícia Percepção e no modificador de Sabedoria
- **FR-023**: A seção de ataques DEVE permitir adicionar múltiplos ataques com: nome, bônus de ataque e dano/tipo
- **FR-024**: A seção de equipamentos DEVE exibir os itens com avatar, nome, quantidade e campo de notas; deve ter botão para adicionar item do catálogo ou manualmente
- **FR-025**: A seção de personalidade DEVE incluir: traços de personalidade, ideais, vínculos e falhas
- **FR-026**: A seção de características e habilidades DEVE listar os recursos do personagem (vindos de raça, classe, origem ou adicionados manualmente) com botão para adicionar do catálogo
- **FR-027**: A seção de magias DEVE exibir: conjurador principal, atributo de conjuração, CD de resistência, bônus de ataque de magia, slots de magia por nível (com controle de uso/recuperação) e a lista de magias com avatar (ou fallback genérico de magia), bônus de ataque/CD, componentes e botão para adicionar do catálogo
- **FR-028**: A seção de notas (verso da ficha) DEVE ter áreas de texto livre para anotações adicionais
- **FR-029**: A seção de aparência DEVE incluir: foto do personagem (upload ou URL), idade, altura, peso, olhos, pele, cabelo e aparência geral

#### Integração com Catálogo

- **FR-030**: Ao selecionar uma raça do catálogo, o sistema DEVE preencher automaticamente: nome da raça, deslocamento, tamanho e adicionar as habilidades de raça à seção de características
- **FR-031**: Ao selecionar uma classe do catálogo, o sistema DEVE preencher automaticamente: nome da classe, salvaguardas de atributo, proficiências de armaduras/armas/ferramentas/perícias (nível 1) e características de classe (nível 1); se a classe conceder magia, apresentar seletor de magias iniciais
- **FR-032**: Ao selecionar uma origem do catálogo, o sistema DEVE preencher automaticamente as proficiências e características desta origem
- **FR-033**: Ao subir de nível usando o botão dedicado, o sistema DEVE apresentar apenas as escolhas necessárias para o nível seguinte da classe, aplicando automaticamente recursos sem escolha
- **FR-034**: Itens da lista de equipamentos DEVEM poder ser adicionados do catálogo (com imagem) ou manualmente (sem imagem, com fallback)
- **FR-035**: Magias DEVEM poder ser adicionadas do catálogo (com avatar) ou manualmente (com fallback de magia genérica)
- **FR-036**: Habilidades e características DEVEM poder ser adicionadas do catálogo de habilidades (Traits) ou manualmente

### Key Entities

- **CharacterSheet**: Representa a ficha de personagem de um usuário. Pertence a um único usuário. Contém todos os campos da ficha D&D 2024: identidade, atributos, competências, combate, personalidade, notas e aparência. Possui referências opcionais a entidades do catálogo (raça, classe, subclasse, origem).
- **CharacterItem**: Representa um item no inventário de um personagem. Contém: referência opcional ao catálogo de itens, nome textual (para itens manuais), quantidade e notas. Pertence a uma CharacterSheet.
- **CharacterSpell**: Representa uma magia na lista do personagem. Contém: referência opcional ao catálogo de magias, nome textual (para magias manuais) e dados de preparação. Pertence a uma CharacterSheet.
- **CharacterTrait**: Representa uma característica ou habilidade do personagem. Contém: referência opcional ao catálogo de habilidades (Traits/Feats), nome e descrição textual. Pertence a uma CharacterSheet.
- **CharacterAttack**: Representa um ataque listado na ficha. Contém: nome, bônus de ataque e dano/tipo. Pertence a uma CharacterSheet.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário pode criar uma ficha em branco e começar a preencher campos em menos de 30 segundos a partir de "Minhas Fichas"
- **SC-002**: Toda alteração em qualquer campo é persistida automaticamente sem qualquer ação adicional do usuário (zero cliques em "salvar")
- **SC-003**: A seleção de uma raça, classe ou origem do catálogo preenche todos os campos correspondentes em menos de 2 segundos, sem necessidade de preenchimento manual redundante
- **SC-004**: A lista de fichas carrega e exibe animações de entrada em menos de 1,5 segundos para um usuário com até 20 fichas
- **SC-005**: Todos os estados (loading, empty, filled) e transições de lista são visualmente animados, sem saltos ou flickering
- **SC-006**: O formulário da ficha cobre 100% dos campos da ficha oficial D&D 2024 (conforme PDF de referência), mantendo a organização por seções equivalentes
- **SC-007**: Cada campo exibe feedback visual de salvamento individual; o usuário sempre sabe qual campo está sendo salvo
- **SC-008**: A busca na lista de fichas retorna resultados relevantes mesmo com até 2 caracteres incorretos no termo digitado

## Assumptions

- O catálogo de raças já possui os atributos de deslocamento, tamanho e lista de habilidades associadas necessários para o preenchimento automático
- O catálogo de classes já possui a tabela de progressão por nível com recursos, salvaguardas e proficiências para cada classe disponível
- O catálogo de origens (Backgrounds) possui proficiências e características vinculadas
- O catálogo de itens possui campo de imagem (URL) que pode ser null para itens sem imagem
- O catálogo de magias possui campo de imagem (URL) que pode ser null para magias sem imagem
- O upload de foto do personagem reutiliza o serviço de storage existente na plataforma
- A autenticação segue o padrão Clerk já implementado na plataforma
- A URL slug da ficha usa o formato `[id]-[nome-do-personagem-slug]`; se o nome estiver vazio, usa apenas o ID
