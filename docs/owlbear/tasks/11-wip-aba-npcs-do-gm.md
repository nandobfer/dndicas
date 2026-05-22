# Task 11 — WIP Aba de NPCs do GM

## Objetivo

Criar a etapa propria da aba `NPCs` do GM no Owlbear, promovendo o placeholder atual para uma experiencia inicial de cadastro e gerenciamento simplificado de NPCs da sala.

O nome desta task permanece com `WIP` porque o produto ainda deve detalhar melhor o comportamento final dessa aba.

## Contexto atual

Hoje a action do Owlbear ja expõe a aba `NPCs` para o GM, mas ainda com placeholder informando que o CRUD de NPCs locais permanece fora da etapa inicial.

Ao mesmo tempo, a spec ja aponta que o GM devera poder manter NPCs locais por `roomId`, e a task 10 passa a reservar um caminho de `contextMenu` para `Vincular a NPC`.

## Escopo funcional

### Entregaveis de produto

- A aba `NPCs` deixa de ser placeholder.
- O GM pode cadastrar NPCs locais da sala.
- O GM pode listar e gerenciar os NPCs ja criados.
- O formulario deve seguir o modelo visual de `src/features/character-sheets/components/sheet-form.tsx`, mas de forma mais simples.
- O fluxo deve ficar preparado para futura integracao com o vinculo de token e sincronizacao de HP.

### Entregaveis tecnicos

- Criar uma estrutura inicial de dados para NPC local por `roomId`.
- Definir um formulario simplificado inspirado na ficha de personagem, sem replicar todos os campos e blocos avancados.
- Criar o fluxo de listagem, criacao, edicao e remocao basica na aba do GM.
- Preparar contratos e tipos necessarios para o futuro uso no `contextMenu`.

## Pre-requisitos

- Etapas 1 e 3 da integracao Owlbear.
- Shell Owlbear com papel `GM` ja estabilizada.
- Task 10 desejavelmente encaminhada, para alinhar os contratos de `kind: "npc"` e a futura barra de vida.

## Mudancas esperadas por subsistema

### UI Owlbear

- Substituir o placeholder atual por uma tela real da aba `NPCs`.
- Criar listagem de NPCs locais da sala.
- Criar formulario simplificado para cadastro e edicao.
- Exibir estados de vazio, carregamento e erro.

### Modelagem e dados

- Definir o shape minimo do NPC local usado na aba.
- Persistir os NPCs locais por `roomId`.
- Garantir que o modelo seja compativel com uso futuro em vinculo de token e overlays.

### Backend / autorizacao

- Criar ou adaptar rotas Owlbear-aware para o CRUD de NPC local da sala.
- Restringir o acesso a usuarios com papel `GM`.
- Garantir que a sessao Owlbear-aware continue sendo a fonte de autorizacao dessas operacoes.

### Testes em `tests/owlbear`

- Testes frontend da aba `NPCs`.
- Testes backend das rotas por `roomId`.
- Testes dos mapeamentos entre formulario simplificado e modelo persistido.

## Proposta de simplificacao inicial

O formulario nao deve tentar reproduzir toda a ficha de personagem.

Baseline sugerido para esta etapa:

- nome;
- HP atual;
- HP maximo;
- classe de armadura ou campo defensivo equivalente;
- observacoes curtas;
- identificador persistente do NPC na sala.

Campos mais complexos, como ataques detalhados, magia, tracos ricos e editor completo de notas, ficam fora desta entrega `WIP` ate nova definicao de produto.

## Checklist de implementacao

1. Remover o placeholder atual da aba `NPCs`.
2. Criar a listagem de NPCs locais do GM.
3. Definir o modelo minimo do NPC local por `roomId`.
4. Criar formulario simplificado inspirado em `sheet-form.tsx`.
5. Implementar criacao de NPC.
6. Implementar edicao de NPC.
7. Implementar remocao de NPC.
8. Exibir estados vazios e mensagens de erro coerentes.
9. Garantir que os tipos e contratos fiquem preparados para uso futuro em `Vincular a NPC`.
10. Adicionar testes Owlbear da aba e das rotas correspondentes.

## Criterios de aceite

- O GM consegue abrir uma aba `NPCs` funcional, sem placeholder.
- O GM consegue cadastrar um NPC local da sala.
- O GM consegue editar e remover esse NPC.
- O formulario reaproveita o estilo da ficha atual, mas em versao simplificada.
- O modelo persistido fica escopado por `roomId`.
- O fluxo ja deixa clara a intencao de integracao futura com vinculo de token e barra de vida.

## Testes obrigatorios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no minimo:

- renderizacao da aba `NPCs` para GM;
- estado vazio sem NPCs cadastrados;
- criacao de NPC com payload valido;
- edicao de NPC existente;
- remocao de NPC;
- bloqueio de acesso para `PLAYER`;
- consistencia do modelo simplificado usado no formulario.

## Fora desta etapa

- Editor completo equivalente a `sheet-form.tsx`.
- Integracao final do NPC com token no mapa.
- Sincronizacao final da barra de vida de NPC no contexto do token.
- Regras avancadas de automacao, recuperacao de inconsistencias e migracoes de dados.
