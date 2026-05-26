# Task 02 - Formulario como Ficha de Monstro

## Objetivo

Transformar o modal de monstro em uma ficha de monstro consistente com `sheet-form`, mantendo os padroes visuais do catalogo.

## Mudancas esperadas

- Tipo, tamanho e alinhamento devem ser autocomplete de selecao unica.
- Campos numericos devem usar mascara e controles visuais equivalentes aos de ficha.
- Velocidades devem ser campos adicionaveis/removiveis, com `deslocamento` inicializado em `9m`.
- CR deve aceitar somente numeros e `/`.
- Atributos, salvaguardas e pericias devem seguir cores e interacoes da ficha de personagem.
- Pericias devem permitir override manual alem da derivacao por atributo e proficiencia.

## Checklist de implementacao

1. Substituir selects de classificacao por autocomplete single.
2. Criar campo numerico mascarado baseado em `SheetInput`.
3. Trocar velocidades fixas por blocos com botao de adicionar e icone de remover.
4. Tornar `speed` opcional no schema/modelo, pois deslocamento pode ser removido.
5. Criar bloco de atributos de monstro baseado no `AttributeBlock`.
6. Expor override em salvaguardas e pericias.
7. Garantir que XP e proficiencia continuem derivados de CR, com overrides opcionais.

## Criterios de aceite

- A ficha usa as mesmas cores de atributos da ficha de personagem.
- Remover deslocamento nao quebra validacao da API.
- Overrides de pericia alteram o valor calculado exibido.
- CR fracionario como `1/4` permanece valido.

## Testes obrigatorios

- Teste de submissao minima do modal.
- Teste de calculos de XP/proficiencia por CR.
- Checagem de tipos filtrada para `src/features/monsters`.
