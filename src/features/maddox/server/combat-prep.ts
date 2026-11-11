import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_ABILITIES, MADDOX_ABILITY_LABELS } from "../check-modifier"
import { plainText, type CombatOption, type CombatOptions } from "../combat-options"
import { detectSneakAttack, riderLabel } from "../combat-prep"
import { combatAddSchema, combatModifySchema, combatPrepResponseSchema, combatRemoveSchema, combatSheetChangeSchema, parseList, requiresCatalogSource, sneakAttackSchema, type CombatSheetChange } from "../combat-prep-schemas"
import { abilityModifier } from "../combat-rules"
import { emptyOverlay, type CombatOptionPatch, type CombatPrepChange, type CombatPrepOverlay, type CombatPrepRider, type PreparedCombatOption, type TacticalCharacterState } from "../combat-types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_COMBAT_PREP_CONFLICT_RETRIES, MADDOX_COMBAT_PREP_STALE_MS, MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCombatPrepModel, type IMaddoxCampaign, type IMaddoxCombatPrep } from "../models"
import { masteryKeyFromName, masteryLabel, masteryLimit, type MaddoxMasteryKey } from "../weapon-mastery"
import { catalogReadText, checkCatalogSource, createCatalogReadLog, type CatalogReadLog, type CatalogSource } from "./catalog-reads"
import { catalogReferencesText, itemMastery, mentionCandidates, resolveCatalogReferences, type CatalogReference, type CatalogReferenceCandidate } from "./catalog-references"
import { describeSheetChange } from "./combat-sheet-writes"

/**
 * Preparação da mesa de combate (DND-41) — SOMENTE servidor. Ao abrir o combate tático, cada personagem (inclusive os
 * Opex) ganha um documento `maddox_combat_preps` e um job na fila serial da campanha: o Maddox revisa a lista de opções
 * contra a ficha inteira, grava as correções na ficha e o que muda nas opções, e o dono do personagem recebe o card
 * privado "Sua mesa está pronta". A ordem de iniciativa só fecha com todas as preparações prontas (`preparationPending`).
 * Falha = o combate para até o dono da campanha decidir ("Tentar de novo" ou "Seguir sem preparação").
 */

const log = loggerFor({ module: "maddox", feature: "combat-prep" })

type PrepDoc = IMaddoxCombatPrep

/** Preparações com execução viva neste processo (enfileiradas ou rodando): a retomada não as duplica. */
const liveJobs = ((globalThis as unknown as { __maddoxCombatPrepJobs?: Set<string> }).__maddoxCombatPrepJobs ??= new Set<string>())
/** Promessas das preparações em andamento (testes esperam por elas). */
const running = ((globalThis as unknown as { __maddoxCombatPrepRuns?: Set<Promise<void>> }).__maddoxCombatPrepRuns ??= new Set<Promise<void>>())

/** Testes: espera as preparações (e os pedidos de ajuste) enfileiradas terminarem. */
export async function waitForCombatPreps(): Promise<void> {
    while (running.size) await Promise.allSettled([...running])
}

const track = (promise: Promise<void>) => {
    running.add(promise)
    void promise.finally(() => running.delete(promise))
}

const BLOCKING: IMaddoxCombatPrep["status"][] = ["pending", "running", "failed"]

/** Há preparação do combate ainda não pronta (inclusive com falha esperando o dono): a ordem não fecha. */
export async function preparationPending(combatId: Types.ObjectId | string): Promise<boolean> {
    return Boolean(await MaddoxCombatPrepModel.exists({ combatId: new Types.ObjectId(String(combatId)), status: { $in: BLOCKING } }))
}

/** Cria a preparação de cada personagem do combate que começa e põe os jobs na fila. */
export async function createCombatPreps(campaignId: Types.ObjectId, combatId: Types.ObjectId, characters: readonly TacticalCharacterState[], turnNumber: number, waitRound: number): Promise<void> {
    const docs = characters
        .filter((state) => state.sheetId && !state.left)
        .map((state) => ({
            campaignId,
            combatId,
            actorKey: state.actorKey,
            characterId: new Types.ObjectId(state.characterId),
            memberId: new Types.ObjectId(state.memberId),
            userId: state.userId,
            sheetId: new Types.ObjectId(state.sheetId!),
            characterName: state.name,
            turnNumber,
            waitRound,
            status: "pending" as const,
        }))
    if (!docs.length) return
    try {
        await MaddoxCombatPrepModel.insertMany(docs, { ordered: false })
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
    }
    log.info({ campaignId: String(campaignId), combatId: String(combatId), characters: docs.length }, "[maddox] preparação da mesa de combate agendada")
    await scheduleCombatPreps(campaignId)
}

/**
 * Põe na fila da campanha, em ordem, as preparações pendentes do combate ativo (e as "em andamento" sem execução viva há
 * mais que a folga, depois de um reinício). Idempotente: a mesma preparação não entra duas vezes.
 */
export async function scheduleCombatPreps(campaignId: Types.ObjectId): Promise<number> {
    const { findActiveTactical } = await import("./tactical-combat")
    const combat = await findActiveTactical(campaignId)
    if (!combat) return 0
    const staleBefore = new Date(Date.now() - MADDOX_COMBAT_PREP_STALE_MS)
    const preps = await MaddoxCombatPrepModel.find({ combatId: combat._id, $or: [{ status: "pending" }, { status: "running", startedAt: { $lt: staleBefore } }] })
        .sort({ _id: 1 })
        .select("_id status")
        .lean<{ _id: Types.ObjectId; status: string }[]>()
    let queued = 0
    const { enqueueMaddoxJob } = await import("./game-live")
    for (const prep of preps) {
        const key = String(prep._id)
        if (liveJobs.has(key)) continue
        if (prep.status === "running") await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "running" }, { $set: { status: "pending", jobId: null } })
        liveJobs.add(key)
        queued += 1
        track(enqueueMaddoxJob(String(campaignId), "combat-prep", async (job) => {
            try {
                await runCombatPrep(campaignId, prep._id, job.jobId)
            } finally {
                liveJobs.delete(key)
            }
        }))
    }
    return queued
}

