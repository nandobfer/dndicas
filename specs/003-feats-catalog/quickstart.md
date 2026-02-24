# Quickstart: Catálogo de Talentos (Feats)

**Feature**: `003-feats-catalog`  
**Date**: 2026-02-24  
**Developer Onboarding Guide**

## Overview

Este guia fornece instruções rápidas para desenvolvedores que precisam trabalhar com o Catálogo de Talentos (Feats) pela primeira vez. Se você já está familiarizado com os catálogos de Regras (Rules) ou Habilidades (Traits), esta feature segue exatamente o mesmo padrão.

**TL;DR**: Feats = Rules + `level` field + `prerequisites` array.

---

## 🎯 5-Minute Setup

### 1. Clone e instale dependências (se ainda não fez)
```bash
git clone <repo-url>
cd d7d
npm install
```

### 2. Configure variáveis de ambiente
```bash
cp .env.example .env.local
# Adicione suas chaves: MONGODB_URI, NEXT_PUBLIC_CLERK_*, AWS_S3_*
```

### 3. Rode o projeto
```bash
npm run dev
# Acesse http://localhost:3000
```

### 4. Acesse o catálogo de talentos
- URL: `http://localhost:3000/feats`
- Sidebar: Clique em "Talentos" (ícone ⚡ Zap)

---

## 📁 Estrutura de Arquivos

```
src/features/feats/
├── api/
│   ├── feats-api.ts        # Client functions (fetchFeats, createFeat, etc.)
│   └── validation.ts       # Zod schemas (CreateFeatInput, UpdateFeatInput)
├── components/
│   ├── feat-form-modal.tsx      # Create/Edit form
│   ├── feats-table.tsx          # Paginated list with CRUD actions
│   ├── feats-filters.tsx        # Search + Level + Status filters
│   ├── feat-preview.tsx         # Tooltip preview
│   └── feats-entity-card.tsx    # Dashboard stats card
├── hooks/
│   ├── useFeats.ts              # TanStack Query: fetch feats list
│   └── useFeatMutations.ts      # TanStack Query: create/update/delete
├── models/
│   └── feat.ts                  # Mongoose model definition
└── types/
    └── feats.types.ts           # TypeScript interfaces

src/app/
├── (dashboard)/feats/page.tsx   # Main feats catalog page
└── api/feats/
    ├── route.ts                 # GET (list), POST (create)
    ├── [id]/route.ts            # GET (single), PUT (update), DELETE
    └── search/route.ts          # Mention system integration
```

---

## 🧩 Key Concepts

### Feat Entity
```typescript
interface Feat {
  _id: string
  name: string              // Unique, 3-100 chars
  description: string       // Rich HTML with mentions & S3 images
  source: string            // Bibliographic reference
  level: number             // Min character level (1-20)
  prerequisites: string[]   // Array of requirement strings (can be empty)
  status: "active" | "inactive"
  createdAt: string
  updatedAt: string
}
```

### Level Mapping to Rarity Colors
- Níveis 1-3 → Common (gray)
- Níveis 4-8 → Uncommon (green)
- Níveis 9-13 → Rare (blue)
- Níveis 14-17 → Very Rare (purple)
- Níveis 18-19 → Legendary (amber)
- Nível 20 → Artifact (red)

### Prerequisites Format
Each item in `prerequisites` array can contain:
- Plain text: `"Força 13 ou superior"`
- HTML with mentions: `"Ter <span data-type=\"mention\" ...>Conjuração</span>"`

---

## 🔨 Common Tasks

### Task 1: Create a New Feat (via UI)
1. Navigate to `/feats`
2. Click "Novo Talento" button
3. Fill form:
   - **Name**: Unique feat name
   - **Source**: Book reference (ex: "PHB pg. 168")
   - **Description**: Use rich text editor (supports `@` mentions and image upload)
   - **Level**: 1-20 (default: 1)
   - **Prerequisites**: Click "+" to add items, use rich editor for each
   - **Status**: Active/Inactive toggle
4. Submit → Feat appears in table

### Task 2: Filter Feats by Level (via UI)
1. In `/feats`, use level filter dropdown
2. Choose mode:
   - **Exact**: Show only feats of specific level (ex: "Nível 5")
   - **Up to**: Show feats from 1 to selected level (ex: "Até Nível 10")
3. Results update automatically

### Task 3: Mention a Feat in Another Content
1. In any rich text editor (Rule, Trait, Feat description)
2. Type `@` to open mention suggestions
3. Type feat name (ex: `@mage`)
4. Select feat from dropdown (amber badge with "Talento" label)
5. Badge appears with hover preview

