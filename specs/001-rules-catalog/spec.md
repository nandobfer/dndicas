# Feature Specification: Regras (Reference Catalog)

**Feature Branch**: `001-rules-catalog`  
**Created**: 2026-02-20  
**Status**: Draft  
**Input**: User description: "Create a catalog of rules (references) for D&D, including CRUD operations, a rich text editor component based on GlassInput, audit logging, and dashboard integration."

## User Scenarios & Testing *(mandatory)*

### P1: Gerenciamento de Regras (CRUD)
**Actor**: Administrador  
**Goal**: Criar, editar e excluir regras do sistema para manter o catálogo atualizado.  
**Preconditions**: Administrador autenticado no sistema.

**Scenario**:
1. O administrador acessa a página de Regras.
2. Clica no botão "Nova Regra".
3. Preenche o formulário com Nome, Descrição e Fonte.
4. Salva a regra.
5. A regra aparece na listagem com status "Ativo".
6. O administrador edita a regra, alterando a descrição e adicionando uma imagem.
7. O administrador exclui uma regra existente.

**Acceptance Criteria**:
- A regra é criada e listada corretamente.
- A descrição suporta formatação (negrito, itálico) e colagem de imagens.
- A exclusão remove a regra da listagem principal ou a marca como inativa.
- Edições são salvas e refletidas imediatamente.

### P2: Busca e Filtragem
**Actor**: Administrador  
**Goal**: Encontrar regras específicas rapidamente.  
**Preconditions**: Existem regras cadastradas.

**Scenario**:
1. O administrador acessa a página de Regras.
2. Utiliza a busca para encontrar regras por Nome.
3. Utiliza o filtro de Status para ver regras "Inativas".
4. (Edge Case) Busca por termo inexistente retorna lista vazia com mensagem apropriada.

**Acceptance Criteria**:
- Busca retorna resultados relevantes.
- Filtros funcionam conforme esperado.
- Mensagem de "Nenhum resultado" exibida quando apropriado.

### P3: Dashboard de Regras
**Actor**: Administrador/Usuário  
**Goal**: Visualizar estatísticas sobre o catálogo de regras.  
**Preconditions**: Acesso ao Dashboard.

**Scenario**:
1. O usuário acessa o Dashboard.
2. Vê o card de "Regras" com totalizador e gráfico de atividade recente.
3. O item "Regras" não aparece mais na lista de "Em Breve" (WIP).

**Acceptance Criteria**:
- Card de Regras exibe dados corretos.
- Item foi removido da lista WIP.
- Gráfico exibe atividade recente coerente com audit logs ou datas de criação.

## Functional Requirements *(mandatory)*

### FR-01: Gestão de Regras (Reference Management)
O sistema deve permitir gerenciar o ciclo de vida completo de uma Regra (chamada internamente de `Reference`), incluindo:
- **Criação**: Nome, Descrição (Texto Rico), Fonte (Ex: Livro/Página), Status (Ativo/Inativo).
- **Edição**: Alterar qualquer campo existente.
- **Exclusão**: Remoção lógica ou física do registro.
- **Leitura**: Visualização detalhada da regra.

### FR-02: Editor de Texto Rico (Rich Text Editor)
O sistema deve disponibilizar um componente de edição de texto que suporte:
- Formatação básica (Negrito, Itálico).
- Inserção de imagens via Área de Transferência (Cola).
- Visual e comportamento integrados ao sistema de design (Glassmorphism).

### FR-03: Listagem e Visualização
A interface de listagem deve prover:
- Tabela com colunas para Status, Nome, Resumo da Descrição, Fonte e Ações.
- Paginação para grandes volumes de dados.
- Mecanismo de busca textual e filtragem por status.
- Feedback visual de carregamento e estados vazios.

### FR-04: Rastreabilidade (Auditoria)
Todas as modificações nas regras (criação, edição, exclusão) devem ser registradas no sistema de auditoria existente, identificando o autor, a ação e o registro afetado.

### FR-05: Painel de Controle (Dashboard)
O painel principal deve refletir a disponibilidade do módulo de Regras:
- Exibir estatísticas de volume e atividade de regras.
- Remover indicativos de funcionalidade em desenvolvimento para este módulo.

## Success Criteria *(mandatory)*

- **Produtividade**: Tempo médio de criação de regra completa < 2 minutos.
- **Adoção Visual**: O novo editor de texto rico não deve quebrar a consistência visual da aplicação.
- **Precisão**: A contagem de regras no Dashboard deve ter 100% de acurácia em relação ao banco de dados.
- **Auditabilidade**: 100% das alterações geram log de auditoria.

## Key Entities & Data *(optional)*

### Reference (Rule)
- **Nome**: Identificador principal.
- **Descrição**: Conteúdo formatado (HTML/Rich Text).
- **Fonte**: Origem da regra (Livro/Página).
- **Status**: Estado atual (Ativo/Inativo).

## Dependencies & Assumptions *(optional)*

- **Dependência**: Reutilização da estrutura de UI/UX existente (Cards, Inputs, Tabelas).
- **Assumption**: O armazenamento de imagens coladas será feito inicialmente via Base64 ou URL externa se o editor suportar upload, mas o requisito principal é "colar e ver".
