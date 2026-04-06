# Data Model: Minhas Fichas — Fichas de Personagem D&D 2024

**Branch**: `005-character-sheets` | **Date**: 2026-03-12

---

## Entities Overview

```
CharacterSheet  ←── CharacterItem     (1:N, via sheetId) ─ references ─▸ [Catalog: Item]
                ←── CharacterSpell    (1:N, via sheetId) ─ references ─▸ [Catalog: Spell]
                ←── CharacterTrait    (1:N, via sheetId) ─ references ─▸ [Catalog: Trait]
                ←── CharacterFeat     (1:N, via sheetId) ─ references ─▸ [Catalog: Feat]
                ←── CharacterAttack   (1:N, via sheetId)
```

Sub-entities are stored as **separate collections** (not embedded) to enable independent CRUD. 

> ⚠️ **Catálogo é somente leitura**: `Item`, `Spell`, `Trait` e `Feat` são entidades já existentes no catálogo da plataforma. A ficha **nunca cria, edita ou deleta** essas entidades. Os modelos de vínculo (`CharacterItem`, `CharacterSpell`, `CharacterTrait`, `CharacterFeat`) apenas armazenam uma referência opcional (`catalogXxxId`) + dados específicos da ficha (quantidade, estado de preparação, origem etc.). O nome/imagem é copiado no momento de adicionar para permitir itens manuais e exibição sem populate.

---

## CharacterSheet

**Collection**: `character_sheets`  
**File**: `src/features/character-sheets/models/character-sheet.ts`

### Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | MongoDB ID |
| `slug` | string | yes | — | Unique URL slug: `{id}-{kebab-name}` (or just `{id}` if no name) |
| `userId` | string | yes | — | Clerk user ID (owner); list restricted to owner; page open to anyone with link |
| **Identity** | | | | |
| `name` | string | no | `""` | Character name |
| `class` | string | no | `""` | Class name (text or from catalog) |
| `classRef` | ObjectId ref `classes` | no | null | Optional link to Class catalog |
| `subclass` | string | no | `""` | Subclass name |
| `subclassRef` | ObjectId ref `classes` | no | null | Subclass reference (embedded in Class) |
| `level` | number | no | 1 | Character level (1–20) |
| `race` | string | no | `""` | Race/species name |
| `raceRef` | ObjectId ref `races` | no | null | Optional link to Race catalog |
| `origin` | string | no | `""` | Background/origin name |
| `originRef` | ObjectId ref `backgrounds` | no | null | Optional link to Background catalog |
| `inspiration` | boolean | no | `false` | Inspiration flag |
| `multiclassNotes` | string | no | `""` | Free text for manual multiclass notes |
| **Appearance** | | | | |
| `photo` | string | no | null | S3 URL of character photo |
| `age` | string | no | `""` | Age (free text) |
| `height` | string | no | `""` | Height (free text) |
| `weight` | string | no | `""` | Weight (free text) |
| `eyes` | string | no | `""` | Eye color |
| `skin` | string | no | `""` | Skin color |
| `hair` | string | no | `""` | Hair description |
| `appearance` | string | no | `""` | General appearance description |
| **Attributes** | | | | |
| `strength` | number | no | 10 | Força (1–30) |
| `dexterity` | number | no | 10 | Destreza (1–30) |
| `constitution` | number | no | 10 | Constituição (1–30) |
| `intelligence` | number | no | 10 | Inteligência (1–30) |
| `wisdom` | number | no | 10 | Sabedoria (1–30) |
| `charisma` | number | no | 10 | Carisma (1–30) |
| **Proficiencies** | | | | |
| `proficiencyBonusOverride` | number | no | null | Manual override; null = auto from level |
| `savingThrows` | object | no | all false | `{ strength, dexterity, constitution, intelligence, wisdom, charisma }: boolean` |
| `skills` | object | no | see below | Map of skill name → `{ proficient: bool, expertise: bool, override?: number }` |
| **Combat** | | | | |
| `movementSpeed` | number | no | null | Deslocamento in meters |
| `hpMax` | number | no | null | HP máximo (manual) |
| `hpCurrent` | number | no | null | HP atual |
| `hpTemp` | number | no | 0 | HP temporário |
| `hitDiceTotal` | string | no | `""` | Ex: `"1d10"` |
| `hitDiceUsed` | number | no | 0 | Dados de vida usados |
| `deathSavesSuccess` | number | no | 0 | Testes de morte — sucessos (0–3) |
| `deathSavesFailure` | number | no | 0 | Testes de morte — falhas (0–3) |
| `armorClassOverride` | number | no | null | Override CA; null = `10 + DEX mod` |
| `initiativeOverride` | number | no | null | Override iniciativa; null = DEX mod |
| `passivePerceptionOverride` | number | no | null | Override; null = `10 + Percepção` |
| **Spellcasting** | | | | |
| `spellcastingAttribute` | string | no | null | Ex: `"Inteligência"` |
| `spellSaveDCOverride` | number | no | null | Override CD; null = auto |
| `spellAttackBonusOverride` | number | no | null | Override bônus ataque; null = auto |
| `spellSlots` | object | no | `{}` | `{ "1": { total: 2, used: 0 }, ... }` (nível 1–9) |
| **Currency** | | | | |
| `coins` | object | no | all 0 | `{ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }` |
| **Personality** | | | | |
| `personalityTraits` | string | no | `""` | Traços de personalidade |
| `ideals` | string | no | `""` | Ideais |
| `bonds` | string | no | `""` | Vínculos |
| `flaws` | string | no | `""` | Falhas |
| **Notes** | | | | |
| `notes` | string | no | `""` | Notas livres |
| **Timestamps** | | | | |
| `createdAt` | Date | auto | — |  |
| `updatedAt` | Date | auto | — | Used for `updatedAt DESC` sort |

