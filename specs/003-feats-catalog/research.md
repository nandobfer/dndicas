# Research: Catálogo de Talentos (Feats)

**Feature**: `003-feats-catalog`  
**Date**: 2026-02-24  
**Phase**: 0 (Research & Pattern Analysis)

## Overview

Este documento consolida as decisões de pesquisa e padrões técnicos identificados para implementação do Catálogo de Talentos (Feats). Como a feature segue rigorosamente o padrão já estabelecido pelos catálogos de Regras (Rules/Reference) e Habilidades (Traits), a pesquisa foca em documentar os padrões existentes e as extensões necessárias.

---

## Decision 1: Modelo de Dados - Extensão do Padrão Reference

### Context
O sistema já possui dois catálogos implementados:
- **Rules**: Usa o modelo `Reference` (name, description, source, status)
- **Traits**: Possui modelo próprio `Trait` com estrutura similar

O Feats precisa de campos adicionais: `level` (1-20) e `prerequisites` (array de strings).

### Decision
**Criar modelo Mongoose dedicado `Feat`** em `src/features/feats/models/feat.ts`, seguindo a estrutura de `Reference` mas com campos estendidos.

### Rationale
- **Separação de domínio**: Feats são uma entidade de negócio distinta com regras próprias (nível 1-20, pré-requisitos)
- **Flexibilidade futura**: Facilita adicionar campos específicos de feats sem afetar Rules
- **Consistência**: Mantém o padrão já estabelecido por Traits de ter modelo próprio
- **Indexes otimizados**: Permite criar índices específicos para queries por `level`

### Alternatives Considered
- ❌ **Reutilizar Reference com campos opcionais**: Poluiria o modelo base e quebraria a single responsibility
- ❌ **Usar herança Mongoose (discriminators)**: Aumentaria complexidade desnecessariamente para este caso

### Implementation Pattern
```typescript
// src/features/feats/models/feat.ts
interface IFeat extends Document {
  name: string           // Unique, 3-100 chars
  description: string    // HTML with mentions and S3 images
  source: string         // 1-200 chars
  level: number          // 1-20, default 1
  prerequisites: string[] // Array of strings with mentions support
  status: "active" | "inactive"
  createdAt: Date
  updatedAt: Date
}
```

---

## Decision 2: Sistema de Pré-requisitos - Strings com Menções

### Context
Da sessão de clarificação: pré-requisitos devem ser "Texto com Menções (Permite usar o sistema de `@` dentro dos pré-requisitos para linkar a outras regras)".

### Decision
**Array de strings (`string[]`)** onde cada string pode conter HTML com menções renderizadas pelo sistema Tiptap.

### Rationale
- **Flexibilidade máxima**: Aceita qualquer tipo de pré-requisito textual (ex: "Força 13+", "Nível 5", "Ter @Mestre em Atletismo")
- **Compatibilidade com editor existente**: O RichTextEditor já suporta menções via Tiptap
- **Simplicidade de validação**: Zod valida como `z.array(z.string().min(1))` sem estrutura complexa
- **UI moderna**: Preview pode renderizar cada item como badge clicável com menções ativas

### Alternatives Considered
- ❌ **Apenas texto simples**: Perderia capacidade de linkar conteúdo relacionado
- ❌ **Estrutura JSON complexa** (`{ type: "attribute", value: "Força", min: 13 }`): Over-engineering para MVP, dificulta input do usuário

### Implementation Pattern
```typescript
// Database: prerequisites: ["Força 13 ou superior", "Nível 5"]
// UI: Cada item renderizado como MentionContent component
<MentionContent html={prerequisite} mode="inline" />
```

---

## Decision 3: Mapeamento de Nível para Cores de Raridade

### Context
Requisito FR-015 especifica que níveis 1-20 devem mapear para cores de raridade D&D existentes no sistema.

### Decision
**Progressão linear de nível para raridade**:
- Níveis 1-3 → Common (cinza `#9CA3AF`)
- Níveis 4-8 → Uncommon (verde `#10B981`)
- Níveis 9-13 → Rare (azul `#3B82F6`)
- Níveis 14-17 → Very Rare (roxo `#8B5CF6`)
- Níveis 18-19 → Legendary (âmbar `#F59E0B`)
- Nível 20 → Artifact (vermelho `#EF4444`)

