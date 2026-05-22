# Task 04 — Rolagens e Valores Clicáveis

## Objetivo

Entregar a camada de interação da ficha com rolagem, tornando certos valores clicáveis dentro do Owlbear conforme a spec.

## Escopo funcional

### Entregáveis de produto

- Valores suportados da ficha exibem affordance visual de interação.
- Clique em valores suportados dispara tentativa de rolagem via integração oficial do Owlbear.
- Quando a integração oficial não estiver disponível, a UI mostra estado desabilitado e explicação adequada.

### Entregáveis técnicos

- Componentes/hooks para valores roláveis.
- Derivação estruturada de fórmulas para:
  - iniciativa;
  - perícias suportadas;
  - ataque seguro;
  - dano seguro.
- Integração condicionada à existência de interface pública estável da extensão oficial de dados.

## Pré-requisitos

- Etapa 2 implementada, porque a ficha do jogador já precisa existir.
- Idealmente etapa 3 implementada, para compartilhar componentes e contexto da ficha dentro da extensão.
- Releitura da seção de rolagem na spec.

## Mudanças esperadas por subsistema

### UI Owlbear

- Adicionar affordance visual consistente para campos roláveis.
- Exibir tooltips ou labels de acessibilidade quando necessário.
- Exibir estado disabled quando a integração oficial não estiver disponível.

### Integração SDK / Dados

- Criar adaptador para a integração oficial de rolagem, se a interface pública estiver disponível.
- Não implementar fallback de rolagem própria nesta v1.

### Lógica de domínio

- Criar derivadores de fórmula por tipo de valor.
- Não fazer parsing genérico de qualquer texto livre da ficha.
- Limitar a v1 aos campos com derivação segura.

### Testes em `tests/owlbear`

- Testes dos derivadores de fórmula.
- Testes dos componentes clicáveis.
- Testes dos estados enabled/disabled.
- Testes do adaptador de integração oficial, com mocks.

## Checklist de implementação

1. Identificar os pontos da ficha que serão clicáveis na v1.
2. Criar modelo estruturado para uma ação de rolagem.
3. Implementar derivadores para iniciativa e perícias.
4. Implementar derivadores seguros para ataque e dano.
5. Criar componentes/hooks de valor rolável.
6. Integrar esses componentes na ficha renderizada no Owlbear.
7. Criar adaptador para integração oficial de rolagem.
8. Implementar estado disabled quando a integração não estiver disponível.
9. Adicionar testes Owlbear para derivação e comportamento visual.

## Critérios de aceite

- Iniciativa pode ser clicada e deriva fórmula correta.
- Pelo menos uma classe de perícias suportadas pode ser clicada e deriva fórmula correta.
- Ataque e dano só ficam clicáveis quando a fórmula for segura.
- Sem integração oficial disponível, a UI não tenta rolar e informa o motivo.
- A implementação não introduz parsing genérico inseguro de texto livre.

## Testes obrigatórios

Os testes desta etapa devem ficar em `tests/owlbear` e cobrir, no mínimo:

- derivação de fórmula de iniciativa;
- derivação de fórmula de perícia;
- habilitação e desabilitação de campos roláveis;
- clique em valor suportado chamando o adaptador correto;
- comportamento quando a integração oficial não estiver disponível.

## Fora desta etapa

- CRUD completo de NPCs.
- Rolagens a partir de texto livre arbitrário.
- Fallback de rolagem própria fora da integração oficial.
