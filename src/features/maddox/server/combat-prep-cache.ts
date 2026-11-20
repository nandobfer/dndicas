import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { diffPrepFingerprint, prepFingerprint, PREP_FULL_REASONS, stableHash, type PrepCacheDecision, type PrepFingerprint, type PrepSheetSnapshot } from "../combat-prep-cache"
import type { CombatPrepOverlay, CombatPrepRider } from "../combat-types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_COMBAT_PREP_CACHE_VERSION } from "../constants"
import { MaddoxCombatPrepCacheModel, type IMaddoxCampaign, type IMaddoxCombatPrepCache } from "../models"

/**
 * Cache da preparação da mesa de combate (DND-78) — SOMENTE servidor. Guarda a última preparação pronta de cada
 * personagem na campanha com a impressão digital da ficha (por partes) e das entidades do catálogo que ela usa, decide
 * na abertura do combate se a preparação é reaproveitada, parcial ou inteira, e atende o "Repreparar ficha" do dono.
 */

const log = loggerFor({ module: "maddox", feature: "combat-prep-cache" })

type Id = Types.ObjectId | string
const oid = (id: Id) => (typeof id === "string" ? new Types.ObjectId(id) : id)
const idOf = (value: unknown): string | null => (value ? String(value) : null)

type SheetDoc = Record<string, unknown>
interface SnapshotLists {
    attacks: { _id: unknown; name?: string; attackBonus?: string; damageType?: unknown }[]
    traits: { _id: unknown; name?: string; description?: string; catalogTraitId?: unknown }[]
    feats: { _id: unknown; name?: string; description?: string; catalogFeatId?: unknown }[]
    spells: { _id: unknown; name?: string; circle?: number | null; prepared?: boolean; castingTime?: string; concentration?: boolean; catalogSpellId?: unknown }[]
    items: { _id: unknown; name?: string; quantity?: number; equipped?: boolean; catalogItemId?: unknown; catalogItemType?: string | null }[]
}

const SKILL_KEYS = (skills: unknown) =>
    Object.fromEntries(
        Object.entries((skills ?? {}) as Record<string, { proficient?: boolean; expertise?: boolean } | null>)
            .filter(([, value]) => value?.proficient || value?.expertise)
            .map(([key, value]) => [key, value?.expertise ? "expertise" : "proficient"]),
    )

/** Retrato da ficha que importa para a preparação (fora o que muda no jogo: PV, usos, moedas, quantidade, bônus temporários). */
export function snapshotOf(sheet: SheetDoc, lists: SnapshotLists): PrepSheetSnapshot {
    const slots = Object.fromEntries(Object.entries((sheet.spellSlots ?? {}) as Record<string, { total?: number } | null>).map(([circle, slot]) => [circle, slot?.total ?? 0]))
    const core = {
        level: sheet.level ?? null,
        class: sheet.class ?? null,
        subclass: sheet.subclass ?? null,
        race: sheet.race ?? null,
        origin: sheet.origin ?? null,
        abilities: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((key) => sheet[key] ?? null),
        savingThrows: sheet.savingThrows ?? {},
        skills: SKILL_KEYS(sheet.skills),
        proficiencyBonusOverride: sheet.proficiencyBonusOverride ?? null,
        weaponProficiencies: sheet.weaponProficiencies ?? null,
        armorTraining: sheet.armorTraining ?? {},
        weaponMasteries: ((sheet.weaponMasteries ?? []) as { catalogItemId?: unknown; mastery?: string }[]).map((entry) => [idOf(entry.catalogItemId), entry.mastery ?? null]),
        spellcastingAttribute: sheet.spellcastingAttribute ?? null,
        spellSaveDCOverride: sheet.spellSaveDCOverride ?? null,
        spellAttackBonusOverride: sheet.spellAttackBonusOverride ?? null,
        spellSlots: slots,
        armorClassOverride: sheet.armorClassOverride ?? null,
        unarmoredDefense: sheet.unarmoredDefense ?? null,
        classFeatures: sheet.classFeatures ?? null,
        speciesTraits: sheet.speciesTraits ?? null,
        featuresNotes: sheet.featuresNotes ?? null,
    }
    return {
        core,
        attacks: lists.attacks.map((attack) => ({ id: String(attack._id), name: String(attack.name ?? ""), attackBonus: String(attack.attackBonus ?? ""), damageType: attack.damageType ?? null })),
        items: lists.items.map((item) => ({ id: String(item._id), name: String(item.name ?? ""), equipped: Boolean(item.equipped), catalogItemId: idOf(item.catalogItemId), catalogItemType: item.catalogItemType ?? null, available: (item.quantity ?? 1) > 0 })),
        traits: lists.traits.map((trait) => ({ id: String(trait._id), name: String(trait.name ?? ""), description: String(trait.description ?? ""), catalogId: idOf(trait.catalogTraitId) })),
        feats: lists.feats.map((feat) => ({ id: String(feat._id), name: String(feat.name ?? ""), description: String(feat.description ?? ""), catalogId: idOf(feat.catalogFeatId) })),
        spells: lists.spells.map((spell) => ({ id: String(spell._id), name: String(spell.name ?? ""), circle: spell.circle ?? null, prepared: Boolean(spell.prepared), castingTime: String(spell.castingTime ?? ""), concentration: Boolean(spell.concentration), catalogId: idOf(spell.catalogSpellId) })),
        charges: ((sheet.resourceCharges ?? []) as { id: string; name?: string; total?: number }[]).map((charge) => ({ id: String(charge.id), name: String(charge.name ?? ""), total: Number(charge.total) || 0 })),
    }
}

