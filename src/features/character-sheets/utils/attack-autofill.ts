"use client"

import {
    buildDiceValueHtml,
    buildSpellAttackAutofill,
    buildWeaponAttackAutofill,
    formatBonus,
    getAutoSpellAttackNotes,
    getCantripDamageDiceQuantity,
    hasFinesseProperty,
    resolveCatalogItemType,
} from "./sheet-rules"

// Regras puras em `sheet-rules.ts` (usadas também pelo servidor).
export { buildDiceValueHtml, buildSpellAttackAutofill, buildWeaponAttackAutofill, formatBonus, getAutoSpellAttackNotes, getCantripDamageDiceQuantity, hasFinesseProperty, resolveCatalogItemType }
