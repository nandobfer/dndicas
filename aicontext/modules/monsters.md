# Monsters Module (Monstros)

**Feature**: Catálogo de Monstros D&D 5e  
**Entity Type**: Monstro  
**Color Theme**: Artifact/Red  
**Icon**: Skull

## Overview

The Monsters module manages D&D 5e monster and NPC stat blocks with CRUD, dashboard stats, global search, rich previews, audit logs, and table/list catalog views.

## Features

- Adds `Monstros` to the expandable sidebar catalog navigation, pointing to `/monsters`.
- Monster form classification autocompletes fill their row, numeric combat fields use immediate masks, optional speeds can be added as empty fields, and list custom values render beside the section title.
- Challenge Rating uses the same masked field style as combat numbers, preserving string CR values with `/` and `-` while keeping XP/proficiency derivation safe for intermediate input.
- New monsters show an empty Challenge Rating field; submit normalizes an empty CR to `"0"` before deriving XP and saving.
- Monster previews render type before size, compact stat cards with inline labels, CR with XP beside it, full attribute names with modifier-first values, and colored damage words in NPC hit rolls.
- Monster preview defenses render localized, capitalized Portuguese damage labels separated by commas while preserving internal damage keys.

Core behavior:
- Browse monsters with search, type, size, challenge rating, source, and status filters.
- Create/edit/delete monsters through a glass modal matching the items catalog style.
- Store structured combat stats, attributes, saving throws, skills, senses, defenses, and stat-block action sections.
- Render monsters through the shared entity renderer, floating windows, generic entity pages, and global search.

## Data Model

Main fields:
- `name`, `originalName`, `source`, `description`, `image`, `status`
- `type`, `size`, `alignment`
- `armorClass`, `initiative`, `hitPointsFormula`
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

Overrides:
- `experienceOverride` replaces derived XP.
- `proficiencyBonusOverride` replaces derived proficiency bonus.
- Saving throws and skills derive from attributes plus proficiency, but each entry supports numeric `override`.
- Passive perception derives from Percepção unless `senses.passivePerception` is set.

## API

Routes:
- `GET /api/monsters`
- `POST /api/monsters`
- `GET /api/monsters/[id]`
- `PUT /api/monsters/[id]`
- `DELETE /api/monsters/[id]`
- `GET /api/monsters/search`
- `GET /api/stats/monsters`

List filters:
- `search`
- `type`
- `size`
- `challengeRating`
- `status`
- `sources`
- `page`
- `limit`

Mutations require Clerk auth and create audit logs with `entity: "Monstro"`.

## UI

Main components:
- `MonstersPage`
- `MonsterFilters`
- `MonstersTable`
- `MonsterFormModal`
- `MonsterPreview`
- `NpcParamPreview`
- `DeleteMonsterDialog`

Global integrations:
- `entityColors.Monstro`
- `ENTITY_PROVIDERS` search provider
- `ENTITY_RENDERERS.Monstro`
- `/monsters/[slug]` generic entity page
- dashboard `MonstersEntityCard`

## Tests

Coverage lives in:
- `tests/frontend/monsters/monster-form-modal.test.tsx`
- `tests/backend/catalogs/monsters-routes.test.ts`

Run focused checks:

```bash
npm test -- --run tests/frontend/monsters tests/backend/catalogs/monsters-routes.test.ts
```