// ── Contexto da ficha ─────────────────────────────────────────────────────────

export interface PrepSheetContext {
    /** Ficha inteira em texto, com os ids que o Maddox pode citar. */
    sheetText: string
    optionsText: string
    /** Lista base completa (ids válidos para alterar e remover). */
    options: CombatOptions
    sneakAttack: string | null
    stamp: string
    chargeIds: Set<string>
    itemIds: Set<string>
    /** DND-49: o que a ficha cita, conferido no catálogo (a seção "Referências do catálogo"). */
    references: CatalogReference[]
    /** DND-49: maestrias — itens de catálogo da ficha com a maestria deles, as já registradas e a base do limite. */
    mastery: MasteryContext
}

export interface MasteryContext {
    /** `catalogItemId` → maestria do item no catálogo. */
    items: Map<string, MaddoxMasteryKey>
    /** `catalogItemId` já registrados em `weaponMasteries`. */
    current: Set<string>
    level: number
    /** Tabela de progressão da classe (coluna de maestria, quando houver). */
    table: { customColumns?: { label?: string | null; values?: (string | number | null)[] | null }[] | null } | null
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
const ECONOMY_TEXT = { action: "Ação", bonus: "Ação bônus", reaction: "Reação" } as const

export const optionLine = (option: Pick<CombatOption, "id" | "economy" | "label" | "detail">) => `- [${ECONOMY_TEXT[option.economy]}] id="${option.id}" — ${option.label}${option.detail ? ` (${option.detail})` : ""}`

/** Lê a ficha inteira para a preparação (e para os pedidos de ajuste). */
export async function loadPrepSheet(state: TacticalCharacterState, campaignId?: Types.ObjectId): Promise<PrepSheetContext | null> {
    if (!state.sheetId) return null
    const sheetId = new Types.ObjectId(state.sheetId)
    const [{ CharacterSheet }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }, { CharacterItem }, { ItemModel }, { loadCharacterOptions }, { readSheetStamp, attackDamageText }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/items/database/item"),
        import("./tactical-options"),
        import("./combat-sheet-writes"),
    ])
    const stamp = await readSheetStamp(state.sheetId)
    type Sheet = Record<string, unknown> & { level?: number; weaponMasteries?: { catalogItemId: Types.ObjectId; mastery: string }[]; resourceCharges?: { id: string; name: string; total: number; used: number }[]; spellSlots?: Record<string, { total: number; used: number }>; skills?: Record<string, { proficient?: boolean; expertise?: boolean }>; savingThrows?: Record<string, boolean>; armorTraining?: Record<string, boolean> }
    const [sheet, attacks, traits, feats, spells, items] = await Promise.all([
        CharacterSheet.findById(sheetId).lean<Sheet>(),
        CharacterAttack.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; attackBonus: string; damageType: string }[]>(),
        CharacterTrait.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; description: string; catalogTraitId?: Types.ObjectId | null }[]>(),
        CharacterFeat.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; description: string; catalogFeatId?: Types.ObjectId | null }[]>(),
        CharacterSpell.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; circle: number | null; prepared: boolean; castingTime: string; concentration: boolean; catalogSpellId?: Types.ObjectId | null }[]>(),
        CharacterItem.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; quantity: number; equipped: boolean; catalogItemId: Types.ObjectId | null; catalogItemType: string | null }[]>(),
    ])
    if (!sheet) return null
    const catalogIds = items.map((item) => item.catalogItemId).filter((id): id is Types.ObjectId => Boolean(id))
    const catalog = catalogIds.length ? await ItemModel.find({ _id: { $in: catalogIds }, status: "active" }).select("name type damageDice damageType properties mastery").lean<{ _id: Types.ObjectId; name?: string; type?: string; damageDice?: { quantidade: number; tipo: string }; damageType?: string; properties?: { name?: string; description?: string }[]; mastery?: unknown }[]>() : []
    const catalogById = new Map(catalog.map((item) => [String(item._id), item]))
    const mastery = await masteryContextOf(sheet, catalog)
    const references = await resolveCatalogReferences(referenceCandidates(sheet, { traits, feats, spells, items }, catalog))
    const views = await loadCharacterOptions([state], campaignId, null, { base: true, ignoreResources: true })
    const view = views.get(state.actorKey)
    const options: CombatOptions = view?.options ?? { action: [], bonus: [], reactions: [], attacksPerAction: 1 }
    const level = Math.max(1, Number(sheet.level) || 1)
    const html = (key: string) => plainText(String(sheet[key] ?? ""))
    const prof = view?.sheet.option.proficiencyBonus ?? 2
    const abilities = MADDOX_ABILITIES.map((ability) => {
        const score = Number(sheet[ability]) || 10
        return `${MADDOX_ABILITY_LABELS[ability]} ${score} (${signed(abilityModifier(score))})`
    }).join(", ")
    const saves = MADDOX_ABILITIES.filter((ability) => sheet.savingThrows?.[ability]).map((ability) => MADDOX_ABILITY_LABELS[ability])
    const skills = Object.entries(sheet.skills ?? {})
        .filter(([, value]) => value?.proficient || value?.expertise)
        .map(([name, value]) => `${name}${value.expertise ? " (especialista)" : ""}`)
    const charges = sheet.resourceCharges ?? []
    const slots = Object.entries(sheet.spellSlots ?? {}).filter(([, slot]) => (slot?.total ?? 0) > 0)
    const sneakAttack = detectSneakAttack({
        level,
        classText: `${String(sheet.class ?? "")} ${String(sheet.subclass ?? "")}`,
        features: [String(sheet.classFeatures ?? ""), String(sheet.speciesTraits ?? ""), String(sheet.featuresNotes ?? ""), ...traits.map((trait) => trait.name), ...feats.map((feat) => feat.name)],
    })
    const sections = [
        "## Ficha",
        `- Classe: ${html("class") || "(sem classe)"}${html("subclass") ? ` (${html("subclass")})` : ""} · Nível ${level} · Espécie: ${html("race") || "—"} · Origem: ${html("origin") || "—"}`,
        `- Atributos: ${abilities}`,
        `- Bônus de proficiência: ${signed(prof)}`,
        `- Salvaguardas proficientes: ${saves.join(", ") || "nenhuma"}`,
        `- Perícias: ${skills.join(", ") || "nenhuma"}`,
        `- Proficiências com armas: ${html("weaponProficiencies") || "—"}`,
        `- Maestrias de arma registradas: ${(sheet.weaponMasteries ?? []).map((entry) => `${plainText(String(catalogById.get(String(entry.catalogItemId))?.name ?? entry.catalogItemId))} (${masteryKeyFromName(entry.mastery) ? masteryLabel(masteryKeyFromName(entry.mastery)!) : entry.mastery})`).join(", ") || "nenhuma"}`,
        `- Treino com armaduras: ${Object.entries(sheet.armorTraining ?? {}).filter(([, value]) => value).map(([key]) => key).join(", ") || "nenhum"}`,
        `- Conjuração: ${sheet.spellcastingAttribute ? MADDOX_ABILITY_LABELS[sheet.spellcastingAttribute as keyof typeof MADDOX_ABILITY_LABELS] ?? String(sheet.spellcastingAttribute) : "nenhum atributo"}${view ? ` · CD ${view.sheet.option.spellSaveDc} · ataque ${signed(view.sheet.option.spellAttackBonus)}` : ""}`,
        `- Espaços de magia: ${slots.map(([circle, slot]) => `${circle}º ${slot.total - slot.used}/${slot.total}`).join(", ") || "nenhum"}`,
        `- Recursos com cargas: ${charges.map((charge) => `[id="${charge.id}"] ${plainText(charge.name)} ${charge.total - charge.used}/${charge.total}`).join("; ") || "nenhum"}`,
        `## Características de classe\n${clip(html("classFeatures"), 3000) || "(nenhuma)"}`,
        `## Características da espécie\n${clip(html("speciesTraits"), 2000) || "(nenhuma)"}`,
        `## Talentos e notas de características\n${clip(html("featuresNotes"), 2000) || "(nenhum)"}`,
        `## Ataques da ficha\n${attacks.map((attack) => `- [attackId="${attack._id}"] ${plainText(attack.name)} · ${attack.attackBonus || "—"} · ${attackDamageText(attack.damageType) || "—"}`).join("\n") || "(nenhum)"}`,
        `## Itens\n${
            items
                .map((item) => {
                    const entry = item.catalogItemId ? catalogById.get(String(item.catalogItemId)) : undefined
                    const props = (entry?.properties ?? []).map((property) => plainText(property.name?.trim() ? property.name : (property.description ?? ""))).filter(Boolean)
                    const damage = entry?.damageDice ? ` · dano ${entry.damageDice.quantidade}${entry.damageDice.tipo.startsWith("d") ? entry.damageDice.tipo : `d${entry.damageDice.tipo}`} ${entry.damageType ?? ""}`.trimEnd() : ""
                    return `- [itemId="${item._id}"]${item.catalogItemId ? ` [catalogItemId="${item.catalogItemId}"]` : ""} ${plainText(item.name)} · ${item.equipped ? "equipado" : "não equipado"} · qtd ${item.quantity ?? 1} · ${entry?.type ?? item.catalogItemType ?? (item.catalogItemId ? "catálogo" : "fora do catálogo")}${damage}${props.length ? ` · propriedades: ${props.join(", ")}` : ""}${entry?.mastery ? ` · ${plainText(String(entry.mastery))}` : ""}`
                })
                .join("\n") || "(nenhum)"
        }`,
        `## Características registradas\n${traits.map((trait) => `- [id="${trait._id}"] ${plainText(trait.name)} — ${clip(plainText(trait.description ?? ""), MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX)}`).join("\n") || "(nenhuma)"}`,
        `## Talentos registrados\n${feats.map((feat) => `- [id="${feat._id}"] ${plainText(feat.name)} — ${clip(plainText(feat.description ?? ""), MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX)}`).join("\n") || "(nenhum)"}`,
        `## Referências do catálogo (consulte as regras com as ferramentas de catálogo)\n${catalogReferencesText(references)}`,
        `## Magias\n${spells.map((spell) => `- [spellId="${spell._id}"] ${plainText(spell.name)} · ${spell.circle === 0 ? "truque" : spell.circle ? `${spell.circle}º círculo` : "círculo ?"} · ${spell.prepared ? "preparada" : "não preparada"} · ${spell.castingTime || "—"}${spell.concentration ? " · concentração" : ""}`).join("\n") || "(nenhuma)"}`,
    ]
    return {
        sheetText: sections.join("\n"),
        optionsText: [...options.action, ...options.bonus, ...options.reactions].map(optionLine).join("\n") || "(nenhuma)",
        options,
        sneakAttack,
        stamp,
        chargeIds: new Set(charges.map((charge) => charge.id)),
        itemIds: new Set(items.map((item) => String(item._id))),
        references,
        mastery,
    }
}

