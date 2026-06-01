# Monsters Module (Monstros + Meus NPCs)

**Feature**: Catálogo de Monstros D&D 5e + NPCs do usuário  
**Entity Types**: Monstro, NPC  
**Color Theme**: Artifact/Red  
**Icon**: Skull

## Overview

The Monsters module manages D&D 5e monster and NPC stat blocks with CRUD, dashboard stats, global search, rich previews, audit logs, and table/list catalog views. It also hosts a user-scoped "Meus NPCs" section where authenticated users create and manage personal NPCs using the same data model.

## Features

- Os componentes de UI de monstros foram extraídos para versões generalizadas reutilizadas em ambas as seções (catálogo de monstros e Meus NPCs): `NpcFormModal`, `NpcPreview`, `NpcsTable`, `DeleteNpcDialog`. Os componentes `MonsterFormModal`, `MonsterPreview`, `MonstersTable`, `DeleteMonsterDialog` são agora thin wrappers que delegam para os genéricos.
- "Meus NPCs" é uma seção autenticada acessível pelo sidebar em `/my-npcs`. Usuários criam NPCs vinculados à conta via `UserNpcFormModal`, usando o mesmo formulário de monstros com `sourceDefault="Homebrew"`. Não tem botão "Gerar com IA" nem restrição de admin.
- O modelo `UserNpc` (coleção `user_npcs`) compartilha o mesmo schema do `Monster` e adiciona campo `userId` obrigatório com índice composto único `{userId, name}` (nomes únicos por usuário).
- O formulário de monstros agora reutiliza o `GlassImageUploader` com geração de arte por IA no empty state e na preview já preenchida. A ação envia o JSON inteiro do monstro para `POST /api/core/ai/image`, usa um prompt especializado em estética oficial de D&D com preferência por 1:1 e preenche o campo `image` com a URL persistida no bucket.
- Admins podem usar `Gerar com IA` nos menus de monstros da tabela, da lista em cards e do preview tooltip. A ação usa `EntityGenerationAIModal` com `monsterGenerationAdapter`, progresso via Pusher, candidatos dos arquivos `bestiary-*.json`/`fluff-bestiary-*.json`/`legendarygroups.json`, tradução com `GenAITranslator` no modelo `gemini-3.1-flash-lite` e comparação de nome, fonte, imagem, resumo, descrição, características e ações. Quando o fluff da fonte não traz imagem, o candidato recebe uma arte gerada por IA pelo serviço compartilhado de imagem antes de aparecer no comparador. Ao salvar, `/api/admin/entity-generation/monsters/[id]/apply` sobrescreve o stat block pelo candidato e grava audit log como `Monstro`.
- Adds `Monstros` to the expandable sidebar catalog navigation, pointing to `/monsters`. Adds `Meus NPCs` (authenticated only) pointing to `/my-npcs`.
- Monster form classification autocompletes fill their row, numeric combat fields use immediate masks, optional speeds can be added as empty fields, and list custom values render beside the section title.
- Challenge Rating uses the same masked field style as combat numbers, preserving string CR values with `/` and `-` while keeping XP/proficiency derivation safe for intermediate input.
- New monsters show an empty Challenge Rating field; submit normalizes an empty CR to `"0"` before deriving XP and saving.
- Monster previews render type before size, compact stat cards with inline labels, CR with XP beside it, full attribute names with modifier-first values, and colored damage words in NPC hit rolls.
- Monster mention autocomplete rows show CR and localized monster type metadata, and mention hover previews load the full stat block from `/api/monsters/[id]` before rendering `MonsterPreview`.
- Monster catalog results are sorted alphabetically by name and both list and table views consume the same infinite query; the table loads additional pages through an intersection sentinel.
- Monster tables render the monster image in the first column when available, falling back to the skull icon otherwise; table CA and PV are shown in separate columns, and both table and preview show the derived average PV for numeric or simple dice formulas rounded down while preserving the original formula when applicable.
- Monster preview defenses render localized, capitalized Portuguese damage labels separated by commas while preserving internal damage keys.
- Monster seed data imports every `bestiary-*.json` file under `src/lib/5etools-data/bestiary/`, pairs each source with `fluff-bestiary-*.json` when present, always loads `legendarygroups.json` separately, and translates special textual AC/PV seed values when they contain prose; manual form input for AC remains numeric.
- Bestiary seed translation retries transient invalid/truncated GenAI JSON before failing, so long monster entries can resume without manual data changes.
- O filtro compartilhado de fontes consome `GET /api/sources?entity=monsters`, exibe nomes completos canônicos no multiselect e expande aliases legados (`LDM`, `XMM`, etc.) no matching do backend para continuar encontrando registros antigos.

