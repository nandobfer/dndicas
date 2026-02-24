# Data Model: Catálogo de Talentos (Feats)

**Feature**: `003-feats-catalog`  
**Date**: 2026-02-24  
**Phase**: 1 (Data Model Design)

## Overview

Este documento define o modelo de dados para o Catálogo de Talentos (Feats) do sistema D&Dicas. O modelo segue os padrões estabelecidos pelos catálogos de Regras (Reference) e Habilidades (Traits), com extensões específicas para representar os requisitos de nível e pré-requisitos dos talentos de D&D 5e.

---

## Entity: Feat

### Description
Representa um talento (feat) de D&D 5e - uma habilidade especial que um personagem pode adquirir ao atingir determinado nível ou atender pré-requisitos específicos. Talentos concedem capacidades além das oferecidas pela classe e raça do personagem.

### Schema (Mongoose/MongoDB)

```typescript
interface IFeat extends Document {
  // Identification
  _id: ObjectId              // Auto-generated MongoDB ID
  
  // Core Fields
  name: string               // Unique name (3-100 chars)
  description: string        // Rich HTML content (10-50000 chars)
  source: string             // Source reference (1-200 chars)
  
  // Feat-Specific Fields
  level: number              // Minimum character level (1-20, default: 1)
  prerequisites: string[]    // Array of prerequisite strings (can be empty)
  
  // Status & Metadata
  status: "active" | "inactive"  // Default: "active"
  createdAt: Date            // Auto-timestamp
  updatedAt: Date            // Auto-timestamp
}
```

### Field Definitions

#### `name` (string, required, unique)
- **Description**: Nome do talento em português ou inglês original
- **Constraints**:
  - Mínimo: 3 caracteres
  - Máximo: 100 caracteres
  - Único (case-insensitive check via unique index)
  - Trim automático (remove espaços nas bordas)
- **Examples**: 
  - "Mage Slayer"
  - "Great Weapon Master"
  - "Mestre em Armas Grandes"
- **Validation Error**: 409 Conflict se nome duplicado

#### `description` (string, required)
- **Description**: Descrição completa do talento em HTML formatado
- **Constraints**:
  - Mínimo: 10 caracteres
  - Máximo: 50.000 caracteres
  - Suporta HTML com tags seguras (via Tiptap sanitization)
  - Suporta menções (`<span data-type="mention">`)
  - Suporta imagens S3 (`<img src="https://s3...">`)
- **Content Format**: HTML gerado pelo TiptapEditor
- **Example**:
```html
<p>Você se tornou adepto a derrotar conjuradores. Você ganha os seguintes benefícios:</p>
<ul>
  <li>Quando uma criatura a até 5 pés de você conjura uma magia, você pode usar sua reação para realizar um ataque corpo a corpo com arma contra ela.</li>
  <li>Quando você causa dano a uma criatura que está concentrada em uma magia, ela tem desvantagem no teste de resistência para manter a concentração.</li>
</ul>
<p>Veja também: <span data-type="mention" data-id="abc123" data-label="Concentração" data-entity-type="Regra">Concentração</span></p>
```

#### `source` (string, required)
- **Description**: Referência bibliográfica da fonte do talento
- **Constraints**:
  - Mínimo: 1 caractere
  - Máximo: 200 caracteres
  - Trim automático
- **Examples**:
  - "PHB pg. 168"
  - "Xanathar's Guide to Everything pg. 74"
  - "Tasha's Cauldron of Everything"
- **Purpose**: Rastreabilidade e conformidade com material oficial D&D

#### `level` (number, required, default: 1)
- **Description**: Nível mínimo do personagem necessário para escolher este talento
- **Constraints**:
  - Mínimo: 1
  - Máximo: 20
  - Número inteiro (sem casas decimais)
  - Default: 1 (caso não especificado)
- **Semantic**: Representa o nível do **personagem**, não um tier abstrato de poder
- **UI Mapping**: Mapeado para cores de raridade D&D:
  - Níveis 1-3 → Common (cinza)
  - Níveis 4-8 → Uncommon (verde)
  - Níveis 9-13 → Rare (azul)
  - Níveis 14-17 → Very Rare (roxo)
  - Níveis 18-19 → Legendary (âmbar)
  - Nível 20 → Artifact (vermelho)
- **Validation Error**: 400 Bad Request se fora do intervalo 1-20