### Rationale
- **Aproveitamento de sistema existente**: Usa `rarityColors` já definido em `src/lib/config/colors.ts`
- **Progressão intuitiva**: Quanto maior o nível, mais "raro" e poderoso o talento
- **Consistência visual**: Mesma paleta usada em outros lugares do sistema (audit logs, actions)

### Implementation Pattern
```typescript
// Helper function in feats feature
function getLevelRarityColor(level: number): string {
  if (level <= 3) return rarityColors.common
  if (level <= 8) return rarityColors.uncommon
  if (level <= 13) return rarityColors.rare
  if (level <= 17) return rarityColors.veryRare
  if (level <= 19) return rarityColors.legendary
  return rarityColors.artifact
}
```

---

## Decision 4: Interface de Edição de Pré-requisitos - Lista Dinâmica

### Context
Da sessão de clarificação: "Lista Dinâmica (O usuário adiciona campos de texto um por um usando um botão '+')".

### Decision
**Array de RichTextEditor components** com botões de adicionar/remover, similar ao padrão de tags dinâmicas mas com suporte a rich text e menções.

### Rationale
- **Clareza visual**: Cada pré-requisito claramente separado e editável
- **Suporte a menções**: Cada campo pode usar o editor Tiptap completo com `@` mentions
- **UX moderna**: Animações Framer Motion para adicionar/remover itens (fade in/out)
- **Validação individual**: Cada campo validado como não-vazio

### Alternatives Considered
- ❌ **Textarea único**: Dificulta identificar boundaries entre pré-requisitos e não suporta menções por item
- ❌ **Tags/Chips simples**: Não suporta rich text com menções

### Implementation Pattern
```tsx
// In FeatFormModal
const [prerequisites, setPrerequisites] = useState<string[]>(feat?.prerequisites || [''])

<div className="space-y-2">
  <Label>Pré-requisitos</Label>
  {prerequisites.map((prereq, index) => (
    <div key={index} className="flex gap-2">
      <RichTextEditor 
        value={prereq}
        onChange={(val) => updatePrerequisite(index, val)}
        placeholder="Ex: Força 13 ou superior"
      />
      <Button onClick={() => removePrerequisite(index)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  ))}
  <Button onClick={addPrerequisite}>
    <Plus className="h-4 w-4" /> Adicionar Pré-requisito
  </Button>
</div>
```

---

## Decision 5: Cor de Entidade - Âmbar/Laranja (Talento)

### Context
O sistema usa cores consistentes para diferenciar tipos de entidade:
- Regra: Slate/Cinza
- Habilidade: Emerald/Verde
- Usuário: Blue/Azul
- Segurança: Purple/Roxo

### Decision
**Âmbar/Laranja** (`amber-500`, color hex do `rarityColors.legendary = #F59E0B`)

### Rationale
- **Diferenciação visual**: Cor única não usada por outras entidades
- **Semântica**: Talentos são "conquistas raras" que destacam personagens (legendary color fit)
- **Contraste**: Boa legibilidade em backgrounds dark do Liquid Glass theme
- **Iconografia**: Zap icon (raio) combina com a cor de energia/poder

### Implementation Pattern
```typescript
// src/lib/config/colors.ts
export const entityColors = {
  // ... existing entities
  Talento: {
    name: "Talento",
    color: "amber",
    mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
    badge: "bg-amber-400/20 text-amber-400",
    border: "border-amber-500/20",
    hoverBorder: "hover:border-amber-500/40",
    bgAlpha: "bg-amber-500/10",
    text: "text-amber-400",
    hex: rarityColors.legendary, // #F59E0B
  },
}
```

---

## Decision 6: Arquitetura de API - Padrão REST Consistente

