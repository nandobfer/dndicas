# Research: Liquid Glass Core - Design System, Auth & Foundation

**Feature**: spec/000 | **Date**: 2026-02-19

---

## 1. Glassmorphism e Liquid Glass - Melhores Práticas

### Decisão
Implementar glassmorphism usando `backdrop-filter: blur()` do CSS com fallback gracioso para browsers sem suporte. Utilizar variáveis CSS centralizadas em `src/lib/config/glass-config.ts`.

### Racional
- `backdrop-filter` tem ~95% de suporte em browsers modernos
- Tailwind CSS 4.0 suporta `backdrop-blur-*` nativamente
- Centralizar configurações permite ajustes globais sem refatoração

### Alternativas Consideradas
- **SVG filters**: Rejeitado - performance inferior e complexidade de implementação
- **Canvas blur**: Rejeitado - overhead de JavaScript desnecessário
- **Imagens de fundo pré-renderizadas**: Rejeitado - não dinâmico, não se adapta ao conteúdo

### Configuração Recomendada
```typescript
// src/lib/config/glass-config.ts
export const glassConfig = {
  overlay: {
    blur: 'backdrop-blur-xl',          // 24px blur
    background: 'bg-black/40',          // 40% opacity
    border: 'border border-white/10',   // Borda sutil
    shadow: 'shadow-2xl shadow-black/20',
  },
  card: {
    blur: 'backdrop-blur-md',           // 12px blur
    background: 'bg-white/5',           // 5% opacity
    border: 'border border-white/5',
    glow: 'ring-1 ring-white/10',
  },
  sidebar: {
    blur: 'backdrop-blur-lg',           // 16px blur
    background: 'bg-black/60',          // 60% opacity
  },
};
```

---

## 2. Framer Motion - Padrões de Animação para UX

### Decisão
Criar biblioteca de variantes de animação centralizadas em `src/lib/config/motion-configs.ts`, seguindo padrão já sugerido em `docs/stack_tecnica.md`.

### Racional
- Consistência visual em toda a aplicação
- Facilita ajustes globais de timing
- Reduz duplicação de código
- Performance otimizada com variantes pré-definidas

### Configurações de Animação
```typescript
// src/lib/config/motion-configs.ts
export const motionConfig = {
  // Transições de página e modais
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  
  // Sidebar expand/collapse (< 400ms conforme SC-002)
  sidebar: {
    expanded: { width: 280 },
    collapsed: { width: 72 },
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
  },
  
  // Tabela - transição entre páginas
  tableRow: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 },
    transition: { duration: 0.2 },
  },
  
  // Hover e focus states
  hover: {
    scale: 1.02,
    transition: { duration: 0.15 },
  },
  
  // Loading states
  pulse: {
    animate: { opacity: [0.5, 1, 0.5] },
    transition: { duration: 1.5, repeat: Infinity },
  },
};
```

---

## 3. Paleta de Cores D&D - Sistema de Raridade

### Decisão
Usar paleta de cores baseada no sistema de raridade de D&D 5e, mapeando para estados da aplicação (sucesso, erro, info, warning) e roles de usuário.

### Racional
- Familiaridade para jogadores de D&D (público-alvo)
- Hierarquia visual clara e intuitiva
- Cores já definidas na spec (seção "Cores de Referência")

### Mapeamento de Cores
```typescript
// src/lib/config/colors.ts
export const colors = {
  rarity: {
    common: '#9CA3AF',      // Cinza - neutro
    uncommon: '#10B981',    // Verde - sucesso/CREATE
    rare: '#3B82F6',        // Azul - info/UPDATE
    veryRare: '#8B5CF6',    // Roxo - destaque/usuário comum
    legendary: '#F59E0B',   // Dourado - warning/alerta
    artifact: '#EF4444',    // Vermelho - perigo/DELETE/admin
  },
  
  // Mapeamento semântico
  action: {
    create: '#10B981',      // uncommon/verde
    read: '#9CA3AF',        // common/cinza
    update: '#3B82F6',      // rare/azul
    delete: '#EF4444',      // artifact/vermelho
  },
  
  role: {
    admin: '#EF4444',       // artifact/vermelho
    user: '#8B5CF6',        // veryRare/roxo
  },
  
  // Liquid Glass
  glass: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.15)',
    dark: 'rgba(0, 0, 0, 0.4)',
    border: 'rgba(255, 255, 255, 0.1)',
  },
};
```

---

## 4. Sidebar Expansível - Padrões de Implementação

### Decisão
Implementar sidebar como drawer persistente (não overlay) com estado gerenciado via hook `useSidebar` e persistência em `sessionStorage`.

### Racional
- sessionStorage garante estado dentro da sessão sem persistir entre visitas (conforme clarificação)
- Hook customizado encapsula lógica de persistência e animação
- Drawer persistente mantém contexto visual durante navegação

### Implementação
```typescript
// src/components/ui/hooks/useSidebar.ts
export const useSidebar = () => {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = sessionStorage.getItem('sidebar-expanded');
    return stored === null ? true : stored === 'true'; // Default: expandido
  });

  const toggle = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      sessionStorage.setItem('sidebar-expanded', String(next));
      return next;
    });
  }, []);

  return { isExpanded, toggle };
};
```

---

## 5. DataTable com Server-Side Pagination

### Decisão
Estender o `DataTable` existente em `src/core/ui/data-table.tsx` via wrapper em `src/components/ui/` que adiciona:
- Server-side pagination via TanStack Query
- Animações de transição com Framer Motion
- Auto-scroll para topo na mudança de página
- Debounce de 500ms com barra de progresso visual