#### `prerequisites` (string[], optional, default: [])
- **Description**: Lista de pré-requisitos textuais que o personagem deve atender
- **Constraints**:
  - Array de strings
  - Cada string: mínimo 1 caractere
  - Pode ser array vazio
  - Suporta HTML inline com menções (renderizado via MentionContent)
- **Content Format**: Cada item pode conter texto simples ou HTML com menções
- **Examples**:
```json
[
  "Força 13 ou superior",
  "Nível 5",
  "Proficiência em Armaduras Pesadas",
  "Ter <span data-type=\"mention\" data-id=\"xyz789\" data-label=\"Conjuração\" data-entity-type=\"Regra\">Conjuração</span>"
]
```
- **UI Rendering**: 
  - Lista vertical no preview/formulário
  - Nível (se presente) destacado como primeiro item
  - Outras condições listadas

 abaixo com ícones

#### `status` (enum, required, default: "active")
- **Description**: Estado de visibilidade do talento no catálogo
- **Values**:
  - `"active"`: Visível em listagens e busca de menções
  - `"inactive"`: Oculto de listagens públicas, mas preservado no banco
- **Default**: "active"
- **Use Case**: Desativar talentos homebrew ou deprecated sem deletar (preserva menções)

#### `createdAt` (Date, auto)
- **Description**: Timestamp de criação do registro
- **Managed By**: Mongoose `timestamps: true`
- **Timezone**: UTC
- **Format (JSON)**: ISO 8601 string

#### `updatedAt` (Date, auto)
- **Description**: Timestamp da última modificação
- **Managed By**: Mongoose `timestamps: true`
- **Updated On**: POST, PUT operations
- **Timezone**: UTC

---

## Mongoose Schema Definition

```typescript
import mongoose, { Schema, Document, Model } from "mongoose"

export interface IFeat extends Document {
  name: string
  description: string
  source: string
  level: number
  prerequisites: string[]
  status: "active" | "inactive"
  createdAt: Date
  updatedAt: Date
}

const FeatSchema = new Schema<IFeat>(
  {
    name: {
      type: String,
      required: [true, "Nome é obrigatório"],
      unique: true,
      minlength: [3, "Nome deve ter no mínimo 3 caracteres"],
      maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Descrição é obrigatória"],
      minlength: [10, "Descrição deve ter no mínimo 10 caracteres"],
      maxlength: [50000, "Descrição deve ter no máximo 50.000 caracteres"],
    },
    source: {
      type: String,
      required: [true, "Fonte é obrigatória"],
      minlength: [1, "Fonte deve ter no mínimo 1 caractere"],
      maxlength: [200, "Fonte deve ter no máximo 200 caracteres"],
      trim: true,
    },
    level: {
      type: Number,
      required: true,
      default: 1,
      min: [1, "Nível mínimo é 1"],
      max: [20, "Nível máximo é 20"],
      validate: {
        validator: Number.isInteger,
        message: "Nível deve ser um número inteiro",
      },
    },
    prerequisites: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr: string[]) {
          return arr.every((item) => item.trim().length > 0)
        },
        message: "Pré-requisitos não podem ser strings vazias",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive"],
        message: "Status deve ser 'active' ou 'inactive'",
      },
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_, ret) => {
        return {
          ...ret,
          id: String(ret._id),
        }
      },
    },
    toObject: { virtuals: true },
  }
)

// Indexes for performance
FeatSchema.index({ name: "text", description: "text" }) // Full-text search
FeatSchema.index({ status: 1 }) // Filter by status
FeatSchema.index({ level: 1 }) // Filter/sort by level
FeatSchema.index({ createdAt: -1 }) // Sort by creation date

export const Feat: Model<IFeat> = 
  mongoose.models.Feat || mongoose.model<IFeat>("Feat", FeatSchema)
```

---

## Relationships

### Direct Relationships
- **None**: Feats não possuem foreign keys diretas para outras collections
- **Rationale**: Simplicidade do MVP; relacionamentos são implícitos via menções em HTML

### Implicit Relationships (via Mentions System)

#### Feat → Rule (Regra)
- **Type**: Many-to-Many (implicit)
- **Mechanism**: Menções em `description` ou `prerequisites`
- **Example**: Feat "Mage Slayer" menciona regra "Concentração"
- **Query**: Não queryável diretamente (requires parsing HTML)

