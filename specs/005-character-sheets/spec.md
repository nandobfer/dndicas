# Feature Specification: Minhas Fichas — Fichas de Personagem D&D 2024

**Feature Branch**: `005-character-sheets`  
**Created**: 2026-03-12  
**Status**: Draft  

## Clarifications

### Session 2026-03-12

- Q: Multiclasse será suportada nesta entrega? → A: Fora do escopo desta entrega — somente uma classe principal; campo de texto livre para o usuário registrar multiclasse manualmente se desejar
- Q: Como o usuário pode excluir uma ficha? → A: Hard delete com modal de confirmação — ao confirmar, a ficha é apagada permanentemente do banco de dados
- Q: Qual o layout da página da ficha? → A: Página única com scroll vertical — seções organizadas em colunas como na ficha física (sidebar esquerda com atributos/salvaguardas/perícias, área central com combate/ataques/equipamentos, área direita com personalidade/características/magias)
- Q: HP atual e slots de magia usados são persistidos no banco? → A: Sim — todos os campos de estado de sessão (HP atual, HP temporário, slots de magia usados, dados de vida usados, testes de morte) são persistidos no banco com o mesmo debounce de 500ms e PATCH por campo
- Q: Fichas podem ser compartilhadas com outras pessoas? → A: Sim — o dono pode tornar a ficha pública; qualquer pessoa com o link pode visualizá-la em modo somente leitura; a ficha continua privada por padrão ao ser criada
- Q: Como o usuário adiciona foto ao personagem? → A: Upload de arquivo — o usuário faz upload de imagem local; armazenada no serviço de storage existente na plataforma; sem suporte a URL externa
- Q: Descanso Curto e Longo devem ser implementados? → A: Apenas Descanso Longo — botão "Descanso Longo" recupera todos os recursos (HP máximo, todos os slots de magia, dados de vida); sem botão de Descanso Curto nesta entrega; o usuário ajusta dados de vida e outros recursos parciais manualmente
- Q: Existe limite de fichas por usuário? → A: Sem limite nesta entrega — o usuário pode criar quantas fichas quiser
- Q: Qual a ordenação padrão da lista de fichas? → A: Mais recentemente modificadas primeiro (`updatedAt` DESC)
- Q: Qual componente UI usar para o seletor do catálogo dentro dos campos da ficha? → A: Reutilizar o componente existente `GlassEntityChooser` (`@/components/ui/glass-entity-chooser`) — Popover com campo de busca interno, já suporta `EntityProvider`, busca com debounce e criação de nova entidade; o botão de ícone dentro do input da ficha deve abrir este componente- Q: Como o layout se comporta em telas menores (mobile/tablet)? → A: Grid responsivo na lista (3 col → 2 col tablet → 1 col mobile); página da ficha em coluna única no mobile com seções empilhadas verticalmente
- Q: Onde ficam listados talentos e habilidades na ficha? → A: Seguir exatamente a ficha oficial D&D 2024 — quatro seções separadas: "Características de Classe" (Traits origem classe), "Características Raciais" (Traits origem raça), "Talentos" (entidade Feat) e "Habilidades" (todas as demais Traits — origem, manuais ou outras fontes)
- Q: A quarta seção de características de origem fica separada? → A: Quarta seção chamada "Habilidades" — acomoda todas as Traits que não são raciais nem de classe (inclui origem/background, adições manuais e outras fontes)
- Q: Os bônus de perícias são calculados automaticamente? → A: Sim — cálculo automático pelo frontend: modificador do atributo base + bônus de proficiência (se checkbox marcado) + bônus de proficiência extra (se expertise marcada); o usuário gerencia apenas os checkboxes, nunca o valor numérico da perícia diretamente
- Q: Iniciativa e CA são calculadas automaticamente? → A: Ambas automáticas — todos os campos derivados são calculados automaticamente, mas todos são editáveis manualmente (o usuário pode sobrescrever qualquer valor calculado); **todos os campos com cálculo automático devem exibir tooltip on hover com a memória de cálculo** (ex: "10 + DEX mod (3) + Prof (2) = 15")
- Q: Qual o idioma da interface da ficha? → A: 100% português BR — seguir a nomeclatura da ficha oficial anexada (ex: "Pontos de Vida", "Salvaguardas", "Perícias", "Bônus de Proficiência", "Força", "Destreza")
- Q: Bônus de proficiência é calculado automaticamente pelo nível? → A: Sim — calculado pela tabela D&D 2024 a partir do nível total (1-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6); exibe tooltip com memória de cálculo; editável manualmente; alteração de nível dispara recalculo em cascata de todos os valores derivados (prof → perícias → salvaguardas)
- Q: HP máximo é calculado automaticamente? → A: Não — HP máximo é campo manual; o cálculo envolve decisões do jogador (rolar dados vs média por nível) que tornam a automação impraticável; o usuário preenche diretamente o valor
- Q: O campo de XP será incluído na ficha? → A: Não — campo de XP removido do escopo; a ficha não terá rastreamento de pontos de experiência
- Q: A seção de moedas será incluída? → A: Sim — cinco campos numéricos manuais (PC, PP, PE, PO, PL); cada campo exibe tooltip on hover com o equivalente em Peças de Ouro (ex: PC → "equivale a 0,01 PO cada"; PL → "equivale a 10 PO cada"); sem conversão automática entre moedas
- Q: Bônus de ataque de magia e CD de resistência são calculados automaticamente? → A: Sim — CD = `8 + bônus de proficiência + modificador do atributo de conjuração`; bônus de ataque = `bônus de proficiência + modificador do atributo de conjuração`; ambos exibem tooltip com memória de cálculo e são editáveis manualmente- Q: Descanso Curto e Longo devem ser implementados? → A: Apenas Descanso Longo — um botão "Descanso Longo" recupera automaticamente HP máximo, todos os slots de magia e dados de vida; sem botão de Descanso Curto nesta entrega

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

