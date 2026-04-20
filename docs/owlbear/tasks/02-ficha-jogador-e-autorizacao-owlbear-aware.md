# Task 02 — Ficha do Jogador e Autorização Owlbear-aware

## Objetivo

Entregar a aba `Ficha` do jogador de ponta a ponta, incluindo:

- sessão Owlbear-aware;
- vínculo do jogador com uma ficha persistente via `room metadata`;
- fluxo inicial de seleção/criação de ficha;
- renderização do `SheetForm` no Owlbear em layout desktop-only.

## Escopo funcional

### Entregáveis de produto

- Ao abrir a aba `Ficha`, o jogador sem vínculo prévio escolhe ou cria sua ficha.
- O vínculo com a sala é salvo em `room metadata`.
- Nas aberturas seguintes, a ficha vinculada abre diretamente.
- A UI de confirmação segue o padrão da spec.
- O `SheetForm` funciona dentro do Owlbear sem cair para layout mobile.

### Entregáveis técnicos

- Endpoint de sessão Owlbear-aware.
- Camada de autorização contextual para operações de ficha no plugin.
- Utilitários de leitura/escrita de `room metadata`.
- Fluxo completo de primeiro acesso do jogador.
- Tratamento de inconsistência quando `sheetId` não existir mais.

## Pré-requisitos

- Etapa 1 implementada.
- Releitura da parte de:
  - `room metadata`
  - `Ficha` do jogador
  - autorização Owlbear-aware

## Mudanças esperadas por subsistema

### UI Owlbear

- Implementar a aba `Ficha` do jogador.
- Implementar o fluxo de seleção baseado em `my-sheets/page.tsx`.
- Reaproveitar confirmação inspirada em `delete-spell-dialog.tsx`.
- Forçar renderização desktop do `SheetForm` dentro do Owlbear.

### Integração SDK

- Leitura e atualização de `room metadata`.
- Reação ao vínculo existente ou ausente.

### Backend / autorização

- Criar `POST /api/owlbear/session`.
- Definir o formato da sessão curta Owlbear-aware.
- Permitir que o backend reconheça o contexto Owlbear nas rotas necessárias.
- Garantir que essa sessão não vire armazenamento do estado da mesa.

### Testes em `tests/owlbear`

- Testes backend da criação/validação da sessão Owlbear-aware.
- Testes frontend do fluxo inicial da aba `Ficha`.
- Testes do vínculo em `room metadata`.
- Testes do modo desktop-only do `SheetForm`.

## Checklist de implementação

1. Definir contrato da sessão Owlbear-aware.
2. Implementar `POST /api/owlbear/session`.
3. Criar utilitário/abstração para ler e escrever `room metadata`.
4. Detectar se o jogador já possui `playerLink` na sala.
5. Implementar tela de seleção de ficha existente.
6. Implementar criação de nova ficha com confirmação.
7. Persistir o vínculo em `room metadata`.
8. Renderizar `SheetForm` da ficha vinculada.
9. Adaptar o comportamento para nunca cair no layout mobile dentro do Owlbear.
10. Implementar recuperação de inconsistência para `sheetId` inexistente.
11. Adicionar testes Owlbear frontend e backend desta etapa.

## Critérios de aceite

- Jogador sem vínculo consegue selecionar ficha existente.
- Jogador sem vínculo consegue criar ficha nova e vinculá-la.
- O vínculo fica salvo na sala, não no backend de estado da mesa.
- Reabrir a aba `Ficha` mostra a ficha já vinculada.
- O `SheetForm` renderiza em layout desktop mesmo em iframe estreito.
- Se a ficha vinculada não existir, o fluxo volta para seleção de ficha.

## Testes obrigatórios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no mínimo:

- criação da sessão Owlbear-aware;
- rejeição de acesso sem sessão válida, quando aplicável;
- fluxo de seleção de ficha existente;
- fluxo de criação e vínculo de nova ficha;
- leitura/escrita de `room metadata`;
- fallback para seleção quando o `sheetId` não existe;
- garantia de layout desktop-only do formulário no Owlbear.

## Fora desta etapa

- Aba `Fichas` do GM.
- Desvínculo de ficha pelo GM.
- Context menu de vínculo com token.
- Overlays de HP.
- Valores clicáveis e rolagem.
- CRUD completo de NPCs.