#### Feat → Trait (Habilidade)
- **Type**: Many-to-Many (implicit)
- **Mechanism**: Menções em `description` ou `prerequisites`
- **Example**: Feat pode mencionar trait "Fúria" (Barbarian)

#### Feat → Feat (self-reference)
- **Type**: Many-to-Many (implicit)
- **Mechanism**: Menções em `description` ou `prerequisites`
- **Example**: Feat "Great Weapon Master" pode mencionar "Power Attack"
- **Note**: Não causam loops infinitos (preview tooltip renderiza apenas 1 nível de profundidade)

### Audit Relationship

#### Feat ← AuditLog
- **Type**: One-to-Many
- **Foreign Key**: `AuditLog.entityId` (string) → `Feat._id`
- **Filter**: `AuditLog.entity === "Feat"`
- **Actions Logged**: CREATE, UPDATE, DELETE
- **Cascade**: Não (audit logs são preservados mesmo após DELETE do feat)

---

## TypeScript Types (Client-Side)

```typescript
// src/features/feats/types/feats.types.ts

export interface Feat {
  _id: string
  name: string
  description: string
  source: string
  level: number
  prerequisites: string[]
  status: "active" | "inactive"
  createdAt: string // ISO 8601
  updatedAt: string
}

export interface CreateFeatInput {
  name: string
  description: string
  source: string
  level?: number // Optional, defaults to 1
  prerequisites?: string[] // Optional, defaults to []
  status: "active" | "inactive"
}

export interface UpdateFeatInput {
  name?: string
  description?: string
  source?: string
  level?: number
  prerequisites?: string[]
  status?: "active" | "inactive"
}

export interface FeatsFilters {
  page?: number
  limit?: number
  search?: string
  searchField?: "all" | "name"
  status?: "all" | "active" | "inactive"
  level?: number // Exact match
  levelMax?: number // Range (1 to levelMax)
}

export interface FeatsResponse {
  items: Feat[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface FeatSearchResult {
  id: string
  label: string
  entityType: "Talento"
}
```

---

## Zod Validation Schemas

```typescript
// src/features/feats/api/validation.ts
import { z } from "zod"

export const createFeatSchema = z.object({
  name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres").max(50000, "Descrição muito longa"),
  source: z.string().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
  level: z.number().int("Nível deve ser número inteiro").min(1, "Nível mínimo é 1").max(20, "Nível máximo é 20").default(1),
  prerequisites: z.array(z.string().min(1, "Pré-requisito não pode ser vazio")).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
})

export const updateFeatSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(50000).optional(),
  source: z.string().min(1).max(200).optional(),
  level: z.number().int().min(1).max(20).optional(),
  prerequisites: z.array(z.string().min(1)).optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

export type CreateFeatSchema = z.infer<typeof createFeatSchema>
export type UpdateFeatSchema = z.infer<typeof updateFeatSchema>
```

---

## Database Indexes Strategy

### Performance Indexes

1. **Text Search Index**
   ```javascript
   { name: "text", description: "text" }
   ```
   - **Purpose**: Full-text search em nome e descrição
   - **Query**: `?search=mage`
   - **Cost**: ~10% storage overhead, worth it para UX

2. **Status Filter Index**
   ```javascript
   { status: 1 }
   ```
   - **Purpose**: Filtrar por active/inactive
   - **Query**: `?status=active`
   - **Cardinality**: Low (apenas 2 valores), mas high query frequency

3. **Level Index**
   ```javascript
   { level: 1 }
   ```
   - **Purpose**: Filtrar por nível exato ou range
   - **Query**: `?level=5` ou `?levelMax=10`
   - **Cardinality**: Medium (20 valores possíveis)

4. **CreatedAt Sort Index**
   ```javascript
   { createdAt: -1 }
   ```
   - **Purpose**: Ordenação padrão (mais recentes primeiro)
   - **Query**: Default sort order na listagem

### Compound Index Consideration
**Decisão**: Não criar compound indexes no MVP
**Rationale**: 
- Dataset estimado: <10k feats (D&D oficial + homebrew)
- Queries são simples (1-2 filtros por vez)
- Single-field indexes são suficientes para escala atual
- Compound indexes podem ser adicionados após análise de slow queries em produção

---

## Data Migration Strategy

