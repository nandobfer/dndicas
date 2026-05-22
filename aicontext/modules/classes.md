# Classes

## Features

### Seed provider de classes base
O seed-data possui um `ClassesProvider` para importar classes base de D&D a partir de `src/lib/5etools-data/classes/class-*.json`, usando os arquivos `fluff-class-*.json` do mesmo diretório para descrição narrativa e imagem.

O provider:
- agrega todos os arquivos `class-*.json` e ignora arquivos de fluff durante a leitura mecânica;
- pula classes com `reprintedAs`, mantendo a mesma política usada em raças;
- pula entradas sem mecânicas obrigatórias para o schema atual, como dado de vida ou dois testes de resistência;
- traduz nome, descrição de fluff e features antes da revisão interativa;
- mapeia dado de vida, atributos, proficiências, perícias, conjuração e fonte para o formato de `CharacterClass`;
- importa apenas classes base nesta versão, deixando `subclasses` vazio;
- resolve features de classe em documentos `Trait` depois da revisão e grava as traits da classe como mentions HTML para `Habilidade`.

As imagens de fluff internas são armazenadas como URLs `https://5e.tools/img/{path}`. Features são localizadas a partir das referências de `classFeatures` e preservam o nome original em inglês para busca/criação de `Trait`.