### Context
Rules usa rotas:
- `GET /api/rules` (list com filtros)
- `POST /api/rules` (create)
- `GET /api/rules/[id]` (single)
- `PUT /api/rules/[id]` (update)
- `DELETE /api/rules/[id]` (delete)
- `GET /api/rules/search?q=` (mention system)

### Decision
**Replicar exatamente a mesma estrutura** com `/api/feats`.

### Rationale
- **Consistência**: Mesma API surface para todos os catálogos
- **Previsibilidade**: Desenvolvedores e IAs sabem exatamente onde encontrar endpoints
- **Reutilização**: Client-side API functions (`feats-api.ts`) espelham `rules-api.ts`
- **Manutenibilidade**: Pattern testado e confiável

### Endpoints
```
GET    /api/feats                    # List with filters (page, limit, search, status, level, levelMax)
POST   /api/feats                    # Create (auth required)
GET    /api/feats/[id]               # Get single feat
PUT    /api/feats/[id]               # Update (auth required)
DELETE /api/feats/[id]               # Delete (auth required)
GET    /api/feats/search?q={query}   # Mention system search (active only)
```

---

## Decision 7: Filtros - Nível + Status + Busca de Texto

### Context
Rules possui filtros: Status (all/active/inactive), Busca de texto (name/description/source).
Feats adiciona conceito de nível (1-20).

### Decision
**Adicionar filtro de nível com dois modos**:
1. **Exato**: `?level=5` retorna apenas feats de nível 5
2. **Até nível máximo**: `?levelMax=10` retorna feats de nível 1-10

### Rationale
- **User Story 5**: Explicitamente requer ambos os modos ("exato ou todos até um nível máximo")
- **Casos de uso reais**: Jogador nível 10 quer ver todos os feats disponíveis até seu nível
- **Simplicidade**: Query params simples sem necessidade de range syntax complexo

### Implementation Pattern
```typescript
// API route
const level = url.searchParams.get("level")      // Exact match
const levelMax = url.searchParams.get("levelMax") // Range (1 to levelMax)

if (level) query.level = parseInt(level)
if (levelMax) query.level = { $lte: parseInt(levelMax) }

// UI: Toggle between modes
<Select value={filterMode}>
  <SelectItem value="exact">Nível Exato</SelectItem>
  <SelectItem value="upto">Até Nível</SelectItem>
</Select>
```

---

## Decision 8: Componentes de UI - Reutilização Total do Glass Design System

### Context
Projeto possui componentes Glass padronizados para formulários, tabelas, cards, modals.

### Decision
**Reutilizar 100% dos componentes existentes** sem criar variantes customizadas:
- `GlassModal`, `GlassCard`, `GlassInput`, `GlassSwitch`
- `RichTextEditor` (Tiptap com menções e upload S3)
- `SearchInput`, `StatusChips`, `DataTablePagination`
- `EmptyState`, `LoadingState`, `ErrorState`
- `Chip` (para status e nível)
- `EntityPreviewTooltip`, `MentionBadge`

### Rationale
- **Consistência visual**: Mesma UX em todos os catálogos
- **Zero duplicação**: Evita manutenção de variantes similares
- **Acessibilidade**: Componentes Glass já testados para WCAG
- **Velocity**: Implementação mais rápida reutilizando código maduro

### Component Mapping
```
FeatFormModal         → Baseado em RuleFormModal (95% igual, +level & prerequisites fields)
FeatsTable            → Baseado em RulesTable (mesma estrutura, +level column)
FeatsFilters          → Baseado em RulesFilters (+level filter component)
FeatsEntityCard       → Baseado em EntityCard genérico (usado em Rules/Traits)
```

---

## Decision 9: Auditoria - Mesmo Padrão de Rules/Traits

### Context
Sistema de audit logs já registra operações em Rules e Traits automaticamente.

### Decision
**Chamar `createAuditLog` após cada operação CRUD** com `entity: "Feat"`, invalidar query `['audit-logs']` nos mutation hooks.

### Rationale
- **Compliance**: Rastreabilidade obrigatória por requisito FR-032 a FR-037
- **Pattern testado**: Já funciona perfeitamente em Rules e Traits
- **Tempo real**: Invalidação de query garante UI atualizada sem reload

