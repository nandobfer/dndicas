# Documentação de Contexto para IA

Esta pasta contém documentação estruturada para desenvolvimento assistido por inteligência artificial no Dungeons & Dicas.

## 📋 Índice de Arquivos

### Diretrizes Gerais

**[use-sempre-que-desenvolver.md](./use-sempre-que-desenvolver.md)**
- Regras e princípios fundamentais do projeto
- Conceito do core imutável
- Nomenclatura e estrutura de arquivos
- Serviços disponíveis no core
- Boas práticas gerais

### Desenvolvimento de APIs

**[use-quando-desenvolver-api.md](./use-quando-desenvolver-api.md)**
- Padrões de resposta (ApiResponse, PaginatedResponse)
- Códigos HTTP corretos
- Validação com Zod
- Autenticação em APIs
- Paginação e documentação OpenAPI
- Exemplo completo de CRUD

### Desenvolvimento no Core

**[use-quando-desenvolver-no-modulo-core.md](./use-quando-desenvolver-no-modulo-core.md)**
- **IMPORTANTE**: Apenas para manutenção do template
- Quando e como modificar o core
- Princípios do core
- Adicionando novos serviços
- Versionamento e testes

### Customização de UI e Tema

**[use-para-atualizar-tema-e-componentes-ui.md](./use-para-atualizar-tema-e-componentes-ui.md)**
- Sistema de temas (cores, variáveis CSS)
- Componentes ShadCN disponíveis
- Como adicionar novos componentes
- Ícones (Lucide React)
- Responsividade e animações
- Dark mode

**[use-componentes-ui.md](./use-componentes-ui.md)**
- **Biblioteca completa de componentes do core**
- Referência de todos os componentes (Button, Input, Badge, Alert, etc.)
- Exemplos de uso e padrões
- Componentes para sistemas empresariais
- Acessibilidade e boas práticas
- Página de demonstração interativa: `/ui-components`

### Extensão do Core

**[use-para-estender-o-core.md](./use-para-estender-o-core.md)**
- **CRÍTICO**: Como estender sem modificar
- Padrões de composição
- Wrappers e extensões
- Exemplos práticos de extensão
- Componentes, serviços, hooks, types

### Configuração do Clerk

**[use-para-configurar-clerk.md](./use-para-configurar-clerk.md)**
- Setup completo do Clerk
- Variáveis de ambiente necessárias
- Configuração de rotas públicas/protegidas
- Roles e permissions
- Webhooks
- Troubleshooting de autenticação

### Diretrizes e Decisões Arquiteturais

**[use-diretrizes-do-projeto.md](./use-diretrizes-do-projeto.md)**
- Visão geral da arquitetura do projeto
- Decisões técnicas e suas motivações
- Problemas comuns e soluções aplicadas
- Lições aprendidas durante o desenvolvimento
- Checklist de qualidade e boas práticas
- Trade-offs e alternativas consideradas

## 📁 Subpastas

### modules/
Documentação de módulos específicos do projeto.

Arquivos:
- **[organizations.md](./modules/organizations.md)**: CRUD de empresas, filiais e clientes (módulo exemplo)

Para cada novo módulo em `src/features/`, crie documentação aqui.

## 🎯 Como Usar Esta Documentação

### Para Desenvolvedores Humanos

1. **Iniciando no projeto**: Leia `use-sempre-que-desenvolver.md`
2. **Desenvolvendo APIs**: Consulte `use-quando-desenvolver-api.md`
3. **Customizando UI**: Veja `use-para-atualizar-tema-e-componentes-ui.md`
4. **Criando features**: Use `use-para-estender-o-core.md`
5. **Configurando auth**: Siga `use-para-configurar-clerk.md`

### Para Agentes de IA

Estes arquivos foram criados para fornecer contexto estruturado:

- **Sempre carregue** `use-sempre-que-desenvolver.md` antes de qualquer desenvolvimento
- **Quando criar APIs**, consulte `use-quando-desenvolver-api.md`
- **Quando customizar UI**, consulte `use-para-atualizar-tema-e-componentes-ui.md`
- **Quando estender funcionalidades**, consulte `use-para-estender-o-core.md`
- **Quando trabalhar com autenticação**, consulte `use-para-configurar-clerk.md`
- **NUNCA modifique** arquivos em `src/core/` sem consultar `use-quando-desenvolver-no-modulo-core.md`

## 🔑 Princípios-Chave

### 1. Core Imutável
O `src/core/` NÃO deve ser modificado nos projetos derivados. Use extensão e composição.

### 2. Documentação por Contexto
Cada arquivo "use-*" fornece diretrizes específicas para um contexto de desenvolvimento.

### 3. Padrões Consistentes
- Types padronizados (`@/core/types`)
- APIs com formato unificado
- Componentes baseados em ShadCN
- Hooks reutilizáveis

### 4. Extensibilidade
Tudo pode ser estendido sem modificar o core através de wrappers e composição.

## 📦 Estrutura do Projeto

```
dungeons-and-dicas/
├── aicontext/                  # Você está aqui
│   ├── README.md              # Este arquivo
│   ├── use-sempre-que-desenvolver.md
│   ├── use-quando-desenvolver-api.md
│   ├── use-quando-desenvolver-no-modulo-core.md
│   ├── use-para-atualizar-tema-e-componentes-ui.md
│   ├── use-para-estender-o-core.md
│   ├── use-para-configurar-clerk.md
│   └── modules/
│       └── organizations.md
├── src/
│   ├── core/                  # NÃO MODIFICAR
│   ├── features/              # Seus módulos aqui
│   └── app/                   # Rotas Next.js
├── docs/                      # Documentação geral
└── README.md                  # Documentação principal
```

## 🆕 Adicionando Nova Documentação

### Para Novo Módulo

Crie arquivo em `aicontext/modules/[nome-modulo].md` com:

```markdown
# Módulo: [Nome]

## Objetivo
[Descrição do módulo]

## Estrutura
[Estrutura de arquivos]

## Schemas
[Schemas do banco]

## APIs
[Endpoints disponíveis]

## Uso
[Exemplos de uso]
```

### Para Nova Diretriz

Se criar novo padrão que deve ser seguido:

1. Avalie em qual arquivo existente se encaixa
2. Se não se encaixar, crie novo arquivo `use-[quando/para]-[contexto].md`
3. Atualize este README.md com referência

## 📝 Convenções de Nomenclatura

- `use-sempre-*`: Diretrizes aplicadas **sempre**
- `use-quando-*`: Diretrizes para **contextos específicos**
- `use-para-*`: Diretrizes para **tarefas específicas**
- `modules/*`: Documentação de **módulos/features**

## 🔄 Atualização da Documentação

Esta documentação deve ser atualizada quando:

- ✅ Novos padrões forem estabelecidos
- ✅ Novos serviços forem adicionados ao core
- ✅ Novos módulos forem criados
- ✅ Mudanças arquiteturais significativas
- ❌ Mudanças de implementação sem impacto arquitetural

## 💡 Dicas

1. **Para IAs**: Sempre leia o arquivo "use-*" relevante antes de gerar código
2. **Para humanos**: Use os arquivos como referência rápida e checklist
3. **Para manutenção**: Mantenha arquivos concisos e focados
4. **Para exemplos**: Veja `src/features/organizations/` como referência prática

## 🎓 Filosofia

Esta documentação segue o princípio de **"Context-Driven Development"**:

> Fornecer o contexto certo, na hora certa, para o desenvolvedor (humano ou IA) certo.

Cada arquivo é autocontido mas referencia outros quando necessário.

---

**Mantido por**: Equipe Dungeons & Dicas
**Última atualização**: 2026-01-27