### Task 4: Fetch Feats Programmatically
```typescript
import { useFeats } from "@/features/feats/hooks/useFeats"

function MyComponent() {
  const { data, isLoading } = useFeats({
    page: 1,
    limit: 10,
    status: "active",
    levelMax: 10  // Feats for level 1-10 characters
  })
  
  if (isLoading) return <LoadingState />
  
  return (
    <div>
      {data.items.map(feat => (
        <div key={feat._id}>{feat.name} (Level {feat.level})</div>
      ))}
    </div>
  )
}
```

### Task 5: Create Feat via API (programmatic)
```typescript
import { createFeat } from "@/features/feats/api/feats-api"

await createFeat({
  name: "Great Weapon Master",
  description: "<p>You've learned to trade accuracy for devastating power...</p>",
  source: "PHB pg. 167",
  level: 1,
  prerequisites: ["Força 13+", "Proficiência em Armas Marciais"],
  status: "active"
})
```

### Task 6: Add Audit Log for Custom Action
Audit logs are automatic for CRUD operations, but if you need custom logging:
```typescript
import { createAuditLog } from "@/features/users/api/audit-service"

await createAuditLog({
  action: "CUSTOM_ACTION",
  entity: "Feat",
  entityId: featId,
  performedBy: userId,
  newData: { customField: "value" }
})
```

---

## 🎨 UI Components Reference

### FeatsTable
Displays paginated list with columns: Status, Name, Level (chip), Prerequisites, Description, Source, Preview, Actions.

**Props**:
```typescript
interface FeatsTableProps {
  feats: Feat[]
  total: number
  page: number
  limit: number
  isLoading?: boolean
  onEdit: (feat: Feat) => void
  onDelete: (feat: Feat) => void
  onPageChange: (page: number) => void
}
```

### FeatFormModal
Modal form for creating/editing feats. Includes RichTextEditor for description and dynamic prerequisite list.

**Props**:
```typescript
interface FeatFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateFeatInput | UpdateFeatInput) => Promise<void>
  feat?: Feat | null  // Undefined = create mode, Feat = edit mode
  isSubmitting?: boolean
}
```

### FeatsFilters
Search input + level filter + status chips.

**Props**:
```typescript
interface FeatsFiltersProps {
  filters: FeatsFilters
  onSearchChange: (search: string) => void
  onLevelChange: (level: number | undefined, mode: "exact" | "upto") => void
  onStatusChange: (status: FeatsFilters["status"]) => void
  isSearching?: boolean
}
```

---

## 🔌 Integration Points

### Colors Configuration
```typescript
// src/lib/config/colors.ts
export const entityColors = {
  Talento: {
    color: "amber",
    mention: "bg-amber-500/10 text-amber-400 border-amber-400/20",
    badge: "bg-amber-400/20 text-amber-400",
    hex: rarityColors.legendary,  // #F59E0B
  }
}
```

### Mention System
```typescript
// src/features/rules/utils/suggestion.ts
export const ENTITY_PROVIDERS = {
  Talento: {
    endpoint: "/api/feats/search",
    entityType: "Talento"
  }
}
```

### Audit Logs
Automatically map "Feat" entity in:
- `src/features/users/components/audit-logs-table.tsx` → Label: "Talento", Icon: Zap
- `src/features/users/components/entity-multiselect.tsx` → Filter option: "Talento"

### Dashboard
```typescript
// src/app/(dashboard)/page.tsx
<FeatsEntityCard 
  entityType="Talento" 
  stats={statsData.feats} 
  loading={loading} 
/>
```

---

## 🧪 Testing

### Run All Tests
```bash
npm test                    # Jest unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Test Files Location
```
__tests__/features/feats/
├── components/
│   └── feats-table.test.tsx
└── hooks/
    └── useFeats.test.ts
```

### Example Test
```typescript
import { render, screen } from "@testing-library/react"
import { FeatsTable } from "@/features/feats/components/feats-table"

test("renders feat with level chip", () => {
  const mockFeat = {
    _id: "123",
    name: "Mage Slayer",
    level: 5,
    // ... other fields
  }
  
  render(<FeatsTable feats={[mockFeat]} ... />)
  
  expect(screen.getByText("Mage Slayer")).toBeInTheDocument()
  expect(screen.getByText("5")).toBeInTheDocument()  // Level chip
})
```

---

## 🐛 Troubleshooting

### Problem: "Feat name already exists" (409 error)
**Solution**: Feat names must be unique (case-insensitive). Check existing feats or choose different name.

### Problem: Level filter not working
**Check**:
1. Mongoose index created? Run: `db.feats.createIndex({ level: 1 })`
2. Query params correct? Use `?level=5` (exact) OR `?levelMax=10` (range), not both

### Problem: Mentions not appearing in suggestion list
**Check**:
1. Feat status is "active"? Inactive feats excluded from search
2. Provider registered? Verify `ENTITY_PROVIDERS` in `suggestion.ts`
3. Endpoint working? Test: `curl http://localhost:3000/api/feats/search?q=test`