/** Lê a ficha e as coleções filhas e monta o retrato (depois de gravar as correções da preparação). */
export async function readPrepSnapshot(sheetId: Id): Promise<PrepSheetSnapshot | null> {
    const id = oid(sheetId)
    const [{ CharacterSheet }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }, { CharacterItem }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
        import("@/features/character-sheets/models/character-item"),
    ])
    const [sheet, attacks, traits, feats, spells, items] = await Promise.all([
        CharacterSheet.findById(id).lean<SheetDoc>(),
        CharacterAttack.find({ sheetId: id }).sort({ _id: 1 }).lean<SnapshotLists["attacks"]>(),
        CharacterTrait.find({ sheetId: id }).sort({ _id: 1 }).lean<SnapshotLists["traits"]>(),
        CharacterFeat.find({ sheetId: id }).sort({ _id: 1 }).lean<SnapshotLists["feats"]>(),
        CharacterSpell.find({ sheetId: id }).sort({ _id: 1 }).lean<SnapshotLists["spells"]>(),
        CharacterItem.find({ sheetId: id }).sort({ _id: 1 }).lean<SnapshotLists["items"]>(),
    ])
    return sheet ? snapshotOf(sheet, { attacks, traits, feats, spells, items }) : null
}

/** Contexto da preparação que entra na impressão digital: versão do cache, instruções configuráveis e grau da campanha. */
export async function prepCacheContext(rigor: IMaddoxCampaign["rigor"]): Promise<{ version: number; instructions: string; rigor: string }> {
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    return { version: MADDOX_COMBAT_PREP_CACHE_VERSION, instructions: String((settings as { combatPrepInstructions?: string }).combatPrepInstructions ?? ""), rigor: String(rigor) }
}

/** Hash do conteúdo de cada entidade do catálogo (`Tipo:id`); a que não existe mais fica com o hash de "ausente". */
export async function catalogHashes(refs: readonly string[]): Promise<{ ref: string; hash: string }[]> {
    const unique = [...new Set(refs.filter((ref) => ref.indexOf(":") > 0))].sort()
    const byType = new Map<string, string[]>()
    for (const ref of unique) {
        const index = ref.indexOf(":")
        const type = ref.slice(0, index)
        byType.set(type, [...(byType.get(type) ?? []), ref.slice(index + 1)])
    }
    const { catalogDocsByIds } = await import("./catalog-references")
    const docs = new Map<string, unknown>()
    for (const [type, ids] of byType) {
        // Falha na leitura propaga: "ausente" só vale para entidade que de fato saiu do catálogo, nunca para leitura que falhou.
        const found = await catalogDocsByIds(type, ids)
        for (const [id, doc] of found) docs.set(`${type}:${id}`, doc)
    }
    return unique.map((ref) => ({ ref, hash: stableHash(docs.get(ref) ?? "ausente") }))
}

export interface PrepCacheVerdict {
    decision: PrepCacheDecision
    cache: IMaddoxCombatPrepCache | null
}

/**
 * Decide, na abertura do combate, o que fazer com a preparação guardada: reaproveitar (`hit`), preparar só o que mudou
 * (`partial`) ou a ficha inteira (`full`, com o motivo quando havia cache). Nunca serve cache de outra campanha, outro
 * personagem, outra ficha, invalidado pelo dono, ou com uma entidade do catálogo que mudou.
 */
export async function decidePrepCache(input: { campaignId: Id; characterId: Id; sheetId: Id; fingerprint: PrepFingerprint }): Promise<PrepCacheVerdict> {
    const cache = await MaddoxCombatPrepCacheModel.findOne({ campaignId: oid(input.campaignId), characterId: oid(input.characterId) }).lean<IMaddoxCombatPrepCache>()
    if (!cache) return { decision: { kind: "full", reason: PREP_FULL_REASONS.none }, cache: null }
    if (String(cache.sheetId) !== String(input.sheetId)) return { decision: { kind: "full", reason: PREP_FULL_REASONS.sheet }, cache }
    if (cache.invalidatedAt) return { decision: { kind: "full", reason: PREP_FULL_REASONS.invalidated }, cache }
    const decision = diffPrepFingerprint(cache.fingerprint, input.fingerprint)
    if (decision.kind === "full") return { decision, cache }
    if (!(await catalogStillMatches(cache))) return { decision: { kind: "full", reason: PREP_FULL_REASONS.catalog }, cache }
    return { decision, cache }
}