type SheetDoc = Record<string, unknown> & { level?: number; weaponMasteries?: { catalogItemId: Types.ObjectId; mastery: string }[] }

/** O que a ficha cita (menções dos campos, ids de catálogo das listas e a maestria de cada item). */
function referenceCandidates(
    sheet: SheetDoc,
    lists: { traits: { name: string; catalogTraitId?: Types.ObjectId | null }[]; feats: { name: string; catalogFeatId?: Types.ObjectId | null }[]; spells: { name: string; catalogSpellId?: Types.ObjectId | null }[]; items: { name: string; catalogItemId: Types.ObjectId | null }[] },
    catalog: readonly { _id: Types.ObjectId; mastery?: unknown }[],
): CatalogReferenceCandidate[] {
    const fields = ["class", "subclass", "race", "origin", "classFeatures", "speciesTraits", "featuresNotes", "weaponProficiencies"] as const
    const named = (type: string, name: string, id: Types.ObjectId | null | undefined): CatalogReferenceCandidate[] => {
        const mention = mentionCandidates(name)[0]
        if (mention) return [mention]
        return [{ type, id: id ? String(id) : null, name: plainText(name) }]
    }
    return [
        ...fields.flatMap((field) => mentionCandidates(String(sheet[field] ?? ""))),
        ...lists.traits.flatMap((trait) => named("Habilidade", trait.name, trait.catalogTraitId)),
        ...lists.feats.flatMap((feat) => named("Talento", feat.name, feat.catalogFeatId)),
        ...lists.spells.flatMap((spell) => named("Magia", spell.name, spell.catalogSpellId)),
        ...lists.items.map((item) => (item.catalogItemId ? { type: "Item", id: String(item.catalogItemId), name: plainText(item.name) } : { type: "Item", id: null, name: plainText(item.name) })),
        ...catalog.flatMap((item) => {
            const rule = itemMastery(item.mastery)?.rule
            return rule ? [rule] : []
        }),
    ]
}