### Problem: Prerequisites not rendering with mentions
**Check**:
1. HTML format correct? Each prerequisite is a string, not object
2. MentionContent component used? Preview should wrap with `<MentionContent html={prereq} />`

### Problem: Audit logs not appearing
**Check**:
1. Mutation hook invalidating? Verify `queryClient.invalidateQueries({ queryKey: ['audit-logs'] })`
2. API route calling `createAuditLog`? Check try-catch block in POST/PUT/DELETE routes

---

## 📚 Related Documentation

- **[spec.md](./spec.md)**: Complete feature specification with user stories
- **[data-model.md](./data-model.md)**: Detailed entity schema and relationships
- **[contracts/feats.yaml](./contracts/feats.yaml)**: OpenAPI specification for all endpoints
- **[research.md](./research.md)**: Technical decisions and pattern analysis
- **[plan.md](./plan.md)**: Implementation plan and constitution check

### Project-Wide Docs
- `/docs/regras_gerais.md`: TypeScript and code conventions
- `/docs/stack_tecnica.md`: Tech stack and architecture
- `/aicontext/use-sempre-que-desenvolver.md`: AI development context

---

## 🚀 Next Steps

### For New Developers
1. ✅ Read this Quickstart
2. ✅ Explore `/feats` page in running app
3. ✅ Review `src/features/feats/` file structure
4. ✅ Compare with `src/features/rules/` (same patterns)
5. ✅ Try creating a feat via UI
6. ✅ Inspect API calls in browser DevTools Network tab

### For Feature Extension
1. Read [spec.md](./spec.md) Section: "Edge Cases"
2. Review [data-model.md](./data-model.md) Section: "Future Migrations"
3. Check [research.md](./research.md) Section: "Risk Mitigation"
4. Consider backward compatibility when adding fields

---

## ⚡ Performance Tips

### Database Queries
- Use indexes: `name`, `level`, `status`, `createdAt` already indexed
- Paginate: Always use `page` and `limit` params (default 10 items)
- Filter early: Apply status/level filters in MongoDB query, not in JS

### React Component Optimization
- Use `React.memo` for FeatsTable rows if list is large (>100 items)
- Debounce search input (already done: 300ms)
- TanStack Query caching: Default staleTime is 5 min for list, 10 min for single item

### Rich Text Editor
- Lazy load Tiptap extensions (already code-split by Next.js)
- Compress S3 images before upload (size limit: 5MB)
- Avoid excessive HTML in prerequisites (keep them short)

---

## 🔐 Security Notes

### Authentication
- All write operations (POST/PUT/DELETE) require Clerk authentication
- Use `auth()` from `@clerk/nextjs/server` in API routes

### Input Validation
- Client-side: React Hook Form + Zod
- Server-side: Zod schema validation before DB operations
- MongoDB: Mongoose schema validators as final layer

### XSS Protection
- Tiptap sanitizes HTML via DOMPurify
- CSP headers block inline scripts
- Never use `dangerouslySetInnerHTML` directly (use MentionContent component)

---

## 💡 Pro Tips

1. **Copying from Rules**: If implementing similar features, copy from `src/features/rules/` and replace "Rule/Reference" with "Feat" in names.

2. **Level Color Helper**: Create utility function for level → color mapping to avoid repetition.

3. **Prerequisites UX**: Keep prerequisites short and scannable. Long paragraphs should go in `description`.

4. **Testing Mentions**: Use `excludeId` prop in RichTextEditor to avoid self-mentions (ex: Feat A can't mention itself).

5. **Audit Log Debugging**: Check `/audit-logs` page with filter "Talento" if operations don't appear in UI.

---

## 👥 Who to Ask

- **Architecture questions**: Review [plan.md](./plan.md) Constitution Check
- **UI/UX questions**: Check existing Rules/Traits components
- **API schema questions**: See [contracts/feats.yaml](./contracts/feats.yaml)
- **Data model questions**: See [data-model.md](./data-model.md)

---

**Last Updated**: 2026-02-24  
**Status**: ✅ Ready for development
