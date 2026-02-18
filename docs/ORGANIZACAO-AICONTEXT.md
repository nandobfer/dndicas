# Organização da Pasta aicontext

Este documento explica a estrutura e organização da documentação em `aicontext/`.

## 📋 Reorganização Realizada

### Arquivos Removidos (Redundantes)

- ❌ `api-guidelines.md` → Consolidado em `use-quando-desenvolver-api.md`
- ❌ `core-context.md` → Consolidado em `use-quando-desenvolver-no-modulo-core.md`
- ❌ `project-rules.md` → Consolidado em `use-sempre-que-desenvolver.md`

### Arquivos Renomeados

- `configuracao-clerk.md` → ✅ `use-para-configurar-clerk.md`

### Arquivos Movidos

- `aicontext/prompt/` → ✅ `docs/prompt-original/`

### Arquivos Criados

- ✅ `README.md` - Índice completo da documentação
- ✅ `use-diretrizes-do-projeto.md` - Consolidação de todas as diretrizes

## 📁 Estrutura Final

```
aicontext/
├── README.md                                      # Índice e guia de uso
├── use-sempre-que-desenvolver.md                 # Regras fundamentais
├── use-quando-desenvolver-api.md                 # Padrões de API
├── use-quando-desenvolver-no-modulo-core.md      # Manutenção do core
├── use-para-atualizar-tema-e-componentes-ui.md   # UI e tema
├── use-para-estender-o-core.md                   # Extensibilidade
├── use-para-configurar-clerk.md                  # Setup de autenticação
├── use-diretrizes-do-projeto.md                  # Decisões e lições
└── modules/
    └── organizations.md                           # Doc do módulo exemplo
```

## 🎯 Nomenclatura Padronizada

### Padrão "use-*"

Todos os arquivos seguem o padrão:
- `use-sempre-*` → Aplicado em **todos** os contextos
- `use-quando-*` → Aplicado em **contextos específicos**
- `use-para-*` → Aplicado para **tarefas específicas**

### Exemplos

| Arquivo | Quando Usar |
|---------|-------------|
| `use-sempre-que-desenvolver.md` | **Sempre**, antes de qualquer desenvolvimento |
| `use-quando-desenvolver-api.md` | **Quando** criar/modificar APIs |
| `use-para-configurar-clerk.md` | **Para** configurar autenticação |

## 📚 Conteúdo de Cada Arquivo

### use-sempre-que-desenvolver.md

**Conteúdo**:
- Conceito do core imutável
- Estrutura de pastas
- Nomenclatura de arquivos
- Serviços do core
- Princípios gerais

**Use quando**: Iniciar qualquer desenvolvimento

### use-quando-desenvolver-api.md

**Conteúdo**:
- Formato de resposta padronizado
- Códigos HTTP
- Validação com Zod
- Autenticação em APIs
- Paginação
- Documentação OpenAPI
- Exemplo completo de CRUD

**Use quando**: Criar ou modificar rotas de API

### use-quando-desenvolver-no-modulo-core.md

**Conteúdo**:
- Quando modificar o core
- Princípios do core
- Adicionando serviços
- Testando mudanças
- Versionamento

**Use quando**: Fazer manutenção no template (não nos projetos derivados)

### use-para-atualizar-tema-e-componentes-ui.md

**Conteúdo**:
- Sistema de temas (variáveis CSS)
- Customização de cores
- Componentes ShadCN
- Ícones
- Responsividade
- Dark mode

**Use quando**: Customizar aparência ou adicionar componentes

### use-para-estender-o-core.md

**Conteúdo**:
- Padrões de extensão
- Composição vs modificação
- Wrappers
- Exemplos práticos

**Use quando**: Precisar customizar comportamento do core

### use-para-configurar-clerk.md

**Conteúdo**:
- Setup do Clerk
- Variáveis de ambiente
- Configuração de rotas
- Roles e permissions
- Webhooks
- Troubleshooting

