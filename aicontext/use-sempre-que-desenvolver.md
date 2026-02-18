# Use Sempre Que Desenvolver

Este arquivo contém diretrizes gerais que devem ser seguidas em TODOS os desenvolvimentos no Dungeons & Dicas.

## 📚 Índice de Documentação (Para Agentes de IA)

Consulte estes arquivos específicos conforme o contexto da tarefa:

### Documentação Principal
- **[README.md](./README.md)** - Índice completo e guia de uso de toda a documentação

### Contextos Específicos

#### Quando desenvolver APIs
- **[use-quando-desenvolver-api.md](./use-quando-desenvolver-api.md)**
  - Formato de resposta padronizado (`ApiResponse<T>`, `PaginatedResponse<T>`)
  - Códigos HTTP e tratamento de erros
  - Validação com Zod
  - Autenticação em rotas de API
  - Paginação e filtros
  - Documentação OpenAPI
  - Exemplo completo de CRUD

#### Quando customizar UI/Tema
- **[use-para-atualizar-tema-e-componentes-ui.md](./use-para-atualizar-tema-e-componentes-ui.md)**
  - Sistema de temas e variáveis CSS
  - Customização de cores e tipografia
  - Adicionar/modificar componentes ShadCN
  - Ícones (Lucide)
  - Dark mode
  - Responsividade

#### Quando usar componentes de interface
- **[use-componentes-ui.md](./use-componentes-ui.md)**
  - Biblioteca completa de componentes do core
  - Button, Input, Select, Badge, Alert, Progress, Skeleton, etc.
  - Exemplos de uso e combinações
  - Padrões de acessibilidade
  - Página de demonstração: `/ui-components`

#### Quando estender funcionalidades do Core
- **[use-para-estender-o-core.md](./use-para-estender-o-core.md)**
  - Padrões de extensão (composição vs modificação)
  - Criar wrappers de componentes
  - Estender serviços (AI, Storage, Email)
  - Adicionar middlewares customizados
  - Exemplos práticos de extensão

#### Quando configurar ou resolver problemas de autenticação
- **[use-para-configurar-clerk.md](./use-para-configurar-clerk.md)**
  - Setup inicial do Clerk
  - Variáveis de ambiente
  - Configuração de rotas públicas/privadas
  - Roles e permissions
  - Webhooks para sincronização
  - Troubleshooting (UserProfile, middleware, etc.)

#### Quando fazer manutenção no template (não nos projetos)
- **[use-quando-desenvolver-no-modulo-core.md](./use-quando-desenvolver-no-modulo-core.md)**
  - Quando e por que modificar o core
  - Princípios do core imutável
  - Adicionar novos serviços ao core
  - Testar mudanças no core
  - Versionamento e changelog

#### Quando precisar entender decisões arquiteturais
- **[use-diretrizes-do-projeto.md](./use-diretrizes-do-projeto.md)**
  - Visão geral da arquitetura
  - Decisões técnicas e motivações
  - Problemas resolvidos e lições aprendidas
  - Checklist de qualidade do código
  - Trade-offs e alternativas consideradas

### Módulos Específicos
- **[modules/organizations.md](./modules/organizations.md)** - Exemplo de módulo CRUD completo (Companies, Branches, Clients)

### Quando Consultar Cada Arquivo

| Situação | Arquivo a Consultar |
|----------|-------------------|
| Criar/modificar rotas de API | `use-quando-desenvolver-api.md` |
| Adicionar tela ou alterar layout | `use-para-atualizar-tema-e-componentes-ui.md` |
| Usar componentes (Button, Badge, Alert, etc.) | `use-componentes-ui.md` |
| Customizar serviço do core (AI, Email, Storage) | `use-para-estender-o-core.md` |
| Erro de autenticação (404, Unauthorized) | `use-para-configurar-clerk.md` |
| Adicionar serviço ao template base | `use-quando-desenvolver-no-modulo-core.md` |
| Entender por que algo foi feito de determinada forma | `use-diretrizes-do-projeto.md` |
| Ver exemplo completo de CRUD | `modules/organizations.md` |
| Ver todos os componentes em ação | Página `/ui-components` |
| Regras gerais de desenvolvimento | Este arquivo (`use-sempre-que-desenvolver.md`) |

## Conceito do Core

A pasta `src/core` é a BASE do template e NÃO deve ser modificada diretamente nos projetos derivados.

- **Core**: Código base, componentes, serviços e utilitários que serão atualizados via git pull do template
- **Features**: Código específico do projeto em `src/features` ou `src/app`
- **Extensibilidade**: Use composição e wrappers para customizar comportamentos do core