### Racional
- Não modifica o core (princípio 2 da constituição)
- TanStack Query gerencia cache e refetch automático
- Server-side pagination essencial para grandes volumes (logs ilimitados)

### Padrão de Uso
```typescript
// Componente wrapper que estende o core DataTable
const GlassDataTable = <T,>({ 
  queryKey, 
  fetchFn, 
  columns,
  ...props 
}: GlassDataTableProps<T>) => {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...queryKey, page, filters],
    queryFn: () => fetchFn({ page, limit: 10, ...filters }),
  });
  
  return (
    <motion.div variants={motionConfig.tableRow}>
      <DataTable data={data?.items} columns={columns} {...props} />
      <Pagination 
        total={data?.total} 
        page={page} 
        onPageChange={handlePageChange} 
      />
    </motion.div>
  );
};
```

---

## 6. Sincronização Clerk → MongoDB

### Decisão
Usar webhook do Clerk (`user.created`, `user.updated`) + fallback de sincronização no middleware para garantir que usuários sempre existam no banco local.

### Racional
- Webhooks são a forma recomendada pelo Clerk para sincronização
- Fallback no middleware garante consistência mesmo com falha de webhook
- Estrutura já existe em `src/core/auth/` (helpers.ts)

### Fluxo
1. **Webhook** (primário): Clerk envia evento → API Route processa → Cria/atualiza User no MongoDB
2. **Middleware** (fallback): Se usuário Clerk não existe no MongoDB → Cria registro básico
3. **Script bootstrap-admin**: CLI para criar primeiro admin antes de webhooks funcionarem

---

## 7. Soft Delete de Usuários

### Decisão
Implementar soft delete com campo `status: 'active' | 'inactive'` no modelo User, mantendo registro para referência em audit logs.

### Racional
- Audit logs referenciam usuários; hard delete quebraria integridade referencial
- Permite reativação de usuários se necessário
- Padrão já usado em outros models do projeto (ex: `Company.status`)

### Impacto
- Queries de listagem filtram por `status: 'active'` por padrão
- Filtro de status permite visualizar inativos
- Soft delete registra audit log com ação "DELETE"

---

## 8. Componente Placeholder para Features Futuras

### Decisão
Criar componente `ComingSoonPlaceholder` reutilizável com estética Liquid Glass para features out-of-scope (Owlbear Rodeo, catálogo público, etc).

### Racional
- Mantém consistência visual da aplicação
- Comunica claramente que feature está planejada
- Evita telas em branco ou erros

### Design
```typescript
// src/components/ui/coming-soon-placeholder.tsx
interface ComingSoonPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

// Visual: Card glassmorphism centralizado com ícone grande,
// título em destaque e descrição em texto secundário
// Animação sutil de pulse no ícone
```

---

## 9. Estados de Loading, Empty e Error

### Decisão
Criar três componentes especializados com estética Liquid Glass consistente:
- `LoadingState`: Skeleton com animação pulse + indicador circular
- `EmptyState`: Ícone + título + descrição + ação opcional
- `ErrorState`: Ícone de erro + mensagem + botão retry

### Racional
- UX impecável conforme requisito do usuário
- Componentes reutilizáveis em toda a aplicação
- Tratamento consistente de todos os estados possíveis

### Padrões Visuais
- **Loading**: Skeleton com `backdrop-blur` e animação pulse
- **Empty**: Ícone `Inbox` ou contextual, mensagem em texto muted
- **Error**: Ícone `AlertCircle` em vermelho artifact, botão retry primário

---

## 10. Script bootstrap-admin

### Decisão
Criar script CLI em `scripts/bootstrap-admin.ts` com tratamento de edge cases robusto:
1. **Verificação Local**: Se usuário existe e é admin, encerra. Se existe e não é admin, promove.
2. **Verificação Clerk**: Se usuário existe no Clerk, recupera `clerkId`. Se não existe, cria via Admin API.
3. **Sincronização**: Garante que o registro local tenha o `clerkId` correto e role `admin`.

### Racional
- Necessário para setup inicial antes de webhooks funcionarem.
- Evita o problema de "ovo e galinha" (precisa de admin para criar admin).
- Garante a integridade entre Clerk e DB local mesmo em setups manuais.

### Edge Cases Planejados
- **Conflict**: Email existente no Clerk deve ser reaproveitado, não duplicado.
- **Promotion**: Usuário logado via social login (que já existe no DB) pode ser promovido via script.
- **Error Handling**: Validar formato de email e conectividade antes de iniciar mutations.

### Uso
```bash
npx ts-node scripts/bootstrap-admin.ts --email admin@example.com
```

---

## Resumo de Decisões

| Área | Decisão | Rationale |
|------|---------|-----------|
| Glassmorphism | CSS `backdrop-filter` com Tailwind | Suporte nativo, performance |
| Animações | Framer Motion centralizadas | Consistência, manutenibilidade |
| Cores | Paleta D&D rarity | Familiaridade do público-alvo |
| Sidebar | sessionStorage + hook | Clarificação do usuário |
| DataTable | Wrapper com TanStack Query | Core imutável, server-side |
| Sync Clerk | Webhook + fallback middleware | Robustez |
| Soft Delete | Campo status | Integridade de audit logs |
| Placeholders | Componente reutilizável | UX consistente |
| Estados | Loading/Empty/Error components | UX impecável |
| Bootstrap | Script CLI | Setup inicial |
