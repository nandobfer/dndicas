# Classes

## Features

### Preview de subclasses com habilidades e magias próprias
O `SubclassPreview` exibe, logo abaixo da descrição, as mesmas seções expansíveis de habilidades por nível e de magias usadas no preview de classes, inclusive quando a subclasse é renderizada de forma embutida dentro de `ClassPreview`.

Essas listas usam exclusivamente os dados da própria subclasse selecionada (`subclass.traits` e `subclass.spells`), sem misturar habilidades ou magias da classe base. A seção de magias só aparece quando a subclasse possui conjuração habilitada.

### Seed provider de classes e subclasses
O seed-data possui um `ClassesProvider` para importar classes base e subclasses de D&D a partir de `src/lib/5etools-data/classes/class-*.json`, usando os arquivos `fluff-class-*.json` do mesmo diretório para descrição narrativa e imagem.

O provider:
- agrega todos os arquivos `class-*.json` e ignora arquivos de fluff durante a leitura mecânica;
- pula classes com `reprintedAs`, mantendo a mesma política usada em raças;
- pula entradas sem mecânicas obrigatórias para o schema atual, como dado de vida ou dois testes de resistência;
- traduz nome e descrição de fluff antes da revisão interativa;
- mantém `traits: []` e `subclasses: []` na revisão inicial e guarda features/subclasses em estado transitório interno;
- mostra a tabela de progressão de forma compacta no resumo interativo, exibindo só nomes de colunas persistidas, e omite `spells` do JSON;
- ignora `spells` da classe e das subclasses na comparação de conflitos, pois spells são resolvidas pelo fluxo dedicado;
- salva ou atualiza a classe base logo após a primeira revisão, antes de abrir o menu de resolução de features, spells e subclasses;
- sempre abre um menu pós-revisão para resolver features, spells, subclasses, tudo ou avançar para a próxima classe;
- traduz e resolve cada feature individualmente depois da confirmação inicial, revisando Traits novos antes de avançar para a próxima e atualizando a classe já persistida a cada feature aprovada;
- mapeia dado de vida, atributos, proficiências, perícias, conjuração, fonte e tabela de progressão para o formato de `CharacterClass`;
- importa subclasses com `subclassFeatures`, deduplicando PHB/XPHB e preferindo XPHB quando existir;
- revisa a base de cada subclasse antes de persistir, usando `subclassFluff.entries` como descrição quando houver texto e caindo para a `subclassFeature` homônima da subclasse quando o fluff vier vazio;
- trata a `subclassFeature` com o mesmo nome da subclasse como bloco introdutório, não como `Trait` separado;
- quando essa feature introdutória contém `refSubclassFeature`, expande essas referências internas para preservar as habilidades mecânicas reais de nível 3 da subclasse;
- também compõe inline `refSubclassFeature` de features compostas no mesmo nível/subclasse, para que opções internas como `Armor Model` tragam o conteúdo dos seus modelos sem gerar traits extras para cada opção;
- depois resolve features e spells restantes da subclasse no mesmo fluxo;
- marca a subclasse como conjuradora quando ela já nasce com suporte mecânico de spellcasting ou quando o resolvedor persiste magias em `subclass.spells`, para manter a aba de subclasse coerente no form;
- ao atualizar classes ou subclasses já existentes, preserva `traits`, `spells` e subclasses já persistidas durante o review base e só altera esses arrays via merge incremental explícito nas etapas de resolução;
- resolve features de classe em documentos `Trait` depois da revisão e grava as traits da classe como mentions HTML para `Habilidade`.

### Normalização do form de edição
O `ClassFormModal` normaliza `traits` da classe e das subclasses antes de popular o `react-hook-form`, descartando entradas nulas ou malformadas e preservando apenas objetos com `{ level, description, _id? }`. Isso evita que classes importadas cheguem ao editor com arrays esparsos ou shapes incompatíveis e dispararem erro de validação em `subclasses[n].traits[m]`.

As imagens de fluff internas são armazenadas como URLs `https://5e.tools/img/{path}`. Features são localizadas a partir das referências de `classFeatures` e `subclassFeatures`, preservam o nome original em inglês para busca/criação de `Trait` e exibem progresso individual durante a tradução pós-revisão. A tabela de progressão é construída a partir de `classTableGroups`/`subclassTableGroups` e persiste apenas `spellSlots` e `customColumns`, deixando nível, bônus de proficiência e features por nível como dados derivados da UI. Labels conhecidos de colunas são traduzidos por mapa local; labels desconhecidos usam tradução como fallback. Após cada resolução, o menu pós-revisão volta a aparecer e o provider só avança para a próxima classe quando o usuário seleciona essa opção. Spells de classe vêm de `spell-sources.json`; spells de subclasse usam primeiro `additionalSpells` do JSON da própria subclasse e podem ser complementadas por vínculos `subclass` em `spell-sources.json`, com deduplicação antes de persistir. Quando a subclasse termina com magias persistidas, o provider também promove `spellcasting` para `true` mesmo que a origem 5etools não tenha preenchido `casterProgression`/`spellcastingAbility`. Para subclass features compostas, o provider expande `refSubclassFeature` do mesmo nível como composição inline da descrição persistida, em vez de quebrar cada opção em traits independentes. Em updates, o provider trata o resumo inicial como estado transitório de review e faz merge conservador antes de persistir, para nunca zerar `traits`, `spells` ou subclasses já existentes por causa de arrays vazios temporários. A revisão de traits e subclasses novas reutiliza o renderer da revisão principal, mostrando o JSON formatado e o bloco original em inglês para comparação. O estado transitório das features/subclasses não é persistido no MongoDB.