## Princípios de Desenvolvimento

### 1. Separação de Responsabilidades
- **Core**: Funcionalidades base e reutilizáveis
- **Features**: Lógica de negócio específica do projeto
- **App**: Rotas, páginas e layouts do Next.js

### 2. Não Modifique o Core
Se você precisa customizar algo do core:
- ✅ Crie um wrapper ou componente que estende o core
- ✅ Use composição para adicionar funcionalidades
- ❌ Não edite arquivos em `src/core` diretamente

### 3. Type Safety First
- Use TypeScript em modo `strict`
- Defina tipos explícitos para funções públicas
- Importe tipos de `@/core/types` quando disponíveis
- Documente tipos complexos com JSDoc

### 4. Logging e Auditoria
Para operações críticas (especialmente banco de dados):
```typescript
import { logAction } from '@/core/database/audit-log';

// Após criar/atualizar/deletar no banco
await logAction('CREATE', 'Users', user._id.toString(), userId, { email: user.email });
```

### 5. Tratamento de Erros
Sempre trate erros adequadamente:
```typescript
try {
  // operação
} catch (error) {
  console.error('Context sobre o erro:', error);
  // Retorne resposta estruturada ou lance erro tratado
}
```

### 6. Padrões de Nomenclatura
- **Componentes**: PascalCase (`UserCard.tsx`)
- **Funções/variáveis**: camelCase (`getUserData`)
- **Constantes**: UPPER_SNAKE_CASE (`API_TIMEOUT`)
- **Arquivos de serviço**: kebab-case (`user-service.ts`)
- **Pastas**: kebab-case (`user-management`)

### 7. Estrutura de Arquivos
```
src/
├── core/               # NÃO MODIFICAR
│   ├── ai/            # Serviços de IA
│   ├── auth/          # Helpers de autenticação
│   ├── database/      # Conexão e schemas base
│   ├── email/         # Serviço de email
│   ├── storage/       # Serviço de arquivos
│   ├── ui/            # Componentes base
│   ├── utils/         # Utilitários gerais
│   ├── hooks/         # Hooks reutilizáveis
│   └── types/         # Tipos e interfaces
├── features/          # Módulos específicos do projeto
│   └── [feature-name]/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── utils/
└── app/               # Rotas e páginas Next.js
```

## Serviços do Core

### Banco de Dados
```typescript
import dbConnect from '@/core/database/db';
import { logAction } from '@/core/database/audit-log';

await dbConnect(); // Sempre antes de operações no DB
```

### IA (Gemini)
```typescript
import { generateText } from '@/core/ai/genai';

const response = await generateText('Seu prompt aqui');
// Logs de uso são automáticos
```

### Email
```typescript
import { sendEmail } from '@/core/email/mailer';

await sendEmail('user@example.com', 'Assunto', '<p>Conteúdo HTML</p>');
```

### Storage (S3/Minio)
```typescript
import { uploadFile, getFileUrl } from '@/core/storage/s3';

await uploadFile('path/to/file.pdf', buffer, 'application/pdf');
const url = await getFileUrl('path/to/file.pdf');
```

### API Client (Axios)
```typescript
import api from '@/core/utils/api';

const response = await api.get('/endpoint');
const data = await api.post('/endpoint', { payload });
```

## Documentação

Sempre que criar um novo módulo em `src/features`:
1. Crie documentação em `aicontext/modules/[module-name].md`
2. Descreva: objetivo, schemas, fluxo de dados, APIs
3. Mantenha atualizado

## Testes

Escreva testes para:
- Componentes complexos
- Serviços e APIs
- Hooks customizados
- Lógica de negócio crítica

```bash
npm test                 # Roda todos os testes
npm test -- --watch      # Modo watch
```

## Commits

Mensagens de commit claras:
```
feat: adiciona CRUD de empresas
fix: corrige validação de email
docs: atualiza documentação de API
refactor: melhora performance do hook useAuth
```

## Performance

- Use `use client` apenas quando necessário (interatividade)
- Prefira Server Components para conteúdo estático
- Otimize imagens com next/image
- Use lazy loading para componentes pesados

## Acessibilidade

- Use semântica HTML apropriada
- Adicione labels em formulários
- Teste navegação por teclado
- Use cores com contraste adequado

## Segurança

- NUNCA exponha secrets no client-side
- Valide inputs no servidor
- Use variáveis de ambiente para configurações sensíveis
- Sanitize dados antes de renderizar HTML

---

**Lembre-se**: Este é um template. O objetivo é manter o core atualizável e extensível.