Core behavior:
- Browse monsters with search, type, size, challenge rating, source, and status filters.
- Create/edit/delete monsters through a glass modal matching the items catalog style.
- Store structured combat stats, attributes, saving throws, skills, senses, defenses, and stat-block action sections.
- Render monsters through the shared entity renderer, floating windows, generic entity pages, and global search; partial global-search results fetch the full monster before preview rendering.

## Data Model

Main fields:
- `name`, `originalName`, `source`, `description`, `image`, `status`
- `type`, `size`, `alignment`
- `armorClass` as a flexible string, `initiative`, `hitPointsFormula`
- `speed`, `flySpeed`, `swimSpeed`, `climbSpeed`
- `attributes`, `savingThrows`, `skills`, `senses`
- `challengeRating`, `experience`, `experienceOverride`, `proficiencyBonusOverride`
- `languages`
- `damageVulnerabilities`, `damageResistances`, `damageImmunities`
- `conditionImmunities`, `conditionImmunityNotes`
- `traits`, `actions`, `bonusActions`, `reactions`, `legendaryActions`, `lairActions`, `regionalEffects`

`NpcParam` is reused by stat-block sections and contains:
- `label`
- `description` as rich HTML
- optional `attackRoll`
- optional `hitRoll`
- optional `usage`
- optional `recharge`

## Derived Rules

Challenge rating drives default XP and proficiency bonus through `monster-calculations.ts`.
Seeded monsters with missing CR are normalized to `"0"` for XP/proficiency derivation.

Overrides:
- `experienceOverride` replaces derived XP.
- `proficiencyBonusOverride` replaces derived proficiency bonus.
- Saving throws and skills derive from attributes plus proficiency, but each entry supports numeric `override`.
- Passive perception derives from Percepção unless `senses.passivePerception` is set.

## API

### Monsters (catálogo admin)
Routes:
- `GET /api/monsters`
- `POST /api/monsters`
- `GET /api/monsters/[id]`
- `PUT /api/monsters/[id]`
- `DELETE /api/monsters/[id]`
- `GET /api/monsters/search`
- `GET /api/stats/monsters`
- `GET /api/sources?entity=monsters`

Mutations require Clerk auth and create audit logs with `entity: "Monstro"`.

### NPCs do usuário
Routes:
- `GET /api/npcs` — auth required, returns only NPCs of the authenticated user
- `POST /api/npcs` — auth required, attaches `userId` to the NPC
- `GET /api/npcs/[id]` — ownership check
- `PUT /api/npcs/[id]` — ownership check
- `DELETE /api/npcs/[id]` — ownership check

List filters: `search`, `type`, `size`, `challengeRating`, `status`, `page`, `limit`  
No `sources` filter (source is user-defined, not catalog-based).

## UI

### Generalized components (shared by monsters + NPCs)
- `NpcFormModal` — full stat block form, accepts `onSave`/`isSubmitting` props
- `NpcPreview` — stat block preview, accepts `entityType` prop
- `NpcsTable` — table view, accepts `entityType`/`entityLabel` props
- `DeleteNpcDialog` — delete confirm dialog, accepts `entityLabel` prop

### Monster-specific wrappers
- `MonsterFormModal` → delegates to `NpcFormModal` with `entityLabel="Monstro"`, `sourceDefault="LDM pág. "`
- `MonsterPreview` → delegates to `NpcPreview` with `entityType="Monstro"`
- `MonstersTable` → delegates to `NpcsTable` with `entityType="Monstro"`
- `DeleteMonsterDialog` → delegates to `DeleteNpcDialog` with `entityLabel="Monstro"`
- `MonstersPage`, `MonsterFilters`, `NpcParamPreview`

### NPC-specific components
- `UserNpcFormModal` → delegates to `NpcFormModal` with `entityLabel="NPC"`, `sourceDefault="Homebrew"`
- `NpcsPage` — user NPC page (no AI generation, no admin guard on create)
- `useNpcsPage` hook

Global integrations:
- `entityColors.Monstro`, `entityColors.NPC`
- `ENTITY_PROVIDERS` search provider (Monstro only; NPC is user-scoped)
- `ENTITY_RENDERERS.Monstro`
- `/monsters/[slug]` generic entity page
- `/my-npcs/[slug]` user NPC detail page
- `EntityTitleLink` routeMap: `NPC → "my-npcs"`, `Monstro → "monsters"`
- dashboard `MonstersEntityCard`

## Tests

Coverage lives in:
- `tests/frontend/monsters/monster-form-modal.test.tsx`
- `tests/frontend/monsters/monster-async-renderer.test.tsx`
- `tests/frontend/monsters/npc-components.test.tsx` — NpcPreview + NpcsTable
- `tests/scripts/seed-data/providers/monsters-provider.test.ts`
- `tests/backend/catalogs/monsters-routes.test.ts`

Run focused checks:

```bash
npx vitest run tests/frontend/monsters tests/backend/catalogs/monsters-routes.test.ts
```