### Implementation Pattern
```typescript
// In API route (POST /api/feats)
await createAuditLog({
  action: "CREATE",
  entity: "Feat",
  entityId: String(newFeat._id),
  performedBy: session.userId,
  newData: newFeat.toObject()
})

// In useFeatMutations hook
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['feats'] })
  queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
}
```

---

## Decision 10: Sistema de Menções - Integração com Provedor Existente

### Context
`src/features/rules/utils/suggestion.ts` possui registry `ENTITY_PROVIDERS` para tipos de entidade.

### Decision
**Adicionar provedor "Talento"** ao registry apontando para `/api/feats/search`.

### Rationale
- **Arquitetura extensível**: Sistema foi desenhado para suportar múltiplos provedores
- **Autocompletar unificado**: Todos os tipos aparecem na mesma lista de sugestões do `@`
- **Configuração mínima**: Apenas adicionar entrada no objeto de configuração

### Implementation Pattern
```typescript
// src/features/rules/utils/suggestion.ts
export const ENTITY_PROVIDERS = {
  Regra: { endpoint: "/api/rules/search", entityType: "Regra" },
  Habilidade: { endpoint: "/api/traits/search", entityType: "Habilidade" },
  Talento: { endpoint: "/api/feats/search", entityType: "Talento" }, // NEW
}
```

---

## Decision 11: Soft Delete - Manter Integridade de Menções

### Context
Da sessão de clarificação: "Implementar exatamente como feito para os traits" (soft delete).

### Decision
**Não implementar soft delete no MVP**. DELETE será hard delete físico, mas menções quebradas mostrarão aviso visual (comportamento já existe no `mention-badge.tsx`).

### Rationale
- **Simplificação do MVP**: Soft delete adiciona complexidade (filtros, queries, UI)
- **Comportamento existente**: Sistema já lida com menções de entidades deletadas gracefully (mostra texto sem link ativo)
- **Rastreabilidade preservada**: Audit logs mantêm histórico mesmo após DELETE físico
- **Futuro**: Pode ser adicionado em iteração posterior se necessário

### Implementation Note
Se soft delete for necessário no futuro, adicionar campo `deletedAt: Date | null` e filtrar todas as queries com `{ deletedAt: null }`.

---

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript 5.x (strict) | Type safety e DX |
| **Framework** | Next.js 15+ App Router | SSR + Client interactions |
| **UI Library** | React 18+ | Component-based UI |
| **Styling** | Tailwind CSS + Shadcn/ui | Liquid Glass design system |
| **Forms** | React Hook Form + Zod | Validação e state management |
| **Rich Text** | Tiptap (with mentions extension) | Editor de descrição com `@` |
| **State (Server)** | TanStack Query | Cache, invalidation, optimistic updates |
| **Database** | MongoDB + Mongoose | Persistência e schema validation |
| **Auth** | Clerk | Autenticação e autorização |
| **Animations** | Framer Motion | Micro-interactions e transitions |
| **Testing** | Jest + React Testing Library | Unit e integration tests |

---

## Integration Points Inventory

### Files to Create (15 new files)
1. `src/features/feats/models/feat.ts`
2. `src/features/feats/types/feats.types.ts`
3. `src/features/feats/api/feats-api.ts`
4. `src/features/feats/api/validation.ts`
5. `src/features/feats/hooks/useFeats.ts`
6. `src/features/feats/hooks/useFeatMutations.ts`
7. `src/features/feats/components/feat-form-modal.tsx`
8. `src/features/feats/components/feats-table.tsx`
9. `src/features/feats/components/feats-filters.tsx`
10. `src/features/feats/components/feat-preview.tsx`
11. `src/features/feats/components/feats-entity-card.tsx`
12. `src/app/(dashboard)/feats/page.tsx`
13. `src/app/api/feats/route.ts`
14. `src/app/api/feats/[id]/route.ts`
15. `src/app/api/feats/search/route.ts`