async function masteryContextOf(sheet: SheetDoc, catalog: readonly { _id: Types.ObjectId; mastery?: unknown }[]): Promise<MasteryContext> {
    const items = new Map<string, MaddoxMasteryKey>()
    for (const item of catalog) {
        const found = itemMastery(item.mastery)
        if (found) items.set(String(item._id), found.key)
    }
    const classId = mentionCandidates(String(sheet.class ?? "")).find((mention) => mention.type === "Classe")?.id
    let table: MasteryContext["table"] = null
    if (classId && Types.ObjectId.isValid(classId)) {
        const { CharacterClass } = await import("@/features/classes/models/character-class")
        const cls = await CharacterClass.findOne({ _id: new Types.ObjectId(classId), status: "active" }).select("progressionTable").lean<{ progressionTable?: MasteryContext["table"] }>()
        table = cls?.progressionTable ?? null
    }
    return { items, current: new Set((sheet.weaponMasteries ?? []).map((entry) => String(entry.catalogItemId))), level: Math.max(1, Number(sheet.level) || 1), table }
}

// ── Interpretação da resposta ─────────────────────────────────────────────────

export interface PrepInterpretation {
    sheetChanges: CombatSheetChange[]
    overlay: CombatPrepOverlay
    /** Pedidos de criação na ficha ligados a uma opção acrescentada (`ref` → id da opção). */
    links: Map<string, string>
    optionChanges: CombatPrepChange[]
    rider: { dice: string | null; reason: string } | undefined
    dropped: number
    /** DND-49: alterações recusadas por não estarem confirmadas no catálogo (aparecem no card com o motivo). */
    refusals: CombatPrepChange[]
    /** DND-49: quantas alterações de regra foram descartadas por falta de fonte confirmada. */
    droppedWithoutSource: number
}

const attackDetail = (attack: NonNullable<CombatOptionPatch["attack"]>) => `${signed(attack.bonus)} para acertar · ${attack.damage}${attack.damageType ? ` ${attack.damageType}` : ""}${attack.ranged ? " · à distância" : ""}`

function patchDetail(option: CombatOption, patch: CombatOptionPatch): string {
    if (patch.detail?.trim()) return patch.detail.trim()
    if (patch.attack) return attackDetail(patch.attack)
    if (patch.save) return `salvaguarda de ${MADDOX_ABILITY_LABELS[patch.save.ability]} CD ${patch.save.dc}${patch.save.damage ? ` · ${patch.save.damage}` : ""}`
    if (patch.heal) return `cura ${patch.heal.dice}`
    if (patch.economy) return `${ECONOMY_TEXT[patch.economy]}`
    return option.detail
}

/**
 * Opções do servidor que a preparação não altera nem remove (decisão do dono, DND-49 D2): as ações padrão, o desarmado,
 * o ataque de oportunidade, "Outra ação" e a ação preparada seguem as regras fixas do servidor.
 */
export const isFixedServerOption = (optionId: string) => optionId.startsWith("standard:") || ["unarmed", "opportunity", "free", "ready"].includes(optionId)

/** Opção acrescentada que repete um ataque que o servidor resolve pela maestria (Ágil/Nick, Trespassar). */
const repeatsMasteryAttack = (item: { label: string; detail?: string; reason: string }) => {
    const text = `${item.label} ${item.detail ?? ""}`
    const key = masteryKeyFromName(text)
    return key === "nick" || key === "cleave" || /\bmaestria\b/i.test(text) || /outra m[aã]o/i.test(text)
}

export const CATALOG_REFUSAL_PREFIX = "Não confirmada no catálogo do DnDicas"
const FIXED_OPTION_REFUSAL = "esta opção segue a regra fixa do servidor e não é alterada na preparação"
const MASTERY_ATTACK_REFUSAL = "os ataques das maestrias (Ágil, Trespassar) são resolvidos pelo servidor"

/**
 * Confere a resposta da IA contra a lista base, a ficha e as consultas ao catálogo desta execução (DND-49): ids
 * desconhecidos e valores fora da faixa são descartados; alterações de regra sem fonte confirmada (`source` lido e com o
 * trecho no texto) são recusadas e aparecem no card com o motivo.
 */
