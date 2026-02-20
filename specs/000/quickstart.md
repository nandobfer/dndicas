# Quickstart: Liquid Glass Core

**Feature**: spec/000 | **Date**: 2026-02-19

Este guia oferece instruções rápidas para configurar e testar a feature Liquid Glass Core.

---

## Pré-requisitos

- Node.js 20+ LTS
- MongoDB Atlas configurado (ou local)
- Clerk configurado com Application ID e Secret Key
- Variáveis de ambiente configuradas em `.env.local`

---

## 1. Setup Inicial

### 1.1 Variáveis de Ambiente

Adicione as seguintes variáveis ao `.env.local`:

```env
# MongoDB
DATABASE_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<database>

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...  # Para webhook de sincronização

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 1.2 Instalar Dependências

```bash
npm install
```

### 1.3 Configurar Webhook do Clerk

1. Acesse o Clerk Dashboard > Webhooks
2. Crie um novo webhook com URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/clerk`
3. Selecione eventos: `user.created`, `user.updated`
4. Copie o signing secret para `CLERK_WEBHOOK_SECRET`

---

## 2. Criar Primeiro Administrador

Antes de acessar o dashboard, crie o primeiro administrador:

```bash
npx ts-node scripts/bootstrap-admin.ts --email seu-email@exemplo.com
```

O script irá:
1. Verificar se já existe administrador no banco
2. Criar usuário no Clerk (se não existir)
3. Criar registro no MongoDB com role `admin`

---

## 3. Iniciar Aplicação

```bash
npm run dev
```

Acesse `http://localhost:3000` e faça login com o email do administrador criado.

---

## 4. Verificação de Funcionalidades

### 4.1 Tema Liquid Glass

- [ ] Modais abrem com efeito de blur e transparência
- [ ] Cards têm gradientes sutis e bordas com glow
- [ ] Hover em elementos executa animações suaves

### 4.2 Sidebar Expansível

- [ ] Sidebar inicia expandido
- [ ] Botão no header expande/recolhe com animação < 400ms
- [ ] Estado persiste durante navegação (mesmo tab)
- [ ] Tooltips aparecem quando sidebar está recolhido

### 4.3 CRUD de Usuários

Acesse **Cadastros > Usuários**:

- [ ] Tabela carrega com paginação (10 registros por página)
- [ ] Busca funciona com debounce de 500ms e barra de progresso
- [ ] Filtros por função e status funcionam
- [ ] Modal de criação abre com efeito translúcido
- [ ] Validação de campos funciona (username, email obrigatórios)
- [ ] Seletor de role mostra tabs coloridos (admin=vermelho, user=roxo)
- [ ] Edição popula dados corretamente
- [ ] Exclusão mostra confirmação e executa soft delete
- [ ] Não é possível excluir a si mesmo

### 4.4 Logs de Auditoria

Acesse **Administração > Logs de Auditoria**:

- [ ] Operações CRUD aparecem automaticamente
- [ ] Chips de ação têm cores corretas (CREATE=verde, UPDATE=azul, DELETE=vermelho)
- [ ] Chip de usuário mostra avatar e tooltip
- [ ] Botão "Visualizar" abre modal com diff view
- [ ] Diff view destaca diferenças corretamente

### 4.5 Estados de UI

- [ ] Loading state aparece durante carregamento de dados
- [ ] Empty state aparece quando não há registros
- [ ] Error state aparece com botão retry em caso de erro

---

## 5. Estrutura de Arquivos Criados

```
src/
├── lib/config/
│   ├── colors.ts
│   ├── glass-config.ts
│   └── motion-configs.ts
├── features/users/
│   ├── components/
│   ├── hooks/
│   ├── api/
│   ├── models/
│   └── types/
├── components/ui/
│   ├── glass-card.tsx
│   ├── glass-modal.tsx
│   ├── search-input.tsx
│   ├── chip.tsx
│   ├── user-chip.tsx
│   ├── role-tabs.tsx
│   ├── diff-view.tsx
│   ├── confirm-dialog.tsx
│   ├── expandable-sidebar.tsx
│   ├── loading-state.tsx
│   ├── empty-state.tsx
│   ├── error-state.tsx
│   └── coming-soon-placeholder.tsx
└── app/
    ├── (dashboard)/
    │   ├── layout.tsx (atualizado)
    │   └── users/page.tsx (novo)
    └── api/
        ├── users/route.ts
        └── webhooks/clerk/route.ts
```

---

## 6. Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Testes
npm test
npm test -- --coverage

# Lint e Type Check
npm run lint
npm run type-check

# Build
npm run build
```

---

## 7. Troubleshooting

### Erro: "Usuário não sincronizado"

Se login funciona mas usuário não aparece no MongoDB:
1. Verifique se webhook do Clerk está configurado corretamente
2. Verifique logs do endpoint `/api/webhooks/clerk`
3. Execute manualmente: `npx ts-node scripts/sync-user.ts --clerkId <id>`

### Erro: "Sem permissão" ao acessar admin

1. Verifique se usuário tem role `admin` no MongoDB
2. Execute: `npx ts-node scripts/set-admin.ts --email <email>`

### Animações lentas

1. Verifique se `framer-motion` está na versão 12+
2. Verifique se não há CSS conflitante com `transition`
3. Use DevTools > Performance para identificar bottlenecks

### Blur não funciona

1. Verifique suporte do browser a `backdrop-filter`
2. Fallback: remover blur e usar `bg-black/80` sólido

---

## 8. Próximos Passos

Após validação desta feature, as próximas implementações podem usar:

- Componentes UI criados (`GlassCard`, `GlassModal`, `Chip`, etc.)
- Configurações de cores e animações em `lib/config/`
- Padrão de hooks para CRUD (`useUsers` como referência)
- DataTable com server-side pagination

Consulte `aicontext/modules/users.md` para documentação completa do módulo.
