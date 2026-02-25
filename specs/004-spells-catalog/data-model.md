# Data Model: Catálogo de Magias D&D

**Feature**: 004-spells-catalog  
**Date**: 2026-02-25  
**Phase**: 1 - Design & Contracts  

## Overview

This document defines the data model for the D&D Spells Catalog feature, including entity schemas, relationships, validation rules, and database indexes. The model follows established patterns from Rules and Feats features while introducing spell-specific structures (DiceValue, SpellSchool).

---

## Core Entities

### 1. Spell (Magia)

**Purpose**: Represents a D&D spell with mechanical properties, description, and metadata.

**Mongoose Schema** (`src/features/spells/models/spell.ts`):

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface DiceValue {
  quantidade: number;  // Positive integer, no upper limit
  tipo: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
}

export type SpellSchool = 
  | 'Abjuração'
  | 'Adivinhação'
  | 'Conjuração'
  | 'Encantamento'
  | 'Evocação'
  | 'Ilusão'
  | 'Necromancia'
  | 'Transmutação';

export type AttributeType = 
  | 'Força'
  | 'Destreza'
  | 'Constituição'
  | 'Inteligência'
  | 'Sabedoria'
  | 'Carisma';

export interface ISpell extends Document {
  _id: string;
  name: string;                         // Spell name (unique)
  description: string;                  // Rich HTML (TipTap output with mentions)
  circle: number;                       // 0-9 (0 = Truque/Cantrip)
  school: SpellSchool;                  // One of 8 D&D schools
  saveAttribute?: AttributeType;        // Optional - saving throw attribute
  baseDice?: DiceValue;                 // Optional - base damage dice
  extraDicePerLevel?: DiceValue;        // Optional - dice added per spell slot level above base
  source: string;                       // Free text (e.g., "PHB pg. 230", "Homebrew")
  status: 'active' | 'inactive';        // Admin toggle
  createdAt: Date;
  updatedAt: Date;
}

const DiceValueSchema = new Schema<DiceValue>(
  {
    quantidade: {
      type: Number,
      required: true,
      min: [1, 'Quantidade de dados deve ser pelo menos 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantidade deve ser um número inteiro',
      },
    },
    tipo: {
      type: String,
      required: true,
      enum: {
        values: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'],
        message: '{VALUE} não é um tipo de dado válido',
      },
    },
  },
  { _id: false } // Embedded document, no separate _id
);

const SpellSchema = new Schema<ISpell>(
  {
    name: {
      type: String,
      required: [true, 'Nome da magia é obrigatório'],
      trim: true,
      minlength: [2, 'Nome deve ter pelo menos 2 caracteres'],
      maxlength: [100, 'Nome deve ter no máximo 100 caracteres'],
      index: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Descrição é obrigatória'],
      minlength: [10, 'Descrição deve ter pelo menos 10 caracteres'],
      maxlength: [10000, 'Descrição deve ter no máximo 10000 caracteres'],
    },
    circle: {
      type: Number,
      required: [true, 'Círculo é obrigatório'],
      min: [0, 'Círculo deve ser entre 0 (truque) e 9'],
      max: [9, 'Círculo deve ser entre 0 (truque) e 9'],
      index: true,
    },
    school: {
      type: String,
      required: [true, 'Escola de magia é obrigatória'],
      enum: {
        values: [
          'Abjuração',
          'Adivinhação',
          'Conjuração',
          'Encantamento',
          'Evocação',
          'Ilusão',
          'Necromancia',
          'Transmutação',
        ],
        message: '{VALUE} não é uma escola de magia válida',
      },
      index: true,
    },
    saveAttribute: {
      type: String,
      required: false,
      enum: {
        values: ['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'],
        message: '{VALUE} não é um atributo válido',
      },
      index: true,
    },
    baseDice: {
      type: DiceValueSchema,
      required: false,
    },
    extraDicePerLevel: {
      type: DiceValueSchema,
      required: false,
    },
    source: {
      type: String,
      required: false,
      trim: true,
      maxlength: [200, 'Fonte deve ter no máximo 200 caracteres'],
      default: '',
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['active', 'inactive'],
        message: '{VALUE} não é um status válido',
      },
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'spells',
  }
);