export function interpretPrep(raw: unknown, context: Pick<PrepSheetContext, "options" | "chargeIds" | "itemIds"> & { mastery?: MasteryContext }, reads: CatalogReadLog = createCatalogReadLog()): PrepInterpretation {
    const response = combatPrepResponseSchema.parse(raw ?? {})
    const all = [...context.options.action, ...context.options.bonus, ...context.options.reactions]
    const byId = new Map(all.map((option) => [option.id, option]))
    const sheetParsed = parseList(combatSheetChangeSchema, response.sheetChanges)
    const modify = parseList(combatModifySchema, response.modify)
    const remove = parseList(combatRemoveSchema, response.remove)
    const add = parseList(combatAddSchema, response.add)
    let dropped = sheetParsed.dropped + modify.dropped + remove.dropped + add.dropped
    let droppedWithoutSource = 0
    const refusals: CombatPrepChange[] = []
    const refuse = (change: Omit<CombatPrepChange, "applied" | "refused">, why: string, sourced: boolean) => {
        dropped += 1
        if (sourced) droppedWithoutSource += 1
        refusals.push({ ...change, applied: false, refused: sourced ? `${CATALOG_REFUSAL_PREFIX}: ${why}.` : `Recusada: ${why}.` })
    }
    const sourceProblem = (source: CatalogSource | undefined) => checkCatalogSource(source, reads)

    const sheetChanges: CombatSheetChange[] = []
    const masteries = new Set(context.mastery?.current ?? [])
    for (const change of sheetParsed.valid) {
        const label = describeSheetChange(change)
        if (requiresCatalogSource("sheet", change)) {
            const problem = sourceProblem(change.source)
            if (problem) {
                refuse({ area: "ficha", label, before: "—", after: "proposta pelo Maddox", reason: change.reason }, problem, true)
                continue
            }
        }
        if (change.type === "weapon-mastery") {
            const itemKey = context.mastery?.items.get(change.catalogItemId)
            if (!itemKey || itemKey !== change.mastery) {
                refuse({ area: "ficha", label, before: "—", after: masteryLabel(change.mastery), reason: change.reason }, "a arma não tem essa maestria no catálogo", true)
                continue
            }
            if (masteries.has(change.catalogItemId)) continue
            // Limite da classe (decisão do dono, DND-49 D1): coluna da progressão; senão, o número no trecho da característica lida.
            const limit = masteryLimit(context.mastery?.table, context.mastery?.level ?? 1, `${change.source?.quote ?? ""} ${change.source ? (catalogReadText(reads, change.source.ref) ?? "") : ""}`)
            if (!limit) {
                refuse({ area: "ficha", label, before: "—", after: masteryLabel(change.mastery), reason: change.reason }, "limite de maestrias não encontrado no catálogo", true)
                continue
            }
            if (masteries.size >= limit) {
                refuse({ area: "ficha", label, before: `${masteries.size} de ${limit}`, after: masteryLabel(change.mastery), reason: change.reason }, `a classe permite ${limit} maestria(s) neste nível`, true)
                continue
            }
            masteries.add(change.catalogItemId)
        }
        sheetChanges.push(change)
    }

    const overlay = emptyOverlay()
    const optionChanges: CombatPrepChange[] = []
    for (const item of modify.valid) {
        const option = byId.get(item.optionId)
        if (!option) {
            dropped += 1
            continue
        }
        if (isFixedServerOption(item.optionId)) {
            refuse({ area: "opcao", label: option.label, before: option.detail, after: item.detail ?? option.detail, reason: item.reason }, FIXED_OPTION_REFUSAL, false)
            continue
        }
        if (requiresCatalogSource("modify", item)) {
            const problem = sourceProblem(item.source)
            if (problem) {
                refuse({ area: "opcao", label: option.label, before: option.detail, after: item.detail ?? (item.attack ? attackDetail({ ...item.attack, damageType: item.attack.damageType ?? null, ranged: item.attack.ranged ?? false, light: item.attack.light ?? false }) : "proposta pelo Maddox"), reason: item.reason }, problem, true)
                continue
            }
        }
        const patch: CombatOptionPatch = {
            ...(item.label ? { label: item.label } : {}),
            ...(item.detail ? { detail: item.detail } : {}),
            ...(item.economy ? { economy: item.economy } : {}),
            ...(item.attack
                ? {
                      attack: {
                          bonus: item.attack.bonus,
                          damage: item.attack.damage,
                          damageType: item.attack.damageType !== undefined ? item.attack.damageType : (option.attack?.damageType ?? null),
                          ranged: item.attack.ranged ?? option.attack?.ranged ?? false,
                          light: item.attack.light ?? option.attack?.light ?? false,
                          finesse: item.attack.finesse ?? option.attack?.finesse,
                      },
                  }
                : {}),
            ...(item.save ? { save: item.save as CombatOptionPatch["save"] } : {}),
            ...(item.heal ? { heal: item.heal } : {}),
        }
        if (patch.attack && !patch.detail) patch.detail = attackDetail(patch.attack)
        overlay.modify.push({ optionId: item.optionId, patch, reason: item.reason })
        optionChanges.push({ area: "opcao", label: option.label, before: option.detail, after: `${patch.label && patch.label !== option.label ? `${patch.label} · ` : ""}${patchDetail(option, patch)}`, reason: item.reason, applied: true })
    }
    for (const item of remove.valid) {
        const option = byId.get(item.optionId)
        if (!option) {
            dropped += 1
            continue
        }
        if (isFixedServerOption(item.optionId)) {
            refuse({ area: "opcao", label: option.label, before: option.detail, after: "removida", reason: item.reason }, FIXED_OPTION_REFUSAL, false)
            continue
        }
        overlay.remove.push({ optionId: item.optionId, reason: item.reason })
        optionChanges.push({ area: "opcao", label: option.label, before: option.detail, after: "removida", reason: item.reason, applied: true })
    }
    const links = new Map<string, string>()
    for (const item of add.valid) {
        if (item.chargeId && !context.chargeIds.has(item.chargeId)) {
            dropped += 1
            continue
        }
        if (item.itemId && !context.itemIds.has(item.itemId)) {
            dropped += 1
            continue
        }
        const proposed = `${ECONOMY_TEXT[item.economy]}${item.detail ? ` · ${item.detail}` : ""}`
        if (repeatsMasteryAttack(item)) {
            refuse({ area: "opcao", label: item.label, before: "não existia", after: proposed, reason: item.reason }, MASTERY_ATTACK_REFUSAL, false)
            continue
        }
        if (requiresCatalogSource("add", item)) {
            const problem = sourceProblem(item.source)
            if (problem) {
                refuse({ area: "opcao", label: item.label, before: "não existia", after: proposed, reason: item.reason }, problem, true)
                continue
            }
        }
        const unresolvable = item.resolution === "attack" ? !item.attack : item.resolution === "save" ? !item.save : item.resolution === "heal" ? !item.heal : item.resolution === "auto" ? !item.attack : false
        const id = `prep:${item.id || randomUUID().slice(0, 8)}`
        const option: PreparedCombatOption = {
            id,
            category: item.category,
            economy: item.economy,
            label: item.label,
            detail: item.detail || (item.attack ? attackDetail(item.attack) : ""),
            target: item.target,
            multiTarget: item.multiTarget,
            resolution: unresolvable ? "utility" : item.resolution,
            ...(item.attack && !unresolvable ? { attack: item.attack } : {}),
            ...(item.save && !unresolvable ? { save: item.save as CombatOptionPatch["save"] } : {}),
            ...(item.heal && !unresolvable ? { heal: item.heal } : {}),
            ...(item.trigger ? { trigger: item.trigger } : {}),
            requires: { chargeId: item.chargeId ?? null, itemId: item.itemId ?? null, spellCircle: item.spellCircle ?? null, concentration: item.concentration ?? false },
        }
        overlay.add.push({ option, reason: item.reason })
        if (item.fromChange) links.set(item.fromChange, id)
        optionChanges.push({ area: "opcao", label: item.label, before: "não existia", after: `${ECONOMY_TEXT[item.economy]}${option.detail ? ` · ${option.detail}` : ""}`, reason: item.reason, applied: true })
    }
    const sneak = response.sneakAttack === undefined || response.sneakAttack === null ? null : sneakAttackSchema.safeParse(response.sneakAttack)
    let rider: PrepInterpretation["rider"]
    if (sneak && !sneak.success) dropped += 1
    else if (sneak?.success) {
        const problem = sourceProblem(sneak.data.source)
        if (problem) refuse({ area: "dano-adicional", label: "Ataque furtivo", before: "valor do servidor", after: sneak.data.dice ? riderLabel({ dice: sneak.data.dice }) : "sem ataque furtivo", reason: sneak.data.reason || "Ajuste do ataque furtivo." }, problem, true)
        else rider = { dice: sneak.data.dice, reason: sneak.data.reason }
    }
    if (droppedWithoutSource && reads.refs.length === 0) {
        refusals.unshift({ area: "aviso", label: "Catálogo", before: "", after: "", reason: reads.failures ? CATALOG_FAILED_NOTICE : CATALOG_NOT_CONSULTED_NOTICE, applied: false })
    }
    return { sheetChanges, overlay, links, optionChanges, rider, dropped, refusals, droppedWithoutSource }
}

