import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { featAttributeRule, validateFeatAttributes } from "@/features/maddox/character-build-rules"
import type { AttributeType as CatalogAttributeType } from "@/features/classes/types/classes.types"
import type { AttributeType } from "../types/character-sheet.types"
import { getProficiencyBonus } from "../utils/dnd-calculations"
import { buildMentionHtml, buildSpellAttackAutofill, getAutoSpellAttackNotes, mapCatalogAttributeToSheetAttribute, rolledHpGain } from "../utils/sheet-rules"
import { ABILITY_KEYS, LevelUpError, loadLevelUpContext } from "./level-up-context"
import { abilityModifier, buildLevelUpOptions, findSubclassById, nextMentionFields, nextResourceCharges, nextSpellSlots, scoresOf, spellSourceOf, subclassIdOf, type SpellSwapResolver } from "./level-up-options"
import type { LevelUpChoices, LevelUpGains } from "./level-up-types"

/**
 * Aplica um nível na ficha (DND-56) — SOMENTE servidor. Valida as escolhas contra as opções reais do nível (as mesmas
 * que o wizard mostra e que o Personagem Opex recebe) e grava tudo numa atualização condicional ao nível lido: duas
 * confirmações simultâneas não sobem dois níveis. Auditado (`FichaPersonagem`) e avisado à ficha aberta.
 */

const log = loggerFor({ module: "character-sheets", feature: "level-up" })
export const LEVEL_UP_AUDIT_ENTITY = "FichaPersonagem"

export interface LevelUpActor {
    /** Usuário da auditoria (o jogador, o dono da campanha ou o dono da ficha do Opex). */
    userId: string
    by: "player" | "opex" | "owner"
    /** Contexto livre da auditoria (ex.: campanha). */
    context?: Record<string, unknown>
}

export interface ApplyLevelUpOptions {
    resolveSpellSwap?: SpellSwapResolver | null
    /** Rolagem do servidor (Opex): sem o dado vindo da tela, o servidor rola. */
    rollDie?: ((sides: number) => number) | null
}

export interface ApplyLevelUpResult {
    gains: LevelUpGains
}

const unique = (values: readonly string[]) => new Set(values).size === values.length
const defaultRoll = (sides: number) => 1 + Math.floor(Math.random() * sides)

type SpellCatalogDoc = { _id: Types.ObjectId; name: string; circle: number; school?: string; image?: string; castingTime?: string; range?: string; component?: string[]; baseDice?: { quantidade: number; tipo: string } }