/** As entidades do catálogo guardadas no cache continuam iguais. Leitura que falhou conta como "mudou" (prepara inteira). */
async function catalogStillMatches(cache: Pick<IMaddoxCombatPrepCache, "catalog" | "campaignId" | "characterName">): Promise<boolean> {
    try {
        const current = await catalogHashes((cache.catalog ?? []).map((entry) => entry.ref))
        const saved = new Map((cache.catalog ?? []).map((entry) => [entry.ref, entry.hash]))
        return current.every((entry) => saved.get(entry.ref) === entry.hash)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(cache.campaignId), character: cache.characterName }, "[maddox] falha ao ler o catálogo para conferir o cache da preparação; a ficha é preparada inteira")
        return false
    }
}

/** A impressão guardada é a mesma que a atual (contexto, base e todas as partes). */
const sameFingerprint = (a: PrepFingerprint, b: PrepFingerprint) => diffPrepFingerprint(a, b).kind === "hit"

/** O overlay gravado no cache, sem a marca "veio do cache" (ela é posta ao reaproveitar). */
const storedOverlay = (overlay: CombatPrepOverlay): CombatPrepOverlay => {
    const clean = <T extends { fromCache?: boolean }>(entry: T) => {
        const { fromCache, ...rest } = entry
        void fromCache
        return rest
    }
    return { modify: overlay.modify.map(clean), remove: overlay.remove.map(clean), add: overlay.add.map(clean), suppress: [...overlay.suppress] }
}

/**
 * Grava (ou troca) o cache do personagem com a preparação pronta. A impressão digital é lida DEPOIS das correções que o
 * Maddox gravou na ficha (senão o próximo combate nunca acertaria). `expectedStamp`: carimbo da ficha logo depois da
 * gravação; se o jogador mexeu na ficha nesse meio-tempo, o cache não é gravado (o próximo combate prepara o que mudou).
 */
export async function savePrepCache(input: {
    campaign: Pick<IMaddoxCampaign, "_id" | "rigor">
    characterId: Id
    sheetId: Id
    characterName: string
    overlay: CombatPrepOverlay
    riders: CombatPrepRider[]
    catalogRefs: readonly string[]
    prepId: Id | null
    combatId: Id | null
    preparedAt?: Date
    /**
     * `invalidatedAt` lido com o veredito (`null` = cache válido; `undefined` = não havia cache). Se o dono pedir "Repreparar
     * ficha" enquanto a preparação roda, o valor no banco muda e a gravação não desfaz o pedido.
     */
    readInvalidatedAt?: Date | null
}): Promise<void> {
    try {
        const { readSheetStamp } = await import("./combat-sheet-writes")
        const before = await readSheetStamp(String(input.sheetId))
        const snapshot = await readPrepSnapshot(input.sheetId)
        if (!snapshot) return
        const fingerprint = prepFingerprint(snapshot, await prepCacheContext(input.campaign.rigor))
        const catalog = await catalogHashes(input.catalogRefs)
        if ((await readSheetStamp(String(input.sheetId))) !== before) {
            log.info({ campaignId: String(input.campaign._id), character: input.characterName }, "[maddox] a ficha mudou ao gravar o cache da preparação; o cache não foi gravado")
            return
        }
        const key = { campaignId: oid(String(input.campaign._id)), characterId: oid(input.characterId) }
        // Havia cache: só troca se a invalidação ainda é a lida no veredito. Não havia: só cria (a corrida cai no índice único).
        const filter = input.readInvalidatedAt === undefined ? key : { ...key, invalidatedAt: input.readInvalidatedAt }
        const result = await MaddoxCombatPrepCacheModel.updateOne(
            filter,
            {
                $set: {
                    sheetId: oid(input.sheetId),
                    characterName: input.characterName,
                    fingerprint,
                    catalog,
                    overlay: storedOverlay(input.overlay),
                    riders: input.riders,
                    preparedAt: input.preparedAt ?? new Date(),
                    sourcePrepId: input.prepId ? oid(input.prepId) : null,
                    sourceCombatId: input.combatId ? oid(input.combatId) : null,
                    invalidatedAt: null,
                    invalidatedBy: null,
                },
            },
            { upsert: input.readInvalidatedAt === undefined },
        )
        if (input.readInvalidatedAt !== undefined && result.matchedCount === 0) {
            log.info({ campaignId: String(input.campaign._id), character: input.characterName }, "[maddox] o cache da preparação mudou (repreparação pedida) durante a preparação; não foi regravado")
        }
    } catch (error) {
        // O cache é só economia: a falha nunca derruba a preparação (o próximo combate prepara de novo).
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(input.campaign._id), character: input.characterName }, "[maddox] falha ao gravar o cache da preparação")
    }
}