// Indexes for common queries
SpellSchema.index({ name: 'text', description: 'text' }); // Full-text search
SpellSchema.index({ circle: 1, school: 1 }); // Filter by circle + school
SpellSchema.index({ school: 1, status: 1 }); // Filter by school + status
SpellSchema.index({ 'baseDice.tipo': 1 }); // Filter by dice type
SpellSchema.index({ saveAttribute: 1, status: 1 }); // Filter by save attribute
SpellSchema.index({ status: 1, createdAt: -1 }); // Admin list all, sorted

// Virtual for display
SpellSchema.virtual('circleLabel').get(function () {
  return this.circle === 0 ? 'Truque' : `${this.circle}º Círculo`;
});

// Ensure virtuals are included in JSON
SpellSchema.set('toJSON', { virtuals: true });
SpellSchema.set('toObject', { virtuals: true });

export const Spell = mongoose.models.Spell || mongoose.model<ISpell>('Spell', SpellSchema);
export default Spell;
```

---

### 2. TypeScript Types

**File**: `src/features/spells/types/spells.types.ts`

```typescript
// Base entity (matches Mongoose document)
export interface Spell {
  _id: string;
  name: string;
  description: string; // HTML string from TipTap
  circle: number; // 0-9
  school: SpellSchool;
  saveAttribute?: AttributeType;
  baseDice?: DiceValue;
  extraDicePerLevel?: DiceValue;
  source: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  circleLabel?: string; // Virtual from Mongoose
}

// Dice value structure
export interface DiceValue {
  quantidade: number;
  tipo: DiceType;
}

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

// Spell schools (8 D&D 5e schools)
export type SpellSchool =
  | 'Abjuração'
  | 'Adivinhação'
  | 'Conjuração'
  | 'Encantamento'
  | 'Evocação'
  | 'Ilusão'
  | 'Necromancia'
  | 'Transmutação';

// D&D attributes (for save throws)
export type AttributeType =
  | 'Força'
  | 'Destreza'
  | 'Constituição'
  | 'Inteligência'
  | 'Sabedoria'
  | 'Carisma';

// API input types
export interface CreateSpellInput {
  name: string;
  description: string;
  circle: number;
  school: SpellSchool;
  saveAttribute?: AttributeType;
  baseDice?: DiceValue;
  extraDicePerLevel?: DiceValue;
  source?: string;
  status: 'active' | 'inactive';
}

export interface UpdateSpellInput {
  name?: string;
  description?: string;
  circle?: number;
  school?: SpellSchool;
  saveAttribute?: AttributeType | null; // null to clear
  baseDice?: DiceValue | null;
  extraDicePerLevel?: DiceValue | null;
  source?: string;
  status?: 'active' | 'inactive';
}

// Filter types
export interface SpellsFilters {
  search?: string;
  circles?: number[]; // Multi-select: [0, 1, 3] for Truque, 1º, 3º
  schools?: SpellSchool[]; // Multi-select: ["Evocação", "Abjuração"]
  saveAttributes?: AttributeType[]; // Multi-select
  diceTypes?: DiceType[]; // Multi-select: ["d6", "d8"]
  status?: 'all' | 'active' | 'inactive'; // Admin-only filter
}

