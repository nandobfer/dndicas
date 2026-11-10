import { Types } from "mongoose"
import { buildCombatOptions, type CombatOptions, type OptionAbility } from "../combat-options"
import { applyCombatPrep } from "../combat-prep"
import { canAct, freshEconomy } from "../combat-rules"
import type { IMaddoxCombatPrep } from "../models"
import type { TacticalCharacterState } from "../combat-types"
import { loadCombatSheets, type CombatSheet } from "./combat-sheet"

/**
 * Opções de combate de cada personagem (Maddox 7) — SOMENTE servidor: lê a ficha (`combat-sheet`), resolve o custo das
 * habilidades (`combat-classifier`: cache, texto e JEV em segundo plano) e monta o que ele pode usar agora
 * (`buildCombatOptions`). Usada pelo DTO da mesa, pela revalidação de cada ação e pelas janelas de reação.
 */

export interface CharacterCombatView {
    sheet: CombatSheet
    options: CombatOptions
}

/**
 * `combatId` (DND-41): aplica a preparação do Maddox de cada personagem sobre a lista base (`applyCombatPrep`). Sem ele,
 * ou com `base: true`, devolve só a lista que o servidor calcula da ficha (`ignoreResources` = lista completa, para a
 * própria preparação).
 */
export async function loadCharacterOptions(
    states: readonly TacticalCharacterState[],
    campaignId?: Types.ObjectId,
    combatId?: Types.ObjectId | string | null,
    mode: { base?: boolean; ignoreResources?: boolean } = {},
): Promise<Map<string, CharacterCombatView>> {
    const result = new Map<string, CharacterCombatView>()
    const withSheet = states.filter((state) => state.sheetId)
    if (!withSheet.length) return result
    const sheets = await loadCombatSheets(withSheet.map((state) => state.sheetId!))
    const preps = new Map<string, { overlay: IMaddoxCombatPrep["overlay"]; riders: IMaddoxCombatPrep["riders"] }>()
    if (combatId && !mode.base) {
        const { MaddoxCombatPrepModel } = await import("../models")
        const found = await MaddoxCombatPrepModel.find({ combatId: new Types.ObjectId(String(combatId)), actorKey: { $in: withSheet.map((state) => state.actorKey) }, status: { $in: ["ready", "skipped"] } })
            .select("actorKey overlay riders")
            .lean<Pick<IMaddoxCombatPrep, "actorKey" | "overlay" | "riders">[]>()
        for (const item of found) preps.set(item.actorKey, { overlay: item.overlay, riders: item.riders ?? [] })
    }
    const { resolveProfiles, profileKey } = await import("./combat-classifier")
    const entries = [...sheets.values()].flatMap((sheet) =>
        sheet.abilities.map((ability) => {
            const catalogId = (ability as OptionAbility & { catalogId?: string | null }).catalogId ?? null
            return { ability, entry: { entityType: ability.id.startsWith("feat:") ? ("feat" as const) : ("trait" as const), entityId: catalogId ?? ability.id, name: ability.name, text: ability.description } }
        }),
    )
    const onClassified = campaignId
        ? async () => {
              const { publishGameChanged } = await import("./game")
              await publishGameChanged(campaignId)
          }
        : undefined
    const profiles = await resolveProfiles(
        entries.filter(({ entry }) => entry.text.trim()).map(({ entry }) => entry),
        onClassified,
    )
    for (const { ability, entry } of entries) ability.profile = entry.text.trim() ? (profiles.get(profileKey(entry)) ?? null) : null
    for (const state of withSheet) {
        const sheet = sheets.get(state.sheetId!)
        if (!sheet) continue
        // Habilidades passivas (ou que não se usam em combate) não aparecem.
        const abilities = sheet.abilities.filter((ability) => ability.profile?.cost !== "passive" && ability.profile?.cost !== "other" && ability.description.trim())
        const economy = mode.ignoreResources ? { ...freshEconomy(), lightAttack: true } : state.economy
        const built = buildCombatOptions({
            ignoreResources: Boolean(mode.ignoreResources),
            sheet: sheet.option,
            weapons: sheet.weapons,
            spells: sheet.spells,
            items: sheet.items,
            abilities,
            economy,
            conditions: mode.ignoreResources ? [] : state.conditions,
            dying: mode.ignoreResources ? false : state.hpZero || state.dead,
            ready: state.ready ? { optionId: state.ready.optionId, label: state.ready.label } : null,
        })
        const prep = preps.get(state.actorKey)
        const options = prep
            ? applyCombatPrep(built, {
                  overlay: prep.overlay,
                  riders: prep.riders,
                  economy: state.economy,
                  sheet: sheet.option,
                  charges: new Map(sheet.abilities.filter((ability) => ability.charge).map((ability) => [ability.charge!.id, ability.charge!])),
                  items: new Map([...sheet.items.map((item) => [item.id, item.quantity] as const), ...sheet.weapons.map((weapon) => [weapon.id, weapon.quantity] as const)]),
                  blocked: state.hpZero || state.dead || !canAct({ conditions: state.conditions }),
              })
            : built
        // Ataque Extra conta todas as habilidades (também as passivas, que é o caso do "Ataque Extra").
        options.attacksPerAction = buildCombatOptions({ ...{ sheet: sheet.option, weapons: [], spells: [], items: [], economy: state.economy, conditions: [], dying: false }, abilities: sheet.abilities }).attacksPerAction
        result.set(state.actorKey, { sheet, options })
    }
    return result
}