- O que acontece quando um visitante não autenticado acessa uma ficha **privada**? → Retorna erro 404 (não expõe a existência da ficha)
- O que acontece quando um visitante acessa uma ficha **pública**? → Exibe a ficha em modo somente leitura sem exibir controles de edição; nenhum campo pode ser editado
- O que acontece quando um usuário tenta registrar multiclasse? → Não há suporte a multiclasse nesta entrega; o usuário pode usar o campo de texto livre "Notas de multiclasse" para registro manual
- O que acontece quando um campo de catálogo é removido do catálogo global após ter sido referenciado na ficha? → O valor textual salvo na ficha permanece; o vínculo ao catálogo é removido silenciosamente
- O que acontece quando o usuário edita um campo enquanto o save anterior ainda está em progresso? → Cada campo cancela o debounce anterior e reinicia os 500ms; o save anterior é cancelado se ainda não enviado
- O que acontece quando a busca na lista de fichas não retorna resultados? → Exibe empty state específico de "nenhuma ficha encontrada para [termo]" com opção de limpar busca
- O que acontece ao confirmar a exclusão de uma ficha? → A ficha é permanentemente deletada do banco; o card some da lista com animação de saída; não há recuperação possível após confirmação
- O que acontece quando a imagem da classe/subclasse não carrega? → Plano de fundo da ficha e do card usa cor sólida dark como fallback
- O que acontece quando o usuário acessa a página sem estar autenticado? → É redirecionado para a tela de login

## Requirements *(mandatory)*

### Functional Requirements

#### Lista de Fichas (Minhas Fichas)