### Skills Map Keys (18 perícias D&D 2024 PT-BR)
```
Acrobacia, Arcanismo, Atletismo, Atuação, Enganação,
Furtividade, História, Intimidação, Intuição,
Investigação, "Lidar com Animais", Medicina, Natureza,
Percepção, Persuasão, Prestidigitação, Religião, Sobrevivência
```

### Indexes
- `userId` (for fetching user's sheets)
- `slug` (unique, for route lookups)
- `updatedAt` (for default sort)

### Validation Rules
- `slug`: unique, required on creation
- `level`: integer, 1–20
- `strength/dexterity/constitution/intelligence/wisdom/charisma`: integer, 1–30
- `deathSavesSuccess/Failure`: integer, 0–3
- `hitDiceUsed`: integer ≥ 0
- `spellSlots.*.total/used`: integer ≥ 0

---

## CharacterItem

**Collection**: `character_items`  
**File**: `src/features/character-sheets/models/character-item.ts`  
**Catalog entity**: read-only ref to `Item`; never modified through sheet API

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `sheetId` | ObjectId ref `character_sheets` | yes | — | Parent sheet |
| `catalogItemId` | ObjectId ref `items` | no | null | Optional ref to catalog Item (null for manual items) |
| `name` | string | yes | — | Copied from catalog on add, or typed manually |
| `image` | string | no | null | Copied from catalog on add, or null for manual |
| `quantity` | number | no | 1 | Character-specific: item quantity |
| `notes` | string | no | `""` | Character-specific: item notes |
| `createdAt` | Date | auto | — | |

**Indexes**: `sheetId`

---

## CharacterSpell

**Collection**: `character_spells`  
**File**: `src/features/character-sheets/models/character-spell.ts`  
**Catalog entity**: read-only ref to `Spell`; never modified through sheet API

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `sheetId` | ObjectId ref `character_sheets` | yes | — | |
| `catalogSpellId` | ObjectId ref `spells` | no | null | Optional ref to catalog Spell (null for manual spells) |
| `name` | string | yes | — | Copied from catalog on add, or typed manually |
| `circle` | number | no | 0 | Copied from catalog on add |
| `school` | string | no | `""` | Copied from catalog on add |
| `image` | string | no | null | Copied from catalog on add, or null |
| `prepared` | boolean | no | `false` | Character-specific: preparation state |
| `components` | string[] | no | `[]` | Copied from catalog on add |
| `createdAt` | Date | auto | — | |

**Indexes**: `sheetId`

---

## CharacterTrait

**Collection**: `character_traits`  
**File**: `src/features/character-sheets/models/character-trait.ts`  
**Catalog entity**: read-only ref to `Trait`; never modified through sheet API

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `sheetId` | ObjectId ref `character_sheets` | yes | — | |
| `catalogTraitId` | ObjectId ref `traits` | no | null | Optional ref to catalog Trait (null for manual traits) |
| `name` | string | yes | — | Copied from catalog on add, or typed manually |
| `description` | string | no | `""` | Copied from catalog on add, or typed manually |
| `origin` | enum | yes | `"manual"` | `"class"` \| `"race"` \| `"background"` \| `"manual"` — character-specific |
| `createdAt` | Date | auto | — | |

**Origin → Section mapping**:
- `class` → "Características de Classe"
- `race` → "Características Raciais"
- `background` or `manual` → "Habilidades"

**Indexes**: `sheetId`, `origin`

---

## CharacterFeat

**Collection**: `character_feats`  
**File**: `src/features/character-sheets/models/character-feat.ts`  
**Catalog entity**: read-only ref to `Feat`; never modified through sheet API

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `sheetId` | ObjectId ref `character_sheets` | yes | — | |
| `catalogFeatId` | ObjectId ref `feats` | no | null | Optional ref to catalog Feat (null for manual feats) |
| `name` | string | yes | — | Copied from catalog on add, or typed manually |
| `description` | string | no | `""` | Copied from catalog on add, or typed manually |
| `levelAcquired` | number | no | null | Character-specific: level at which feat was acquired |
| `createdAt` | Date | auto | — | |

**Indexes**: `sheetId`

---

## CharacterAttack

**Collection**: `character_attacks`  
**File**: `src/features/character-sheets/models/character-attack.ts`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `sheetId` | ObjectId ref `character_sheets` | yes | — | |
| `name` | string | yes | — | Attack name |
| `attackBonus` | string | no | `""` | Attack bonus (ex: "+5") |
| `damage` | string | no | `""` | Damage expression (ex: "1d6+3 cortante") |
| `damageType` | string | no | `""` | Damage type |
| `createdAt` | Date | auto | — | |

**Indexes**: `sheetId`

---

## Derived / Calculated Values (NOT stored — computed client-side)

These values are computed by `useCharacterCalculations` hook and never persisted, UNLESS the user overrides them manually (stored as `*Override` fields):

| Derived Field | Formula | Override Field |
|---|---|---|
| Modificador de Força | `floor((strength - 10) / 2)` | — |
| Modificador de Destreza | `floor((dexterity - 10) / 2)` | — |
| Modificador de Constituição | `floor((constitution - 10) / 2)` | — |
| Modificador de Inteligência | `floor((intelligence - 10) / 2)` | — |
| Modificador de Sabedoria | `floor((wisdom - 10) / 2)` | — |
| Modificador de Carisma | `floor((charisma - 10) / 2)` | — |
| Bônus de Proficiência | Tabela nível 1-20 | `proficiencyBonusOverride` |
| Classe de Armadura | `10 + DEX mod` | `armorClassOverride` |
| Iniciativa | `DEX mod` | `initiativeOverride` |
| Percepção Passiva | `10 + Percepção bonus` | `passivePerceptionOverride` |
| CD de Resistência | `8 + profBonus + modConjuração` | `spellSaveDCOverride` |
| Bônus de Ataque de Magia | `profBonus + modConjuração` | `spellAttackBonusOverride` |
| Perícias (valor final) | `modAtrib + (prof ? profBonus : 0) + (exp ? profBonus : 0)` | `skills[x].override` |
| Salvaguardas (valor final) | `modAtrib + (prof ? profBonus : 0)` | — |

---

## State Transitions

### Sheet Visibility
```
privada (default) ──toggle──▶ pública
pública ──toggle──▶ privada
```

### Long Rest
```
hpCurrent → hpMax
spellSlots[n].used → 0 (for all n)
hitDiceUsed → 0
```

### Level Up (via wizard)
```
level → level + 1
proficiencyBonus → recalculated
spellSlots → updated per class table
traits/feats → new items added
```