export const CATALOG_NOT_CONSULTED_NOTICE = "O Maddox não consultou o catálogo do DnDicas: as correções de regra foram descartadas e vale a lista calculada pelo servidor."
export const CATALOG_FAILED_NOTICE = "A consulta ao catálogo do DnDicas falhou: as correções que dependiam dela foram descartadas e vale a lista calculada pelo servidor."

/** Junta a preparação existente com as mudanças de um pedido de ajuste aceito (a mais nova vence, pelo id da opção). */
export function mergeOverlay(base: CombatPrepOverlay, next: CombatPrepOverlay): CombatPrepOverlay {
    const touched = new Set([...next.modify.map((item) => item.optionId), ...next.remove.map((item) => item.optionId), ...next.add.map((item) => item.option.id)])
    return {
        modify: [...base.modify.filter((item) => !touched.has(item.optionId)), ...next.modify],
        remove: [...base.remove.filter((item) => !touched.has(item.optionId)), ...next.remove],
        add: [...base.add.filter((item) => !touched.has(item.option.id)), ...next.add],
        suppress: [...new Set([...base.suppress, ...next.suppress])],
    }
}

/** Grava as correções na ficha e liga cada criação à opção acrescentada (a lista base não a mostra duas vezes). */
/**
 * Auditoria: no pedido de ajuste, a alteração fica no nome de quem pediu (`requestedBy`); na preparação automática, que
 * ninguém pediu, no do dono da campanha (quem abriu o combate e responde pela mesa).
 */
export async function applyInterpretation(interpretation: PrepInterpretation, context: { sheetId: string; campaign: Pick<IMaddoxCampaign, "_id" | "ownerId">; characterName: string; origin: "combat-prep" | "combat-adjust"; requestedBy?: string | null }): Promise<{ changes: CombatPrepChange[]; suppress: string[] }> {
    const { applySheetChanges } = await import("./combat-sheet-writes")
    const written = await applySheetChanges(interpretation.sheetChanges, { sheetId: context.sheetId, campaignId: String(context.campaign._id), auditUserId: context.requestedBy ?? context.campaign.ownerId, requestedBy: context.requestedBy ?? null, characterName: context.characterName, origin: context.origin })
    const suppress: string[] = []
    for (const [ref] of interpretation.links) {
        const created = written.created.get(ref)
        if (created) suppress.push(created)
    }
    return { changes: written.changes, suppress }
}

function riderOf(serverDice: string | null, rider: PrepInterpretation["rider"]): { riders: CombatPrepRider[]; change: CombatPrepChange | null } {
    const server: CombatPrepRider[] = serverDice ? [{ key: "sneak-attack", dice: serverDice, source: "server", reason: null }] : []
    if (!rider) return { riders: server, change: null }
    if (rider.dice === serverDice) return { riders: server, change: null }
    const before = serverDice ? riderLabel({ dice: serverDice }) : "sem ataque furtivo"
    const after = rider.dice ? riderLabel({ dice: rider.dice }) : "sem ataque furtivo"
    const reason = rider.reason || "Ajustado pela ficha."
    return { riders: rider.dice ? [{ key: "sneak-attack", dice: rider.dice, source: "maddox", reason }] : [], change: { area: "dano-adicional", label: "Ataque furtivo", before, after, reason, applied: true } }
}