- **FR-001**: A barra lateral DEVE exibir o item "Minhas Fichas" abaixo de "Perfil", visível apenas para usuários autenticados
- **FR-002**: A página "Minhas Fichas" DEVE ser acessível apenas por usuários autenticados; acessos não autenticados devem redirecionar para login
- **FR-002a**: A página de visualização de uma ficha pública (`/sheets/[slug]`) DEVE ser acessível sem autenticação em modo somente leitura; controles de edição, salvamento e exclusão NÃO são exibidos para visitantes
- **FR-002b**: Fichas são **privadas por padrão** ao serem criadas; o dono pode alterar a visibilidade para pública a qualquer momento
- **FR-003**: A página DEVE exibir as fichas do usuário em grade responsiva: **3 colunas** no desktop, **2 colunas** em tablet, **1 coluna** no mobile; ordenadas por última modificação (`updatedAt` DESC) por padrão
- **FR-004**: A busca DEVE filtrar fichas em tempo real com tolerância a pequenos erros de digitação (busca aproximada)
- **FR-005**: O botão "Nova Ficha" DEVE criar uma ficha em branco, exibir o card na lista com animação e navegar para `/sheets/[slug]`
- **FR-006**: O slug da URL DEVE conter o ID único da ficha para garantir unicidade
- **FR-007**: Cada card DEVE exibir: foto do personagem (com fallback para avatar genérico), nome, raça, classe, subclasse (se houver), HP máximo e os seis modificadores de atributo
- **FR-008**: Se a classe (ou subclasse) do personagem possuir imagem no catálogo, ela DEVE ser exibida como plano de fundo do card com baixa opacidade e desfoque leve
- **FR-009**: A lista DEVE apresentar estados animados de: carregamento (loading), vazio (empty state) e preenchido
- **FR-010**: Transições entre estados e adições/remoções de cards DEVEM ser animadas
- **FR-010a**: Cada card DEVE ter opção de exclusão (ex: menu de contexto ou botão); ao acionar, exibe modal de confirmação com aviso de ação irreversível; ao confirmar, deleta a ficha permanentemente do banco e remove o card da lista com animação de saída
- **FR-010b**: Cada card DEVE ter opção de alternar visibilidade (privada/pública); o estado atual deve ser visível no card (ex: ícone de cadeado)

#### Página da Ficha

- **FR-011**: A página da ficha DEVE seguir a estrutura e organização da ficha oficial D&D 2024 (conforme documento de referência anexado), substituindo o logotipo D&D pelo logotipo Dungeons & Dicas; o layout DEVE ser **página única com scroll vertical**, organizada em 3 colunas equivalentes às da ficha física no desktop (coluna esquerda: atributos, salvaguardas, perícias; coluna central: combate, ataques, equipamentos; coluna direita: personalidade, características, magias, notas); **em mobile, as seções devem empilhar em coluna única** na mesma ordem de prioridade
- **FR-011a**: **Toda a nomenclatura da ficha DEVE estar em português BR**, seguindo fidelmente a tradução da ficha oficial D&D 2024 anexada como referência (ex: "Pontos de Vida", "Salvaguardas", "Perícias", "Bônus de Proficiência", "Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma")
- **FR-012**: Todos os campos da ficha DEVEM ser opcionais
- **FR-013**: Toda alteração em qualquer campo DEVE disparar um salvamento automático (PATCH) com debounce de 500ms, enviando apenas o ID da ficha e o campo alterado
- **FR-014**: Cada campo que está sendo salvo DEVE exibir indicador de carregamento individual (loading state dentro do input)
- **FR-015**: O plano de fundo da página da ficha DEVE usar a imagem da classe (ou subclasse, se o personagem a possuir) com baixa opacidade e leve desfoque; se nenhuma imagem disponível, usa fundo escuro padrão
- **FR-016**: Campos com correspondência no catálogo (raça, classe, subclasse, origem, perícias, magias, habilidades, itens) DEVEM ter um botão de ícone dentro do input (lado direito) que abre o componente `GlassEntityChooser` (`@/components/ui/glass-entity-chooser`) com o `EntityProvider` correspondente; o componente já oferece busca com debounce, navegação por teclado e criação de nova entidade
- **FR-017**: O usuário DEVE poder editar qualquer campo manualmente, independente de usar ou não o catálogo

#### Campos da Ficha (conforme ficha oficial D&D 2024)

