# Task 01 — Extensão, Shell e Catálogo

## Objetivo

Entregar a base funcional da extensão Owlbear:

- manifest e configuração inicial da extensão;
- bootstrap do SDK Owlbear;
- shell da action `dndicas`;
- navegação por abas conforme papel do jogador;
- aba `Catálogo` implementada de ponta a ponta dentro do Owlbear.

Esta etapa deve produzir uma extensão utilizável, mesmo sem as abas de ficha já completas.

## Escopo funcional

### Entregáveis de produto

- A extensão carrega corretamente dentro do Owlbear.
- A action `dndicas` aparece e abre um popover funcional.
- O plugin identifica `GM` e `PLAYER` via SDK.
- As abas exibidas respeitam o papel:
  - `GM`: `Fichas`, `NPCs`, `Catálogo`
  - `PLAYER`: `Ficha`, `Catálogo`
- A aba `Catálogo` funciona dentro da extensão conforme a spec.

### Entregáveis técnicos

- Estrutura inicial da extensão e entrypoint Owlbear.
- Adaptador mínimo para acesso a `OBR.action`, `OBR.player`, `OBR.room` e tema.
- Shell reutilizável do plugin com role gating.
- Ajuste de tamanho do popover por aba.
- Adaptação do catálogo para uso embutido, sem FAB.

## Pré-requisitos

- Ler `docs/owlbear/dndicas-plugin-spec.md`.
- Ler `docs/owlbear/owlbear_full.md`, especialmente:
  - `OBR.action`
  - `OBR.player.getRole()`
  - `OBR.room.id`

## Mudanças esperadas por subsistema

### UI Owlbear

- Criar a shell visual da extensão com tabs internas.
- Exibir placeholder explícito para `Ficha`, `Fichas` e `NPCs` até as próximas etapas.
- Implementar a aba `Catálogo` com UX equivalente à busca global já existente.

### Integração SDK

- Inicializar o SDK no ambiente da extensão.
- Ler `roomId`, `playerId` e `role`.
- Configurar `OBR.action.setWidth/Height` conforme a aba ativa.

### Código de aplicação

- Isolar componentes Owlbear em uma área própria da aplicação.
- Criar adaptadores para evitar acoplamento direto do restante da UI ao SDK.
- Reaproveitar o máximo possível da busca global existente sem manter comportamento de FAB.

### Testes em `tests/owlbear`

- Testes de renderização da shell.
- Testes de role gating das abas.
- Testes do adaptador de bootstrap Owlbear.
- Testes da aba `Catálogo` embutida.

## Checklist de implementação

1. Definir a estrutura da extensão e seu entrypoint.
2. Criar o manifest/configuração da extensão Owlbear.
3. Criar bootstrap do SDK com leitura de role e room.
4. Implementar shell da action `dndicas`.
5. Implementar tabs internas com exibição condicional por papel.
6. Ajustar largura/altura do popover por aba ativa.
7. Adaptar o catálogo existente para renderização embutida.
8. Criar placeholders estáveis para as abas ainda não implementadas.
9. Adicionar testes Owlbear para shell, bootstrap e catálogo.

## Critérios de aceite

- A extensão abre sem erro no Owlbear.
- O papel do usuário altera corretamente as abas visíveis.
- O catálogo funciona dentro do popover sem FAB flutuante.
- O tamanho do popover muda de forma consistente ao alternar abas.
- Não há dependência das próximas etapas para usar a shell e o catálogo.

## Testes obrigatórios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no mínimo:

- renderização da shell para `GM`;
- renderização da shell para `PLAYER`;
- visibilidade correta das tabs por papel;
- comportamento do catálogo embutido;
- ajuste de width/height quando a aba ativa muda;
- fallback estável quando o SDK ainda não estiver pronto.

## Fora desta etapa

- Sessão Owlbear-aware no backend.
- Fluxo da ficha do jogador.
- Fichas do mestre.
- Context menu de vínculo.
- Overlays de HP.
- Valores clicáveis e rolagem.
- CRUD completo de NPCs.