/** Card: o aviso do catálogo primeiro, depois o que mudou e, por fim, o que foi recusado (com o motivo). */
export function orderedChanges(interpretation: Pick<PrepInterpretation, "refusals">, applied: readonly CombatPrepChange[]): CombatPrepChange[] {
    const notices = interpretation.refusals.filter((change) => change.area === "aviso")
    return [...notices, ...applied, ...interpretation.refusals.filter((change) => change.area !== "aviso")]
}

// ── Execução ──────────────────────────────────────────────────────────────────

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function activeStateOf(campaignId: Types.ObjectId, prep: Pick<PrepDoc, "combatId" | "actorKey">) {
    const { findActiveTactical } = await import("./tactical-combat")
    const combat = await findActiveTactical(campaignId)
    if (!combat || String(combat._id) !== String(prep.combatId)) return null
    const state = combat.tactical.characters.find((item) => item.actorKey === prep.actorKey)
    return state && !state.left && state.sheetId ? { combat, state } : null
}

async function discard(prepId: Types.ObjectId, reason: string) {
    await MaddoxCombatPrepModel.updateOne({ _id: prepId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
    log.info({ prepId: String(prepId), reason }, "[maddox] preparação descartada")
}

async function runCombatPrep(campaignId: Types.ObjectId, prepId: Types.ObjectId, jobId: string): Promise<void> {
    const claimed = await MaddoxCombatPrepModel.findOneAndUpdate({ _id: prepId, status: "pending" }, { $set: { status: "running", startedAt: new Date(), jobId, error: null }, $inc: { attempts: 1 } }, { returnDocument: "after" }).lean<PrepDoc>()
    if (!claimed) {
        // Descartada enquanto esperava na fila (o jogador saiu): pode ter sido a última que segurava a ordem.
        const settled = await MaddoxCombatPrepModel.findById(prepId).select("status combatId turnNumber waitRound").lean<Pick<PrepDoc, "status" | "combatId" | "turnNumber" | "waitRound">>()
        if (settled?.status === "discarded") await afterPrepSettled(campaignId, settled)
        return
    }
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
        let active = campaign ? await activeStateOf(campaignId, claimed) : null
        if (!campaign || !active) {
            await discard(prepId, "o combate terminou ou o personagem saiu")
            return
        }
        const [{ loadMaddoxSettings, maddoxAvailability }, ai, { readSheetStamp }] = await Promise.all([import("./settings"), import("./combat-prep-ai"), import("./combat-sheet-writes")])
        const { settings } = await loadMaddoxSettings()
        const status = await maddoxAvailability(settings, campaign.rigor)
        if (!status.available) throw new Error(status.reason ?? 'O "Agente Maddox" não está configurado.')
        for (let attempt = 0; ; attempt += 1) {
            const context = await loadPrepSheet(active.state, campaignId)
            if (!context) throw new Error("A ficha do personagem não foi encontrada.")
            const reads = createCatalogReadLog()
            const raw = await ai.reviewCombatSheet({ campaign, characterName: claimed.characterName, sheetText: context.sheetText, optionsText: context.optionsText, sneakAttack: context.sneakAttack, reads, jobId })
            const interpretation = interpretPrep(raw, context, reads)
            active = await activeStateOf(campaignId, claimed)
            if (!active) {
                await discard(prepId, "o combate terminou durante a preparação")
                return
            }
            // O jogador alterou a ficha durante a preparação: vale o dado mais recente, e o Maddox revisa sobre ele.
            if ((await readSheetStamp(active.state.sheetId!)) !== context.stamp && attempt < MADDOX_COMBAT_PREP_CONFLICT_RETRIES) {
                log.info({ campaignId: String(campaignId), prepId: String(prepId), attempt }, "[maddox] a ficha mudou durante a preparação; o Maddox revisa de novo")
                continue
            }
            const written = await applyInterpretation(interpretation, { sheetId: active.state.sheetId!, campaign, characterName: claimed.characterName, origin: "combat-prep" })
            const rider = riderOf(context.sneakAttack, interpretation.rider)
            const changes = orderedChanges(interpretation, [...written.changes, ...interpretation.optionChanges, ...(rider.change ? [rider.change] : [])])
            const overlay = { ...interpretation.overlay, suppress: written.suppress }
            const saved = await MaddoxCombatPrepModel.findOneAndUpdate(
                { _id: prepId, status: "running", jobId },
                { $set: { status: "ready", overlay, riders: rider.riders, changes, catalogRefs: reads.refs, droppedWithoutSource: interpretation.droppedWithoutSource, finishedAt: new Date(), jobId: null, error: null } },
                { returnDocument: "after" },
            ).lean<PrepDoc>()
            if (saved) await postPrepCard(saved)
            if (interpretation.dropped) log.warn({ campaignId: String(campaignId), prepId: String(prepId), dropped: interpretation.dropped, droppedWithoutSource: interpretation.droppedWithoutSource }, "[maddox] itens da preparação descartados na validação")
            log.info(
                { campaignId: String(campaignId), prepId: String(prepId), character: claimed.characterName, changes: changes.length, refs: reads.refs, refsCount: reads.refs.length, catalogFailures: reads.failures, droppedWithoutSource: interpretation.droppedWithoutSource },
                "[maddox] mesa do personagem preparada",
            )
            break
        }
    } catch (error) {
        log.warn({ err: errorText(error), campaignId: String(campaignId), prepId: String(prepId), character: claimed.characterName }, "[maddox] falha na preparação da mesa de combate")
        await MaddoxCombatPrepModel.updateOne({ _id: prepId, status: "running" }, { $set: { status: "failed", error: errorText(error), finishedAt: new Date(), jobId: null } })
    }
    await afterPrepSettled(campaignId, claimed)
}

/** Card privado "Sua mesa está pronta" para o dono do personagem. */
async function postPrepCard(prep: PrepDoc) {
    if (prep.messageId) return
    const message = await MaddoxCampaignMessageModel.create({
        campaignId: prep.campaignId,
        turnNumber: prep.turnNumber,
        phase: "master",
        kind: "combat-prep",
        memberId: prep.memberId,
        userId: prep.userId,
        characterId: prep.characterId,
        characterName: prep.characterName,
        content: "",
        segment: prep.waitRound,
        combatPrep: { combatId: prep.combatId, actorKey: prep.actorKey, characterName: prep.characterName, changes: prep.changes },
    })
    await MaddoxCombatPrepModel.updateOne({ _id: prep._id }, { $set: { messageId: message._id } })
}

/** Depois de cada preparação: com todas prontas, a ordem de iniciativa fecha e a continuação do mestre entra. */
async function afterPrepSettled(campaignId: Types.ObjectId, prep: Pick<PrepDoc, "combatId" | "turnNumber" | "waitRound">) {
    const { publishGameChanged } = await import("./game")
    try {
        if (!(await preparationPending(prep.combatId))) {
            const [{ finishInitiativeIfReady }, { advanceAfterChecks }] = await Promise.all([import("./tactical-combat"), import("./game-checks")])
            await finishInitiativeIfReady(campaignId, prep.turnNumber, prep.waitRound + 1)
            await advanceAfterChecks(campaignId, prep.turnNumber, prep.waitRound)
        }
    } catch (error) {
        log.warn({ err: errorText(error), campaignId: String(campaignId) }, "[maddox] falha ao seguir o combate depois da preparação")
    }
    await publishGameChanged(campaignId)
}

// ── Decisões do dono da campanha ──────────────────────────────────────────────

async function loadOwnerPrep(campaignId: string, prepId: string, userId: string): Promise<{ campaign: IMaddoxCampaign; prep: PrepDoc }> {
    const { loadAsMember, assertActive } = await import("./game")
    const { campaign } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha decide sobre a preparação do combate.", "OWNER_ONLY")
    if (!Types.ObjectId.isValid(prepId)) throw new DomainError(404, "Preparação não encontrada.", "NOT_FOUND")
    const prep = await MaddoxCombatPrepModel.findOne({ _id: new Types.ObjectId(prepId), campaignId: campaign._id }).lean<PrepDoc>()
    if (!prep) throw new DomainError(404, "Preparação não encontrada.", "NOT_FOUND")
    if (prep.status !== "failed") throw new DomainError(409, "Esta preparação não está com falha.", "PREP_NOT_FAILED")
    return { campaign, prep }
}

/** "Tentar de novo": a preparação volta para a fila. */
export async function retryCombatPrep(campaignId: string, prepId: string, userId: string) {
    const { campaign, prep } = await loadOwnerPrep(campaignId, prepId, userId)
    const updated = await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "failed" }, { $set: { status: "pending", error: null, jobId: null } })
    if (updated.modifiedCount === 0) throw new DomainError(409, "A preparação mudou. Atualize a mesa.", "PREP_CHANGED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { combatPrep: String(prep._id), character: prep.characterName, decision: "retry" } })
    await scheduleCombatPreps(campaign._id)
    const { publishGameChanged, getGameState } = await import("./game")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** "Seguir sem preparação": a ficha usa a lista base do servidor (cálculo corrigido e ataque furtivo detectado). */
export async function skipCombatPrep(campaignId: string, prepId: string, userId: string) {
    const { campaign, prep } = await loadOwnerPrep(campaignId, prepId, userId)
    const active = await activeStateOf(campaign._id, prep)
    const context = active ? await loadPrepSheet(active.state, campaign._id).catch(() => null) : null
    const riders: CombatPrepRider[] = context?.sneakAttack ? [{ key: "sneak-attack", dice: context.sneakAttack, source: "server", reason: null }] : []
    const updated = await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "failed" }, { $set: { status: "skipped", overlay: emptyOverlay(), riders, changes: [], finishedAt: new Date(), jobId: null } })
    if (updated.modifiedCount === 0) throw new DomainError(409, "A preparação mudou. Atualize a mesa.", "PREP_CHANGED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { combatPrep: String(prep._id), character: prep.characterName, decision: "skip" } })
    log.info({ campaignId, prepId, character: prep.characterName }, "[maddox] dono seguiu sem a preparação da ficha")
    await afterPrepSettled(campaign._id, prep)
    const { getGameState } = await import("./game")
    return getGameState(campaignId, userId)
}