**Use quando**: Configurar autenticação ou resolver problemas de auth

### use-diretrizes-do-projeto.md

**Conteúdo**:
- Visão geral da arquitetura
- Decisões arquiteturais
- Problemas resolvidos
- Lições aprendidas
- Checklist de qualidade

**Use quando**: Entender decisões de design ou onboarding

## 🔄 Fluxo de Uso

### Para Desenvolvedores Humanos

1. **Início de projeto**: Leia `README.md` e `use-sempre-que-desenvolver.md`
2. **Durante desenvolvimento**: Consulte `use-quando-*` relevante
3. **Customização**: Use `use-para-*` específico
4. **Dúvidas arquiteturais**: Consulte `use-diretrizes-do-projeto.md`

### Para Agentes de IA

1. **Sempre carregue**: `use-sempre-que-desenvolver.md`
2. **Contexto específico**: Carregue `use-quando-*` ou `use-para-*` relevante
3. **Dúvidas**: Consulte `use-diretrizes-do-projeto.md`

## 📝 Adicionando Nova Documentação

### Para Novo Módulo

1. Crie arquivo em `aicontext/modules/[nome-modulo].md`
2. Use template:
   ```markdown
   # Módulo: [Nome]

   ## Objetivo
   ## Estrutura
   ## Schemas
   ## APIs
   ## Uso
   ```

### Para Nova Diretriz Geral

1. Avalie se se encaixa em arquivo existente
2. Se não, crie `use-[categoria]-[contexto].md`
3. Atualize `README.md` com referência

### Para Decisão Arquitetural

1. Adicione em `use-diretrizes-do-projeto.md`
2. Seção apropriada: Arquitetura, Segurança, etc.

## ✅ Benefícios da Organização

### 1. Clareza

✅ Nomenclatura consistente e previsível
✅ Um propósito por arquivo
✅ Fácil de encontrar informação

### 2. Manutenibilidade

✅ Sem redundância
✅ Informações consolidadas
✅ Fácil de atualizar

### 3. Usabilidade para IA

✅ Contexto claro pelo nome do arquivo
✅ Estrutura previsível
✅ Referências cruzadas

### 4. Documentação Como Código

✅ Versionada com o projeto
✅ Evolui com o código
✅ Mantida pela equipe

## 🎓 Princípios

### Context-Driven Development

> Fornecer o contexto certo, na hora certa, para o desenvolvedor (humano ou IA) certo.

### Single Responsibility

> Cada arquivo tem um propósito específico e bem definido.

### DRY (Don't Repeat Yourself)

> Informações não são duplicadas entre arquivos.

### Progressive Disclosure

> Informações básicas primeiro, detalhes conforme necessário.

## 📊 Antes vs Depois

### Antes

```
aicontext/
├── api-guidelines.md         (redundante)
├── configuracao-clerk.md     (nomenclatura inconsistente)
├── core-context.md           (redundante)
├── project-rules.md          (redundante)
├── prompt/                   (misturado com contexto)
└── use-*.md                  (apenas alguns arquivos)
```

### Depois

```
aicontext/
├── README.md                 (índice completo)
├── use-*.md                  (nomenclatura padronizada)
├── use-diretrizes-*.md       (consolidação)
└── modules/                  (docs de módulos)
```

## 🔍 Mapa de Migração

| Informação Antiga | Novo Local |
|-------------------|------------|
| api-guidelines.md | use-quando-desenvolver-api.md |
| core-context.md | use-quando-desenvolver-no-modulo-core.md |
| project-rules.md | use-sempre-que-desenvolver.md |
| configuracao-clerk.md | use-para-configurar-clerk.md |
| Decisões arquiteturais (espalhadas) | use-diretrizes-do-projeto.md |
| prompt/0-desenvolvimento.md | docs/prompt-original/ |

---

**Mantido por**: Equipe Dungeons & Dicas
**Data da reorganização**: 2026-01-27
