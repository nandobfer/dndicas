import { Types } from "mongoose"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { CombatSheetChange } from "../combat-prep-schemas"
import type { CombatPrepChange } from "../combat-types"
import { castingAttributeLabel, checkPlayerChoice, offersCastingAttributeChoice, ruleNamesSpell } from "../player-choice"
import { catalogReadText, type CatalogReadLog } from "./catalog-reads"
import { describeSheetChange } from "./combat-sheet-writes"

/**
 * Trava da escolha do jogador nas correções da ficha (DND-51) — SOMENTE servidor. Vale para a preparação do combate e
 * para o "Pergunte ao mestre": o atributo de conjuração de uma regra com lista e a magia escolhida de uma lista só passam
 * com o trecho de uma mensagem do jogador (`choice.quote`). O resto passa como está.
 */

export interface ChoiceScreen {
    allowed: CombatSheetChange[]
    /** Recusadas por falta da escolha do jogador (com o motivo, para o card ou o retorno da ferramenta). */
    refused: (CombatPrepChange & { change: CombatSheetChange; value: string })[]
}

export const PLAYER_CHOICE_REFUSAL_PREFIX = "Falta a escolha do jogador"

const ruleTextOf = (change: CombatSheetChange, reads: CatalogReadLog) => (change.source ? `${catalogReadText(reads, change.source.ref) ?? ""} ${change.source.quote}` : "")

async function catalogSpellNames(ids: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids.filter((id) => Types.ObjectId.isValid(id)))]
    if (!valid.length) return new Map()
    const { Spell } = await import("@/features/spells/models/spell")
    const docs = await (Spell as unknown as { find: (q: unknown) => { select: (f: string) => { lean: <T>() => Promise<T> } } })
        .find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
        .select("name")
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    return new Map(docs.map((doc) => [String(doc._id), doc.name]))
}

export interface ChoiceSheet {
    /** Atributo de conjuração atual da ficha (`null` = a ficha não define). */
    castingAttribute: string | null
}

/**
 * Qual valor a alteração grava que é escolha do jogador (`null` = não é escolha). O atributo de conjuração é escolha quando
 * a regra citada oferece a lista OU quando a ficha ainda não tem atributo (revisão DND-51, F8: a fonte citada pelo modelo
 * pode ser outra entidade, e a ficha sem atributo é justamente o caso em que ele "decidia" sozinho).
 */
export async function choiceValues(changes: readonly CombatSheetChange[], reads: CatalogReadLog, sheet: ChoiceSheet): Promise<Map<CombatSheetChange, string>> {
    const names = await catalogSpellNames(changes.flatMap((change) => (change.type === "spell-add" ? [change.catalogSpellId] : [])))
    const out = new Map<CombatSheetChange, string>()
    for (const change of changes) {
        if (change.type === "spellcasting-attribute" && change.attribute) {
            // Regra com lista de atributos ("Inteligência, Sabedoria ou Carisma … escolha"): o jogador escolhe. Sem fonte
            // lida, a alteração já é recusada pela fonte.
            if (!sheet.castingAttribute || offersCastingAttributeChoice(ruleTextOf(change, reads))) out.set(change, castingAttributeLabel(change.attribute as AttributeType))
        } else if (change.type === "spell-add") {
            const name = names.get(change.catalogSpellId)
            if (name && !ruleNamesSpell(ruleTextOf(change, reads), name)) out.set(change, name)
        }
    }
    return out
}

/** Atributo de conjuração atual da ficha (para a trava da escolha). */
export async function choiceSheetOf(sheetId: string | Types.ObjectId | null | undefined): Promise<ChoiceSheet> {
    if (!sheetId || !Types.ObjectId.isValid(String(sheetId))) return { castingAttribute: null }
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    const sheet = await CharacterSheet.findById(new Types.ObjectId(String(sheetId))).select("spellcastingAttribute").lean<{ spellcastingAttribute?: string | null }>()
    return { castingAttribute: sheet?.spellcastingAttribute ?? null }
}

/** As recusas no formato do card (sem a alteração e o valor, que só servem a quem chamou). */
export const refusalsOf = (refused: ChoiceScreen["refused"]): CombatPrepChange[] => refused.map((item) => ({ area: item.area, label: item.label, before: item.before, after: item.after, reason: item.reason, applied: false, ...(item.refused ? { refused: item.refused } : {}) }))

/** Separa as alterações que precisam da escolha do jogador e não a têm confirmada nas mensagens dele. */
export async function screenPlayerChoices(changes: readonly CombatSheetChange[], reads: CatalogReadLog, playerTexts: readonly string[], sheet: ChoiceSheet): Promise<ChoiceScreen> {
    const values = await choiceValues(changes, reads, sheet)
    const allowed: CombatSheetChange[] = []
    const refused: ChoiceScreen["refused"] = []
    for (const change of changes) {
        const value = values.get(change)
        const problem = value === undefined ? null : checkPlayerChoice(change.choice, value, playerTexts)
        if (!problem) {
            allowed.push(change)
            continue
        }
        refused.push({ change, value: value!, area: "ficha", label: describeSheetChange(change), before: "—", after: value!, reason: change.reason, applied: false, refused: `${PLAYER_CHOICE_REFUSAL_PREFIX}: ${value} ${problem}.` })
    }
    return { allowed, refused }
}