### Files to Modify (9 existing files)
1. `src/lib/config/colors.ts` - Add Talento entity colors
2. `src/components/sidebar/expandable-sidebar.tsx` - Add Feats menu entry
3. `src/app/(dashboard)/page.tsx` - Add FeatsEntityCard to grid
4. `src/app/api/dashboard/stats/route.ts` - Add feats statistics
5. `src/features/rules/utils/suggestion.ts` - Register Talento provider
6. `src/features/rules/components/mention-list.tsx` - Display feat suggestions
7. `src/features/rules/components/mention-badge.tsx` - Render feat badges
8. `src/features/rules/components/entity-preview-tooltip.tsx` - Add FeatPreview
9. `src/features/users/components/audit-logs-table.tsx` - Map Feat entity label

---

## Best Practices & Patterns Identified

### From Rules Implementation
- ✅ Zod schemas co-located in `api/validation.ts`
- ✅ TanStack Query keys namespaced: `['feats']`, `['feat', id]`
- ✅ Mutation hooks invalidate multiple queries (feats, audit-logs, dashboard-stats)
- ✅ API routes use try-catch with console.error for debugging
- ✅ 401 checks via Clerk `auth()` before POST/PUT/DELETE
- ✅ 409 Conflict for duplicate names (case-insensitive uniqueness check)

### From Traits Implementation
- ✅ Modal form reset on open/close via `useEffect`
- ✅ RichTextEditor passed with `excludeId` prop (avoid self-mention)
- ✅ EntityPreviewTooltip wraps preview icons in tables
- ✅ EmptyState/LoadingState/ErrorState for all data states

### From Dashboard Implementation
- ✅ EntityCard component generalized with `entityType` prop
- ✅ Growth chart uses `MiniLineChart` with entity color
- ✅ Active count badge shows in top-right corner
- ✅ Card onClick redirects to feature page

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Level filter performance com grandes datasets** | HIGH | Adicionar index em `level` field no Mongoose schema |
| **Prerequisites com HTML malicioso** | HIGH | Sanitização via Tiptap (já faz isso) + CSP headers |
| **Menções circulares (Feat A → Feat B → Feat A)** | LOW | Acceptable: preview tooltip já limita profundidade de renderização |
| **Upload de imagens grandes na descrição** | MEDIUM | Já mitigado: S3 upload com limite de tamanho configurado |
| **Concorrência na edição** | LOW | Acceptable: Last-write-wins (mesmo comportamento de Rules/Traits) |

---

## Open Questions Resolved

Todas as questões levantadas na fase de clarificação foram resolvidas:
- ✅ **Definição de Nível**: Nível mínimo do personagem (1-20)
- ✅ **Estrutura de Pré-requisitos**: Strings com menções
- ✅ **Integração UI**: Sidebar + Dashboard + Menções
- ✅ **Interface de Edição**: Lista dinâmica com botão "+"
- ✅ **Comportamento de Exclusão**: Soft delete (decisão: hard delete no MVP, com graceful handling de menções quebradas)

---

## Performance Considerations

### Query Optimization
- Índices Mongoose: `name` (text), `description` (text), `status`, `level`, `createdAt`
- Paginação server-side: Default 10 items/page
- Debounce em SearchInput: 300ms
- TanStack Query staleTime: 5 minutos para lista, 10 minutos para item individual

### Bundle Size Impact
- **Estimativa**: +50KB gzipped (novos componentes + hooks)
- **Justificativa**: Aceitável para feature completa de catálogo
- **Otimização**: Code-splitting automático do Next.js (route-based)

---

## Conclusion

A pesquisa confirma que não há unknowns técnicos significativos. Toda a stack, padrões e componentes necessários já existem no projeto. A implementação do Catálogo de Talentos é uma **replicação direta** do padrão estabelecido por Rules/Traits, com extensões pontuais para:
1. Campo `level` (1-20) com mapeamento para cores de raridade
2. Campo `prerequisites` (array de strings com suporte a menções)
3. Filtro adicional de nível (exato e até nível máximo)
4. Cor de entidade Âmbar/Laranja para diferenciação visual

**Readiness**: ✅ Ready to proceed to Phase 1 (Data Model & Contracts).