/**
 * Pedido de ajuste aceito: o cache passa a ter o overlay novo. A impressão e o catálogo só são regravados se a ficha
 * (lida logo antes de gravar o ajuste, `before`) e o catálogo ainda batem com o cache; senão o cache guarda só o overlay e
 * os riders, e o próximo combate prepara o que mudou (a mudança da ficha ou do catálogo nunca é "absorvida" pelo ajuste).
 */
export async function refreshPrepCacheOverlay(input: { campaign: Pick<IMaddoxCampaign, "_id" | "rigor">; characterId: Id; sheetId: Id; characterName: string; overlay: CombatPrepOverlay; riders: CombatPrepRider[]; catalogRefs: readonly string[]; prepId: Id; combatId: Id; before: PrepSheetSnapshot | null }): Promise<void> {
    try {
        const cache = await MaddoxCombatPrepCacheModel.findOne({ campaignId: oid(String(input.campaign._id)), characterId: oid(input.characterId) }).lean<IMaddoxCombatPrepCache>()
        if (!cache || cache.invalidatedAt || String(cache.sheetId) !== String(input.sheetId)) return
        const matches = Boolean(input.before) && sameFingerprint(cache.fingerprint, prepFingerprint(input.before!, await prepCacheContext(input.campaign.rigor))) && (await catalogStillMatches(cache))
        if (matches) {
            await savePrepCache({ ...input, catalogRefs: [...(cache.catalog ?? []).map((entry) => entry.ref), ...input.catalogRefs], preparedAt: cache.preparedAt, readInvalidatedAt: null })
            return
        }
        await MaddoxCombatPrepCacheModel.updateOne({ _id: cache._id, invalidatedAt: null }, { $set: { overlay: storedOverlay(input.overlay), riders: input.riders } })
        log.info({ campaignId: String(input.campaign._id), character: input.characterName }, "[maddox] ajuste aceito com a ficha ou o catálogo diferentes do cache: só o overlay foi atualizado")
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(input.campaign._id), character: input.characterName }, "[maddox] falha ao atualizar o cache da preparação depois do ajuste")
    }
}

/** Situação do cache de cada personagem da campanha (para o dono, no card "Na mesa"). */
export async function loadPrepCacheStatus(campaignId: Id): Promise<Map<string, { preparedAt: string; invalidated: boolean }>> {
    const caches = await MaddoxCombatPrepCacheModel.find({ campaignId: oid(campaignId) }).select("characterId preparedAt invalidatedAt").lean<Pick<IMaddoxCombatPrepCache, "characterId" | "preparedAt" | "invalidatedAt">[]>()
    return new Map(caches.map((cache) => [String(cache.characterId), { preparedAt: new Date(cache.preparedAt).toISOString(), invalidated: Boolean(cache.invalidatedAt) }]))
}

/**
 * "Repreparar ficha" (DND-78): o dono da campanha invalida o cache do personagem. A preparação do combate atual não muda;
 * o próximo combate prepara a ficha inteira. Sem cache, nada a fazer.
 */
export async function invalidateCombatPrepCache(campaignId: string, characterId: string, userId: string) {
    const { loadAsMember, publishGameChanged, getGameState } = await import("./game")
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pede a repreparação da ficha.", "OWNER_ONLY")
    if (!Types.ObjectId.isValid(characterId)) throw new DomainError(404, "Personagem não encontrado.", "NOT_FOUND")
    const updated = await MaddoxCombatPrepCacheModel.findOneAndUpdate(
        { campaignId: campaign._id, characterId: new Types.ObjectId(characterId), invalidatedAt: null },
        { $set: { invalidatedAt: new Date(), invalidatedBy: userId } },
        { returnDocument: "after" },
    ).lean<IMaddoxCombatPrepCache>()
    if (!updated) return getGameState(campaignId, userId)
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { combatPrepCache: String(updated._id), character: updated.characterName, decision: "reprepare" } })
    log.info({ campaignId, characterId, character: updated.characterName }, "[maddox] dono pediu a repreparação da ficha no próximo combate")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** Reinício da campanha: o cache de todos os personagens sai junto. */
export async function clearCampaignPrepCache(campaignId: Id): Promise<void> {
    await MaddoxCombatPrepCacheModel.deleteMany({ campaignId: oid(campaignId) })
}
