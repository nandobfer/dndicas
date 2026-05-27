# Races

## Features

### Busca textual do catálogo de raças
O campo de busca da listagem de raças consulta apenas `name` e `originalName` em `GET /api/races`. A UI do filtro deixa isso explícito no placeholder e não considera mais descrição como critério da busca textual principal.

### Atualização automática de raças no seed
No seed de raças, o modo `--auto` ignora raças da fonte `XPHB` e resolve conflitos de raças existentes atualizando nome, descrição, traits e imagem com os dados recém-processados. Magias nunca são resolvidas no auto: as já vinculadas no banco são preservadas, inclusive nas variações/sub-raças correspondentes, e magias novas ficam vazias para evitar prompts. Traits em `--auto` preferem automaticamente a habilidade específica da raça no formato `Nome (Raça)`; se ela não existir, o seed cria essa variante específica sem abrir menu interativo. Com `--update-only`, o auto pula raças novas antes de criar traits ou qualquer dado auxiliar.

### Geração com IA por raça
Admins podem usar a ação `Gerar com IA` nos menus de raças da tabela, da lista em cards e da página genérica de detalhe. A ação abre uma modal genérica de geração de entidades (`EntityGenerationAIModal`) com adapter específico de raça, destaca nome e fonte da raça no painel de progresso, consome progresso real via Pusher no canal `entity-generation.<runId>`, dispara a geração por `POST /api/admin/entity-generation/races/[id]/generate`, usa o modelo `gemini-3.1-flash-lite`, gera candidatos 5etools com `GenAITranslator` e mostra comparação entre o estado atual e o candidato gerado, incluindo imagem e traits com nome e descrição. Mensagens de traits são agrupadas como `Gerando características` enquanto a barra segue o progresso real. Ao salvar em `/api/admin/entity-generation/races/[id]/apply`, a raça sobrescreve nome, descrição, imagem, fonte, traits, spells e variações pelo candidato selecionado; traits são atualizadas/criadas por nome exato `Trait (Raça)` e são persistidas no formato padrão de mention com `name: "Habilidade sem Nome"`, spells existentes são reutilizadas por `originalName`, e spells ausentes são criadas a partir do input traduzido ou como cadastro mínimo marcado para revisão.

### Infinite scroll nas tabelas de catálogo
As tabelas de raças usam `useInfiniteRaces`, a mesma fonte de dados do modo lista. O carregamento deixa de buscar um bloco fixo de 100 itens para tabela e passa a buscar páginas seguintes automaticamente pelo sentinel no fim da tabela.

### Identidade visual na primeira coluna da tabela
A tabela de raças usa a primeira coluna como célula de identidade: imagem da raça quando disponível, fallback com ícone de impressão digital, nome linkado e fonte em texto auxiliar. A coluna dedicada de status não é exibida nessa tabela.
