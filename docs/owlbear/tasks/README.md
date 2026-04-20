# Tasks da Integração Owlbear

Este diretório organiza a implementação da integração com o Owlbear Rodeo em etapas executáveis de ponta a ponta por uma única execução de IA.

## Ordem recomendada

1. `01-extensao-shell-e-catalogo.md`
2. `02-ficha-jogador-e-autorizacao-owlbear-aware.md`
3. `03-fichas-gm-vinculo-token-e-overlays.md`
4. `04-rolagens-e-valores-clicaveis.md`

Itens deliberadamente fora do pacote principal ficam em:

- `planejamento-pendente.md`

## Convenções

- Cada arquivo representa uma entrega completa e autocontida.
- Cada etapa deve poder ser implementada sem abrir novas decisões de produto ou arquitetura.
- Toda cobertura de testes desta integração deve ficar em `tests/owlbear`, separada do restante da suíte.
- Quando útil, a implementação pode subdividir os testes em:
  - `tests/owlbear/frontend`
  - `tests/owlbear/backend`
  - `tests/owlbear/utils`

## Dependências entre etapas

- A etapa 1 cria a base da extensão e a shell comum.
- A etapa 2 depende da etapa 1.
- A etapa 3 depende das etapas 1 e 2.
- A etapa 4 depende da etapa 2 e, idealmente, da etapa 3 já estabilizada.

## Fora do pacote principal

Atualmente, o principal item fora das quatro etapas é:

- CRUD completo de NPCs locais e tudo que depende dele.

Esse trabalho deve permanecer em `planejamento-pendente.md` até ser promovido para uma etapa própria.