export async function applyLevelUp(sheetId: string, choices: LevelUpChoices, actor: LevelUpActor, options: ApplyLevelUpOptions = {}): Promise<ApplyLevelUpResult> {
    const ctx = await loadLevelUpContext(sheetId)
    const current = ctx.sheet.level ?? 1
    if (choices.targetLevel !== current + 1) throw new LevelUpError(`A ficha está no nível ${current}: a próxima subida é para o nível ${Math.min(20, current + 1)}.`, 409)
    const opts = await buildLevelUpOptions(sheetId, { subclassId: choices.subclassId ?? null, resolveSpellSwap: options.resolveSpellSwap ?? null }, ctx)
    const target = opts.targetLevel

    // Subclasse
    const subclass = opts.subclass.required ? findSubclassById(ctx.cls, choices.subclassId) : ctx.currentSubclass
    if (opts.subclass.required && !subclass) throw new LevelUpError(`Escolha uma subclasse para confirmar o nível ${target}.`)

    // PV
    let die: number | null = null
    let hpGain = opts.hpAverage
    if (choices.hp.method === "roll") {
        // O dado do jogador vem da rolagem da tela; o do Personagem Opex é rolado aqui, no servidor.
        die = choices.hp.die ?? (actor.by === "opex" ? (options.rollDie ?? defaultRoll)(opts.hitDieSides) : null)
        if (die === null || !Number.isInteger(die) || die < 1 || die > opts.hitDieSides) throw new LevelUpError(`O dado de vida rolado precisa ficar entre 1 e ${opts.hitDieSides}.`)
        hpGain = rolledHpGain(die, opts.constitutionModifier)
    }

    // Talento
    const scores = scoresOf(ctx)
    const nextScores = { ...scores }
    let feat: LevelUpGains["feat"] = null
    if (opts.feat) {
        const chosen = choices.feat ? opts.feat.options.find((option) => option.id === choices.feat!.id) : null
        if (!chosen) throw new LevelUpError(opts.feat.kind === "fighting-style" ? `Escolha um Estilo de Luta para confirmar o nível ${target}.` : `Escolha um talento para confirmar o nível ${target}.`)
        const parts = Object.fromEntries(Object.entries(choices.feat?.attributes ?? {}).filter(([, value]) => value)) as Partial<Record<AttributeType, number>>
        const error = validateFeatAttributes(featAttributeRule({ name: chosen.name, attributeBonuses: null }).kind === "asi" ? { kind: "asi" } : chosen.attributeRule, parts, chosen.name)
        if (error) throw new LevelUpError(error)
        for (const key of ABILITY_KEYS) {
            const add = parts[key] ?? 0
            if (!add) continue
            if (scores[key] + add > opts.feat.cap) throw new LevelUpError(`${chosen.name}: ${key === "constitution" ? "Constituição" : "o atributo"} passaria do máximo (${opts.feat.cap}).`)
            nextScores[key] = scores[key] + add
        }
        feat = { name: chosen.name, attributes: parts }
    } else if (choices.feat) throw new LevelUpError(`O nível ${target} não dá talento.`)

    // Magias
    const step = opts.spells
    const cantripIds = choices.cantrips ?? []
    const spellIds = choices.spells ?? []
    if (!step && (cantripIds.length || spellIds.length || choices.swap)) throw new LevelUpError(`O nível ${target} não dá magias novas.`)
    if (step) {
        if (!unique(cantripIds) || !unique(spellIds)) throw new LevelUpError("Escolha cada magia uma vez só.")
        if (cantripIds.length !== step.cantrips) throw new LevelUpError(`Escolha ${step.cantrips} truque(s) novo(s).`)
        if (spellIds.length !== step.spells) throw new LevelUpError(`Escolha ${step.spells} magia(s) nova(s).`)
        if (cantripIds.some((id) => !step.cantripOptions.some((option) => option.id === id))) throw new LevelUpError("Um dos truques não está na lista da classe.")
        if (spellIds.some((id) => !step.spellOptions.some((option) => option.id === id))) throw new LevelUpError(`Uma das magias não está na lista da classe ou passa do ${step.maxCircle}º círculo.`)
        if (choices.swap) {
            if (!step.swap.allowed) throw new LevelUpError("Esta classe não troca magias ao subir de nível.")
            const removed = step.known.find((spell) => spell.id === choices.swap!.remove && spell.circle > 0)
            if (!removed) throw new LevelUpError("A magia trocada precisa ser uma magia conhecida (não truque).")
            if (!step.spellOptions.some((option) => option.id === choices.swap!.add) || spellIds.includes(choices.swap.add)) throw new LevelUpError("A magia nova da troca precisa estar na lista da classe e não repetir uma escolha.")
        }
    }

    // Ficha
    const conDelta = abilityModifier(nextScores.constitution) - abilityModifier(scores.constitution)
    const hpExtra = conDelta > 0 ? conDelta * target : 0
    const featMention = feat && choices.feat ? { id: choices.feat.id, entityType: "Talento", label: feat.name } : null
    const fields = nextMentionFields(ctx, target, subclass, featMention)
    const resources = await nextResourceCharges(ctx, fields, target, nextScores)
    const slots = nextSpellSlots(ctx, target, subclass)
    const hpMax = Math.max(1, Number(ctx.sheet.hpMax ?? 0) + hpGain + hpExtra)
    const set: Record<string, unknown> = {
        level: target,
        // Como o wizard da ficha sempre fez: o PV máximo sobe e o atual fica como está.
        hpMax,
        classFeatures: fields.classFeatures,
        speciesTraits: fields.speciesTraits,
        featuresNotes: fields.featuresNotes,
        resourceCharges: resources.rows,
        spellSlots: slots.after,
        ...nextScores,
    }
    if (opts.subclass.required && subclass) {
        set.subclass = `<p>${buildMentionHtml({ id: `subclass:${String(ctx.cls._id)}:${subclassIdOf(subclass)}`, entityType: "Subclasse", label: subclass.name })}</p>`
        set.subclassRef = subclass._id && Types.ObjectId.isValid(String(subclass._id)) ? new Types.ObjectId(String(subclass._id)) : null
    }
    const source = spellSourceOf(ctx.cls, subclass)
    const spellAttribute = ctx.sheet.spellcastingAttribute ?? mapCatalogAttributeToSheetAttribute((source?.attribute ?? null) as CatalogAttributeType | null)
    if (!ctx.sheet.spellcastingAttribute && spellAttribute) set.spellcastingAttribute = spellAttribute

    const [{ CharacterSheet }, { CharacterSpell }, { CharacterAttack }, { Spell }, { catalogSpellDoc }] = await Promise.all([
        import("../models/character-sheet"),
        import("../models/character-spell"),
        import("../models/character-attack"),
        import("@/features/spells/models/spell"),
        import("@/features/maddox/server/sheet-builder"),
    ])
    const updated = await CharacterSheet.updateOne({ _id: ctx.sheet._id, level: current }, { $set: set })
    if (!updated.matchedCount) throw new LevelUpError("A ficha mudou de nível enquanto isso. Abra o wizard de novo.", 409)

    // Magias novas e troca
    const addIds = [...cantripIds, ...spellIds, ...(choices.swap ? [choices.swap.add] : [])]
    const catalog = addIds.length ? await (Spell as unknown as { find: (q: unknown) => { lean: <T>() => Promise<T> } }).find({ _id: { $in: addIds.map((id) => new Types.ObjectId(id)) } }).lean<SpellCatalogDoc[]>() : []
    const byId = new Map(catalog.map((spell) => [String(spell._id), spell]))
    const events: { name: "spells" | "attacks"; action: "created" | "deleted"; recordId: string }[] = []
    const sheetObjectId = ctx.sheet._id
    const mods = Object.fromEntries(ABILITY_KEYS.map((key) => [key, abilityModifier(nextScores[key])])) as Record<AttributeType, number>
    const attackBonus = getProficiencyBonus(target, ctx.sheet.proficiencyBonusOverride ?? null).value + (spellAttribute ? mods[spellAttribute] : 0)
    let swap: LevelUpGains["swap"] = null
    if (choices.swap && step) {
        const removed = step.known.find((spell) => spell.id === choices.swap!.remove)!
        await CharacterSpell.deleteOne({ _id: new Types.ObjectId(removed.id), sheetId: sheetObjectId })
        events.push({ name: "spells", action: "deleted", recordId: removed.id })
        swap = { from: removed.name, to: byId.get(choices.swap.add)?.name ?? "" }
    }
    for (const id of addIds) {
        const spell = byId.get(id)
        if (!spell) continue
        const doc = await CharacterSpell.create(catalogSpellDoc(sheetObjectId, spell.name, spell as never))
        events.push({ name: "spells", action: "created", recordId: String(doc._id) })
        if (spell.circle === 0 && spell.baseDice) {
            const attack = await CharacterAttack.create({ sheetId: sheetObjectId, name: `<p>${buildMentionHtml({ id: String(spell._id), entityType: "Magia", label: spell.name })}</p>`, ...buildSpellAttackAutofill(spell as never, { spellAttackBonus: { value: attackBonus } }, target), notes: getAutoSpellAttackNotes(String(spell._id)) })
            events.push({ name: "attacks", action: "created", recordId: String(attack._id) })
        }
    }

    const gains: LevelUpGains = {
        fromLevel: current,
        toLevel: target,
        hp: { method: choices.hp.method, gain: hpGain + hpExtra, die, hpMax },
        subclass: opts.subclass.required && subclass ? subclass.name : null,
        feat,
        traits: [...fields.traits.map((trait) => trait.label)],
        cantrips: cantripIds.map((id) => byId.get(id)?.name ?? "").filter(Boolean),
        spells: spellIds.map((id) => byId.get(id)?.name ?? "").filter(Boolean),
        swap,
    }
    await recordAudit({
        userId: actor.userId,
        entidade: LEVEL_UP_AUDIT_ENTITY,
        entidadeId: String(sheetObjectId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { level: current, hpMax: ctx.sheet.hpMax ?? null },
        depois: { level: target, by: actor.by, ...(actor.context ?? {}), gains },
    }).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[ficha] falha ao auditar a subida de nível"))
    await publishLevelUp(String(sheetObjectId), events)
    return { gains }
}

async function publishLevelUp(sheetId: string, events: { name: "spells" | "attacks"; action: "created" | "deleted"; recordId: string }[]) {
    try {
        const [{ CharacterSheetPusherService }, { CharacterSheet }, { CharacterSpell }, { CharacterAttack }] = await Promise.all([
            import("../realtime/character-sheet-pusher-service"),
            import("../models/character-sheet"),
            import("../models/character-spell"),
            import("../models/character-attack"),
        ])
        const pusher = CharacterSheetPusherService.getInstance()
        const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T
        const sheet = await CharacterSheet.findById(sheetId).lean()
        if (sheet) await pusher.publishSheetPatched({ sheet: plain({ ...sheet, _id: String(sheet._id) }) })
        for (const event of events) {
            const model = (event.name === "spells" ? CharacterSpell : CharacterAttack) as unknown as { findById: (id: string) => { lean: () => Promise<Record<string, unknown> | null> } }
            const record = event.action === "deleted" ? null : await model.findById(event.recordId).lean()
            await pusher.publishCollectionChanged({ sheetId, collection: event.name, action: event.action, recordId: event.recordId, ...(record ? { record: plain({ ...record, _id: String(record._id), sheetId }) } : {}) } as never)
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[ficha] falha ao avisar a subida de nível em tempo real")
    }
}