/** Fim do combate: as preparações que ainda não terminaram são descartadas (nada é gravado na ficha). */
export async function discardCombatPreps(combatId: Types.ObjectId): Promise<void> {
    await MaddoxCombatPrepModel.updateMany({ combatId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
}

/**
 * O membro saiu do combate: a preparação dele deixa de bloquear a ordem. Se era a última pendente (ou a que tinha falhado),
 * a ordem de iniciativa fecha agora — quem chama segue com o `advanceAfterChecks` da rodada.
 */
export async function discardMemberPrep(combatId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    const prep = await MaddoxCombatPrepModel.findOne({ combatId, memberId, status: { $in: BLOCKING } }).select("campaignId turnNumber waitRound").lean<Pick<PrepDoc, "campaignId" | "turnNumber" | "waitRound">>()
    if (!prep) return
    await MaddoxCombatPrepModel.updateMany({ combatId, memberId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
    if (await preparationPending(combatId)) return
    const { finishInitiativeIfReady } = await import("./tactical-combat")
    await finishInitiativeIfReady(prep.campaignId, prep.turnNumber, prep.waitRound + 1)
}

/** Preparações do combate (para o DTO), na ordem de criação. */
export async function loadCombatPreps(combatId: Types.ObjectId | string): Promise<PrepDoc[]> {
    return MaddoxCombatPrepModel.find({ combatId: new Types.ObjectId(String(combatId)) }).sort({ _id: 1 }).lean<PrepDoc[]>()
}

export { track as trackCombatPrepWork }