// API response types
export interface SpellsListResponse {
  spells: Spell[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SpellResponse {
  spell: Spell;
}
```

---

### 3. Validation Schemas (Zod)

**File**: `src/features/spells/api/validation.ts`

```typescript
import { z } from 'zod';

// Dice value schema
export const diceValueSchema = z.object({
  quantidade: z.number().int().positive({ message: 'Quantidade deve ser um número positivo' }),
  tipo: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'], { message: 'Tipo de dado inválido' }),
});

// Create spell schema
export const createSpellSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  description: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres').max(10000, 'Descrição muito longa'),
  circle: z.number().int().min(0, 'Círculo mínimo é 0 (truque)').max(9, 'Círculo máximo é 9'),
  school: z.enum(['Abjuração', 'Adivinhação', 'Conjuração', 'Encantamento', 'Evocação', 'Ilusão', 'Necromancia', 'Transmutação'], {
    message: 'Escola inválida',
  }),
  saveAttribute: z.enum(['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma']).optional(),
  baseDice: diceValueSchema.optional(),
  extraDicePerLevel: diceValueSchema.optional(),
  source: z.string().max(200, 'Fonte muito longa').optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

// Update spell schema (all fields optional)
export const updateSpellSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().min(10).max(10000).optional(),
  circle: z.number().int().min(0).max(9).optional(),
  school: z.enum(['Abjuração', 'Adivinhação', 'Conjuração', 'Encantamento', 'Evocação', 'Ilusão', 'Necromancia', 'Transmutação']).optional(),
  saveAttribute: z.enum(['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma']).nullable().optional(),
  baseDice: diceValueSchema.nullable().optional(),
  extraDicePerLevel: diceValueSchema.nullable().optional(),
  source: z.string().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// Query/filter schema
export const spellsQuerySchema = z.object({
  search: z.string().optional(),
  circles: z.array(z.number().int().min(0).max(9)).optional(),
  schools: z.array(z.string()).optional(),
  saveAttributes: z.array(z.string()).optional(),
  diceTypes: z.array(z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'])).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

// Type exports
export type CreateSpellSchema = z.infer<typeof createSpellSchema>;
export type UpdateSpellSchema = z.infer<typeof updateSpellSchema>;
export type SpellsQuerySchema = z.infer<typeof spellsQuerySchema>;
```

---

## Relationships

### 1. Spell → User (via Audit Log)

**Relationship**: Many-to-One (tracked via audit logs, not direct foreign key)

```typescript
// Audit log entry when spell is created/updated/deleted
{
  action: "CREATE" | "UPDATE" | "DELETE",
  entity: "Spell",
  entityId: spell._id,
  performedBy: user.clerkId,
  performedByUser: { ...user details },
  previousData: { ...old spell data }, // UPDATE/DELETE only
  newData: { ...new spell data },      // CREATE/UPDATE only
  createdAt: timestamp
}
```

**Use case**: Track who created/modified spells; display in audit log table and detail modal.

### 2. Spell → Mentions (Cross-Entity References)

**Relationship**: Many-to-Many (via mention system in rich text descriptions)

```typescript
// Example: Spell description mentions a Rule
{
  _id: "spell123",
  name: "Fireball",
  description: `<p>...deals fire damage. See <mention type="Regra" id="rule456">@Area of Effect</mention> for targeting rules.</p>`,
  // ...
}
```

**Use case**: Navigate from spell description to referenced rules, traits, feats, or other spells.

**Reverse lookup** (findMentions):

```typescript
// Find all spells that mention a specific entity
const spellsMentioningRule = await Spell.find({
  description: { $regex: `id="${ruleId}"` } // Simplified; actual impl uses mention parsing
});
```

### 3. Spell → Dashboard Card (Aggregation)

**Relationship**: None (aggregate query)

```typescript
// Dashboard card shows total spell count
const totalSpells = await Spell.countDocuments({ status: 'active' });
const spellsByCircle = await Spell.aggregate([
  { $match: { status: 'active' } },
  { $group: { _id: '$circle', count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);
```

**Use case**: Display spell statistics on dashboard.

---

## Indexes

Optimized for common query patterns:

| Index | Fields | Purpose | Type |
|-------|--------|---------|------|
| Primary Key | `_id` | Document identity | Default |
| Unique Name | `name` | Ensure unique spell names | Unique |
| Text Search | `name, description` | Full-text search | Text |
| Circle | `circle` | Filter by spell level | Single |
| School | `school` | Filter by school | Single |
| Status | `status` | Admin filter active/inactive | Single |
| Save Attribute | `saveAttribute` | Filter by save throw | Single |
| Compound: Circle+School | `circle, school` | Combined filters | Compound |
| Compound: School+Status | `school, status` | School filter (hide inactive for users) | Compound |
| Compound: Status+CreatedAt | `status, createdAt` | Admin list sorted by date | Compound |
| Dice Type | `baseDice.tipo` | Filter by dice type (embedded) | Single |

**Performance targets**:
- List queries (<500ms): Covered by status+createdAt index
- Text search (<300ms): Covered by text index on name+description
- Filter combinations (<500ms): Covered by compound indexes

---

## Validation Rules

### Field-Level Validation

| Field | Rules | Error Messages |
|-------|-------|----------------|
| `name` | Required, 2-100 chars, unique, trimmed | "Nome é obrigatório", "Nome deve ter entre 2-100 caracteres", "Nome já existe" |
| `description` | Required, 10-10000 chars | "Descrição é obrigatória", "Descrição deve ter entre 10-10000 caracteres" |
| `circle` | Required, integer 0-9 | "Círculo é obrigatório", "Círculo deve ser entre 0 (truque) e 9" |
| `school` | Required, enum (8 schools) | "Escola é obrigatória", "Escola inválida" |
| `saveAttribute` | Optional, enum (6 attributes) | "Atributo inválido" |
| `baseDice.quantidade` | Optional, integer >0 | "Quantidade deve ser um número inteiro positivo" |
| `baseDice.tipo` | Optional, enum (6 dice types) | "Tipo de dado inválido" |
| `extraDicePerLevel.quantidade` | Optional, integer >0 | "Quantidade deve ser um número inteiro positivo" |
| `extraDicePerLevel.tipo` | Optional, enum (6 dice types) | "Tipo de dado inválido" |
| `source` | Optional, max 200 chars, trimmed | "Fonte muito longa" |
| `status` | Required, enum (active/inactive) | "Status inválido" |

### Business Logic Validation

1. **Admin-Only Writes**: Only users with `role: "admin"` can create/update/delete spells
   - Enforced in API routes via `requireAdmin()` middleware
   - Error: `403 Forbidden - Admin access required`

2. **Unique Name**: No two spells can have the same name
   - Enforced by MongoDB unique index
   - Error: `400 Bad Request - Spell name already exists`

3. **Consistent Dice Structure**: If `baseDice` is provided, both `quantidade` and `tipo` must be present
   - Enforced by Zod schema (object with required fields)
   - Error: `400 Bad Request - Dice value must include quantidade and tipo`

4. **Optional Fields**: `saveAttribute`, `baseDice`, `extraDicePerLevel`, `source` can be null/undefined
   - Empty states handled in UI (display "—" or "Nenhum")

### Audit Trail Validation

Every CREATE/UPDATE/DELETE must generate audit log:

```typescript
// After successful spell mutation
await AuditLogExtended.create({
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entity: 'Spell',
  entityId: spell._id.toString(),
  performedBy: user.clerkId,
  performedByUser: {
    _id: user.clerkId,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
  },
  previousData: action === 'UPDATE' || action === 'DELETE' ? oldSpell : undefined,
  newData: action === 'CREATE' || action === 'UPDATE' ? newSpell : undefined,
});
```

**Validation**: Audit entry creation failure should NOT fail the main operation (log error, continue).

---

## Data Migration

### Initial Seed Data

Optional: Seed with ~20 common D&D spells for testing/demo:

```typescript
// scripts/seed-spells.ts
const sampleSpells = [
  {
    name: 'Bola de Fogo',
    description: '<p>Uma explosão de fogo detona em um ponto à sua escolha...</p>',
    circle: 3,
    school: 'Evocação',
    saveAttribute: 'Destreza',
    baseDice: { quantidade: 8, tipo: 'd6' },
    extraDicePerLevel: { quantidade: 1, tipo: 'd6' },
    source: 'PHB pg. 241',
    status: 'active',
  },
  // ... 19 more spells
];
```

**NOT required for MVP** - admins can manually create spells.

### Future Migrations

If schema changes (e.g., add `components: { verbal, somatic, material }` field):

```typescript
// migrations/002-add-spell-components.ts
await Spell.updateMany({}, {
  $set: { components: { verbal: true, somatic: true, material: false } }
});
```

Follow migration pattern if established in project (currently no migration system detected).

---

## State Transitions

### Spell Status Lifecycle

```
[NEW] --create--> [ACTIVE] <--toggle--> [INACTIVE] --delete--> [DELETED]
  |                  ^                       |                      |
  |                  |                       v                      |
  |                  +------update (preserve status)-------+        |
  |                                                                 |
  +------------------------permanently removed from DB--------------+
```

**States**:
- **NEW**: Form data, not yet saved
- **ACTIVE**: Live spell, visible to all users
- **INACTIVE**: Hidden from non-admin users, visible to admins (for review/update before re-activating)
- **DELETED**: Removed from database (audit log preserves previousData)

**Triggers**:
- `CREATE`: Admin saves new spell → status defaults to "active"
- `TOGGLE`: Admin changes status in form or via quick toggle → updates spell.status
- `UPDATE`: Admin edits spell → preserves existing status unless explicitly changed
- `DELETE`: Admin confirms deletion → removes document, creates audit log

---

## Query Patterns

### Common Queries

**1. List Active Spells (Paginated)**
```typescript
const spells = await Spell.find({ status: 'active' })
  .sort({ name: 1 })
  .limit(10)
  .skip((page - 1) * 10)
  .lean();
const total = await Spell.countDocuments({ status: 'active' });
```

**2. Filter by Circle + School**
```typescript
const spells = await Spell.find({
  status: 'active',
  circle: { $in: [3, 4, 5] }, // 3º, 4º, 5º círculo
  school: { $in: ['Evocação', 'Abjuração'] }
})
  .sort({ circle: 1, name: 1 })
  .lean();
```

**3. Full-Text Search**
```typescript
const spells = await Spell.find({
  status: 'active',
  $text: { $search: query }
}, {
  score: { $meta: 'textScore' }
})
  .sort({ score: { $meta: 'textScore' } })
  .limit(20)
  .lean();
```

**4. Filter by Dice Type**
```typescript
const spells = await Spell.find({
  status: 'active',
  'baseDice.tipo': { $in: ['d6', 'd8'] }
})
  .sort({ name: 1 })
  .lean();
```

**5. Get Single Spell (with Virtuals)**
```typescript
const spell = await Spell.findById(id);
// spell.circleLabel = "3º Círculo" (virtual)
```

**6. Admin List All (Including Inactive)**
```typescript
const spells = await Spell.find({})
  .sort({ status: 1, createdAt: -1 }) // Active first, then by date
  .lean();
```

---

## Performance Considerations

- **Indexes**: All filter fields indexed (see Indexes section)
- **Lean Queries**: Use `.lean()` for read-only data (50% faster, no Mongoose overhead)
- **Pagination**: Always paginate lists (default 10 items, max 100)
- **Text Search**: Limit to 20-50 results max; suggest refinements for large result sets
- **Caching**: TanStack Query caches client-side (5min default); consider server-side cache for high traffic
- **Audit Log Overhead**: Async write to audit log (don't block main operation)

---

## Summary

- **1 primary entity**: Spell
- **2 embedded structures**: DiceValue (for baseDice, extraDicePerLevel)
- **3 enums**: SpellSchool (8 values), AttributeType (6 values), DiceType (6 values)
- **8 indexes**: Primary + Unique Name + Text + 5 filter indexes
- **Validation**: Mongoose + Zod at API boundary
- **Relationships**: Audit logs (many-to-one via logs), Mentions (many-to-many via rich text)
- **Patterns**: Mirrors Rules/Feats structure for consistency

Next: Generate API contracts (contracts/spells.yaml) and quickstart guide.