- **FR-018**: A seção de identidade DEVE incluir: nome do personagem, classe (única), nível, subclasse, origem, raça/espécie e inspiração; **XP não será incluído**; multiclasse está **fora do escopo** desta entrega — o campo classe aceita apenas uma classe do catálogo ou texto livre; um campo de texto auxiliar "Notas de multiclasse" pode ser usado para registros manuais
- **FR-019**: A seção de atributos DEVE incluir os seis atributos base (Força, Destreza, Constituição, Inteligência, Sabedoria, Carisma) com seus **modificadores calculados automaticamente** a partir do valor base `floor((valor - 10) / 2)`; o modificador exibe tooltip on hover com a memória de cálculo (ex: "STR 16 → floor((16-10)/2) = +3")
- **FR-020**: A seção de competências DEVE incluir: **bônus de proficiência** (calculado automaticamente pela tabela D&D 2024: nível 1-4 = +2, 5-8 = +3, 9-12 = +4, 13-16 = +5, 17-20 = +6; editável manualmente), lista de salvaguardas (checkbox de proficiência por atributo, valor calculado automaticamente) e lista de perícias completa com checkbox de proficiência e checkbox de expertise; os **valores finais das perícias e salvaguardas são calculados automaticamente** pelo frontend: `modificador do atributo + (bônus de proficiência se proficiente) + (bônus de proficiência extra se expertise)`; **alteração de nível dispara recalculo em cascata** de todos os valores derivados; o usuário gerencia apenas os checkboxes; **todos os valores calculados exibem tooltip on hover com a memória de cálculo**; o usuário pode sobrescrever qualquer valor calculado manualmente
- **FR-021**: A seção de combate DEVE incluir: **Classe de Armadura** (calculada automaticamente: `10 + DEX mod` como base, editável manualmente), **Iniciativa** (calculada automaticamente: `DEX mod + bônus de proficiência se aplicável`, editável manualmente), Deslocamento, **Pontos de Vida máximos** (campo **manual** — o cálculo depende de decisões do jogador a cada nível), Pontos de Vida atuais, Pontos de Vida temporários, Dados de Vida (total e usados) e Testes de Morte (saves de sucesso/falha); **todos os valores calculados exibem tooltip on hover com a memória de cálculo**; **todos os campos de estado de sessão são persistidos no banco** com debounce 500ms e PATCH por campo
- **FR-021a**: A seção de combate DEVE ter um botão **"Descanso Longo"** que, ao ser acionado com confirmação, restaura automaticamente: HP atual ao valor máximo, todos os slots de magia ao total disponível e dados de vida usados a zero; a operação persiste todos os campos recuperados em uma única requisição PATCH
- **FR-022**: A percepção passiva DEVE ser **calculada automaticamente** (`10 + bônus de Percepção`) e exibir tooltip on hover com a memória de cálculo; editável manualmente pelo usuário
- **FR-023**: A seção de ataques DEVE permitir adicionar múltiplos ataques com: nome, bônus de ataque e dano/tipo
- **FR-024**: A seção de equipamentos DEVE exibir os itens com avatar, nome, quantidade e campo de notas; deve ter botão para adicionar item do catálogo ou manualmente
- **FR-024a**: A seção de equipamentos DEVE incluir uma sub-seção de **moedas** com cinco campos numéricos manuais: PC (Peças de Cobre), PP (Peças de Prata), PE (Peças de Electrum), PO (Peças de Ouro) e PL (Peças de Platina); cada campo DEVE exibir tooltip on hover com o equivalente em PO (PC = 0,01 PO; PP = 0,1 PO; PE = 0,5 PO; PO = 1 PO; PL = 10 PO); sem conversão automática entre denominações; todos os campos persistidos no banco com debounce 500ms
- **FR-025**: A seção de personalidade DEVE incluir: traços de personalidade, ideais, vínculos e falhas
- **FR-026**: A ficha DEVE ter **quatro seções distintas** para recursos do personagem, seguindo a ficha oficial D&D 2024:
  - **"Características de Classe"**: Traits com origem `class`; populada automaticamente ao selecionar classe do catálogo; permite adição manual via `GlassEntityChooser` de Traits
  - **"Características Raciais"**: Traits com origem `race`; populada automaticamente ao selecionar raça do catálogo; permite adição manual via `GlassEntityChooser` de Traits
  - **"Talentos"**: entidades Feat conquistadas; populadas via wizard de nível (Ability Score Improvement) ou adicionadas manualmente via `GlassEntityChooser` de Feats
  - **"Habilidades"**: todas as demais Traits (origem `background`, `manual` ou qualquer outra fonte); populada automaticamente ao selecionar origem do catálogo; permite adição manual via `GlassEntityChooser` de Traits