### Phase 1: Nenhuma migração necessária
- **Razão**: Feature nova, collection `feats` será criada vazia
- **Initial Seed**: Opcional (carregar feats oficiais do SRD via script)

### Future Migrations
Se houver necessidade de adicionar campos:
```javascript
// Example: Adding "category" field in future
db.feats.updateMany(
  { category: { $exists: false } },
  { $set: { category: "combat" } }
)
```

---

## Data Integrity Rules

### Uniqueness
- **Field**: `name`
- **Enforcement**: MongoDB unique index + API validation
- **Check**: Case-insensitive via `collation: { locale: 'en', strength: 2 }`

### Referential Integrity
- **Mentions**: Soft integrity (HTML não validado contra existência de entidade referenciada)
- **Audit Logs**: Foreign key lógica, mas sem CASCADE DELETE

### Validation Layers
1. **Client-Side**: Zod schema em formulário (React Hook Form)
2. **API Layer**: Zod schema em route handler
3. **Database Layer**: Mongoose schema validators

---

## Storage Estimates

### Per Document
- **Base fields**: ~200 bytes (name, source, level, status, timestamps)
- **Description (average)**: ~2 KB (HTML formatado)
- **Prerequisites (average)**: ~300 bytes (3 itens × 100 chars)
- **MongoDB overhead**: ~100 bytes (ObjectId, indexes)
- **Total per feat**: ~2.6 KB

### Collection Size Estimates
- **1,000 feats**: ~2.6 MB
- **10,000 feats**: ~26 MB (incluindo homebrew community)
- **Indexes**: ~5 MB adicional (20% dos dados)
- **Total**: ~31 MB para dataset completo

**Conclusion**: Very manageable size, no partitioning needed.

---

## Query Performance Expectations

### List Query (with filters)
```javascript
db.feats.find({ status: "active", level: { $lte: 10 } })
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(10)
```
- **Expected Time**: <50ms (com indexes)
- **Dataset**: 10k documents

### Search Query (full-text)
```javascript
db.feats.find({ $text: { $search: "mage" }, status: "active" })
  .limit(10)
```
- **Expected Time**: <100ms (text index overhead)
- **Dataset**: 10k documents

### Single Document (by ID)
```javascript
db.feats.findOne({ _id: ObjectId("...") })
```
- **Expected Time**: <10ms (primary key lookup)

---

## Entity Lifecycle

```
CREATE → Active → (Optional: Inactive) → DELETE
     ↓                    ↓                  ↓
  Audit Log          Audit Log         Audit Log
```

### States
1. **Created (Active)**: Default state após POST
2. **Active**: Visível em listagens e buscas
3. **Inactive**: Oculto mas preservado (opcional)
4. **Deleted**: Removido fisicamente do banco (hard delete no MVP)

### State Transitions
- **Create**: POST /api/feats → status = "active"
- **Deactivate**: PUT /api/feats/[id] → status = "inactive"
- **Reactivate**: PUT /api/feats/[id] → status = "active"
- **Delete**: DELETE /api/feats/[id] → documento removido

---

## Security Considerations

### Input Sanitization
- **HTML**: Tiptap sanitiza automaticamente via DOMPurify
- **XSS Prevention**: CSP headers bloqueiam inline scripts
- **SQL Injection**: N/A (NoSQL, mas Mongoose escapa queries)

### Authorization
- **Read (GET)**: Public (authenticated users)
- **Write (POST/PUT/DELETE)**: Authenticated only (Clerk session check)
- **Future**: Role-based (admins vs regular users)

### Data Privacy
- **PII**: Nenhuma informação pessoal armazenada em Feats
- **Audit Logs**: Vinculam userId do autor, mas não expõem dados sensíveis

---

## Conclusion

O modelo de dados Feat é uma extensão natural do padrão Reference (usado em Rules), adicionando campos específicos de domínio (`level`, `prerequisites`) enquanto mantém 100% de compatibilidade com a arquitetura existente. A escolha de array de strings para `prerequisites` com suporte a menções fornece o equilíbrio ideal entre flexibilidade e usabilidade.

**Schema Validation**: ✅ Ready for implementation  
**Performance**: ✅ Indexes adequados para escala esperada  
**Security**: ✅ Alinhado com práticas do projeto  
**Integration**: ✅ Compatível com sistemas de Audit e Mentions
