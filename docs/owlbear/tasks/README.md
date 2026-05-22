# Tasks da Integração Owlbear

Este diretório organiza a implementação da integração com o Owlbear Rodeo em etapas executáveis de ponta a ponta por uma única execução de IA.

## Ordem recomendada

1. `01-extensao-shell-e-catalogo.md`
2. `02-ficha-jogador-e-autorizacao-owlbear-aware.md`
3. `03-fichas-gm-vinculo-token-e-overlays.md`
4. `04-rolagens-e-valores-clicaveis.md`
5. `05-action-tamanho-fixo.md`
6. `06-console-player-id-mapping.md`
7. `07-dice-panel-layout.md`
8. `08-owlbear-dados-historico-ui.md`
9. `09-vinculo-ficha-jogador-mongodb.md`
10. `10-context-menu-vinculo-personagem-npc-e-barras-de-vida.md`
11. `11-wip-aba-npcs-do-gm.md`

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
- As etapas 5 e 6 dependem da shell e do console Owlbear existentes.
- As etapas 7 e 8 dependem da aba `Dados` da etapa 4.
- A etapa 9 depende dos fluxos de ficha das etapas 2 e 3.
- A etapa 10 evolui o baseline da etapa 3 e deve considerar a direção de persistência da etapa 9.
- A etapa 11 promove o trabalho inicial de NPCs locais e deve alinhar seu modelo com a etapa 10.

## Fora do pacote principal

As tasks 10 e 11 promovem parte do planejamento que antes estava apenas como pendência.

Atualmente, o principal item ainda fora do pacote executável é:

- o refinamento completo do domínio de NPCs locais após a entrega inicial da aba `NPCs` e do vínculo placeholder no `contextMenu`.

Esse restante deve permanecer em `planejamento-pendente.md` até ser promovido para novas etapas próprias.