- **FR-027**: A seção de magias DEVE exibir: atributo de conjuração (selecionado automaticamente ao escolher classe do catálogo, editável manualmente), **CD de resistência** (calculada automaticamente: `8 + bônus de proficiência + modificador do atributo de conjuração`, com tooltip de memória de cálculo, editável manualmente), **bônus de ataque de magia** (calculado automaticamente: `bônus de proficiência + modificador do atributo de conjuração`, com tooltip, editável manualmente), slots de magia por nível (total e usados, ambos persistidos no banco) e a lista de magias com avatar (ou fallback genérico de magia), bônus de ataque/CD, componentes e botão para adicionar do catálogo
- **FR-027a**: A seção de combate/magias DEVE incluir um botão **"Descanso Longo"** que, ao ser acionado com confirmação, recupera automaticamente: HP atual para o valor máximo, todos os slots de magia para o total disponível e dados de vida gastos (metade do total, arredondado para baixo, conforme regra D&D 2024); todos os valores recuperados são persistidos no banco via PATCH
- **FR-028**: A seção de notas (verso da ficha) DEVE ter áreas de texto livre para anotações adicionais
- **FR-029**: A seção de aparência DEVE incluir: foto do personagem (**upload de arquivo** via serviço de storage existente na plataforma, sem suporte a URL externa), idade, altura, peso, olhos, pele, cabelo e aparência geral

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
- **CharacterTrait**: Representa uma característica do personagem (entidade Trait). Contém: referência opcional ao catálogo de Traits, nome e descrição textual, e **origem** (`class` | `race` | `background` | `manual`) para determinar em qual das quatro seções é exibida (class → "Características de Classe"; race → "Características Raciais"; demais → "Habilidades"). Pertence a uma CharacterSheet.
- **CharacterFeat**: Representa um talento (Feat) conquistado pelo personagem. Contém: referência opcional ao catálogo de Feats, nome e descrição textual, e nível em que foi adquirido. Pertence a uma CharacterSheet.
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

## Out of Scope

- Multiclasse (campo de texto livre como alternativa manual)
- Descanso Curto (usuário ajusta dados de vida e recursos parciais manualmente)
- Compartilhamento por convite / co-edição colaborativa
- Limite de fichas por usuário
- Histórico de versões ou auditoria de alterações na ficha
- Campo de XP (Pontos de Experiência) — a ficha não rastreia XP; progressão de nível é manual ou via wizard de nível

## Assumptions

- O catálogo de raças já possui os atributos de deslocamento, tamanho e lista de habilidades associadas necessários para o preenchimento automático
- O catálogo de classes já possui a tabela de progressão por nível com recursos, salvaguardas e proficiências para cada classe disponível
- O catálogo de origens (Backgrounds) possui proficiências e características vinculadas
- O catálogo de itens possui campo de imagem (URL) que pode ser null para itens sem imagem
- O catálogo de magias possui campo de imagem (URL) que pode ser null para magias sem imagem
- O upload de foto do personagem reutiliza o serviço de storage existente na plataforma
- A autenticação segue o padrão Clerk já implementado na plataforma
- A URL slug da ficha usa o formato `[id]-[nome-do-personagem-slug]`; se o nome estiver vazio, usa apenas o ID
- Multiclasse está fora do escopo desta entrega; o data model armazena uma única classe por ficha; a estrutura pode ser evoluída futuramente sem breaking change
