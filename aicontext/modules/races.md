# Races

## Features

### Atualização automática de raças no seed
No seed de raças, o modo `--auto` ignora raças da fonte `XPHB` e resolve conflitos de raças existentes atualizando nome, descrição, traits e imagem com os dados recém-processados. Magias nunca são resolvidas no auto: as já vinculadas no banco são preservadas, inclusive nas variações/sub-raças correspondentes, e magias novas ficam vazias para evitar prompts. Traits em `--auto` preferem automaticamente a habilidade específica da raça no formato `Nome (Raça)`; se ela não existir, o seed cria essa variante específica sem abrir menu interativo. Com `--update-only`, o auto pula raças novas antes de criar traits ou qualquer dado auxiliar.

### Infinite scroll nas tabelas de catálogo
As tabelas de raças usam `useInfiniteRaces`, a mesma fonte de dados do modo lista. O carregamento deixa de buscar um bloco fixo de 100 itens para tabela e passa a buscar páginas seguintes automaticamente pelo sentinel no fim da tabela.

### Identidade visual na primeira coluna da tabela
A tabela de raças usa a primeira coluna como célula de identidade: imagem da raça quando disponível, fallback com ícone de impressão digital, nome linkado e fonte em texto auxiliar. A coluna dedicada de status não é exibida nessa tabela.
