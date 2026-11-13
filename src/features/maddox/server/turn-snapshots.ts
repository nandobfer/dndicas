import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import {
    INCLUDE_DISCARDED,
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCampaignSnapshotModel,
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxCombatPrepModel,
    MaddoxNpcModel,
    type IMaddoxCampaign,
    type IMaddoxCampaignSnapshot,
    type IMaddoxSheetSnapshot,
} from "../models"
import { excerptOf } from "../rewind-plan"

/**
 * Retratos da mesa para a volta a um turno (DND-44) — SOMENTE servidor.
 *
 * `captureTurnSnapshot` roda quando a vez dos jogadores de um turno abre (fim do turno do mestre ou vez de um personagem
 * no combate tático) e guarda tudo o que o jogo muda a partir dali: cenário e situação, NPCs, situação atual dos
 * personagens, fichas inteiras (com itens, ataques, traços, talentos e magias), combates ativos, preparação do combate,
 * as mensagens que ainda podiam mudar e a execução dos Personagens Opex. `restoreSnapshot` repõe tudo isso.
 * Falha na captura nunca derruba o turno: o turno só fica fora da lista de "Voltar ao turno…".
 */

const log = loggerFor({ module: "maddox", feature: "rewind" })

/** Mensagens que mudam depois de gravadas (situação de testes, rolagens, reações, ações e lembranças). */
const MUTABLE_KINDS = ["check", "combat-roll", "combat-reaction", "combat-action", "reminder", "rest"] as const

type Doc = Record<string, unknown> & { _id: Types.ObjectId }

export async function sheetsOf(sheetIds: readonly Types.ObjectId[]): Promise<IMaddoxSheetSnapshot[]> {
    if (!sheetIds.length) return []
    const [{ CharacterSheet }, { CharacterItem }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
    ])
    const filter = { sheetId: { $in: sheetIds } }
    const [sheets, items, attacks, traits, feats, spells] = await Promise.all([
        CharacterSheet.find({ _id: { $in: sheetIds } }).lean<Doc[]>(),
        CharacterItem.find(filter).lean<Doc[]>(),
        CharacterAttack.find(filter).lean<Doc[]>(),
        CharacterTrait.find(filter).lean<Doc[]>(),
        CharacterFeat.find(filter).lean<Doc[]>(),
        CharacterSpell.find(filter).lean<Doc[]>(),
    ])
    const of = (rows: Doc[], id: Types.ObjectId) => rows.filter((row) => String(row.sheetId) === String(id))
    return sheetIds.map((sheetId) => ({
        sheetId,
        sheet: sheets.find((sheet) => String(sheet._id) === String(sheetId)) ?? null,
        items: of(items, sheetId),
        attacks: of(attacks, sheetId),
        traits: of(traits, sheetId),
        feats: of(feats, sheetId),
        spells: of(spells, sheetId),
    }))
}

/** Primeiras palavras da narração do turno; sem narração (vez de um personagem no combate), "Vez de <personagem>". */
async function excerptForTurn(campaign: Pick<IMaddoxCampaign, "_id" | "turn">, turnNumber: number): Promise<string> {
    const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: campaign._id, turnNumber, kind: "narration", error: null }).sort({ _id: -1 }).select("content").lean<{ content: string }>()
    const text = narration?.content ? excerptOf(narration.content) : ""
    if (text) return text
    const actor = campaign.turn?.combatActor
    if (actor) {
        const member = await MaddoxCampaignMemberModel.findById(actor.memberId).select("characterId").lean<{ characterId?: Types.ObjectId | null }>()
        const character = member?.characterId ? await MaddoxCharacterModel.findById(member.characterId).select("name").lean<{ name: string }>() : null
        if (character?.name) return `Vez de ${character.name}`
    }
    return ""
}

/** Tudo o que o retrato guarda (sem gravar). */
async function collect(campaign: IMaddoxCampaign, turnNumber: number): Promise<Omit<IMaddoxCampaignSnapshot, "_id" | "kind" | "rewindId" | "createdAt" | "phase" | "memories" | "pendingWrites" | "turn">> {
    const campaignId = campaign._id
    const last = await MaddoxCampaignMessageModel.findOne({ campaignId }).sort({ _id: -1 }).select("_id").lean<{ _id: Types.ObjectId }>()
    const [npcs, characters, combats, allCombatIds, opexMembers] = await Promise.all([
        MaddoxNpcModel.find({ campaignId }).select("+opex.engramind.tokenBox").lean<Doc[]>(),
        MaddoxCharacterModel.find({ campaignId }).select("currentState currentStatePublic status sheetId").lean<{ _id: Types.ObjectId; currentState?: string; currentStatePublic?: boolean; status: string; sheetId?: Types.ObjectId | null }[]>(),
        MaddoxCombatModel.find({ campaignId, status: "active" }).lean<Doc[]>(),
        MaddoxCombatModel.find({ campaignId }).distinct("_id") as Promise<Types.ObjectId[]>,
        MaddoxCampaignMemberModel.find({ campaignId, kind: "opex" }).select("opex.run").lean<{ _id: Types.ObjectId; opex?: { run?: unknown } | null }[]>(),
    ])
    const messages = last
        ? await MaddoxCampaignMessageModel.find({
              campaignId,
              _id: { $lte: last._id },
              kind: { $in: MUTABLE_KINDS },
              $or: [{ turnNumber: { $gte: turnNumber - 1 } }, { "reminder.status": "pending" }, { "check.status": "pending" }, { "combatRoll.status": "pending" }, { "combatReaction.status": "pending" }, { "combatAction.status": "pending" }, { "rest.status": "running" }],
          }).lean<Doc[]>()
        : []
    const preps = combats.length ? await MaddoxCombatPrepModel.find({ combatId: { $in: combats.map((combat) => combat._id) } }).lean<Doc[]>() : []
    const sheetIds = characters.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    return {
        campaignId,
        turnNumber,
        takenAt: new Date(),
        boundaryMessageId: last?._id ?? null,
        excerpt: await excerptForTurn(campaign, turnNumber),
        state: (campaign.state as unknown as Record<string, unknown>) ?? null,
        progression: { progression: campaign.progression ?? null, levelUps: campaign.levelUps ?? [], chapters: campaign.chapters ?? [] },
        npcs,
        characters: characters.map((character) => ({ _id: character._id, currentState: character.currentState ?? "", currentStatePublic: Boolean(character.currentStatePublic), status: character.status })),
        sheets: await sheetsOf(sheetIds),
        combats,
        combatIds: allCombatIds,
        preps,
        messages,
        opexRuns: opexMembers.map((member) => ({ memberId: member._id, run: member.opex?.run ?? null })),
    }
}

/**
 * Retrato do turno `turnNumber` (a vez dos jogadores acabou de abrir). Substitui o anterior do mesmo turno. Nunca lança:
 * sem retrato, o turno só não aparece em "Voltar ao turno…".
 */
export async function captureTurnSnapshot(campaignId: Types.ObjectId, turnNumber: number): Promise<void> {
    try {
        await dbConnect()
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
        if (!campaign || campaign.status !== "active" || campaign.turn?.number !== turnNumber) return
        const data = await collect(campaign, turnNumber)
        const turn = campaign.turn.combatActor ? { combatActor: campaign.turn.combatActor } : { combatActor: null }
        await MaddoxCampaignSnapshotModel.replaceOne({ campaignId, kind: "turn", turnNumber }, { ...data, kind: "turn", rewindId: null, turn, memories: [], pendingWrites: [], phase: "players" }, { upsert: true })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), turnNumber }, "[maddox] falha ao guardar o retrato do turno")
    }
}

/** Retrato de origem da volta pendente (o turno inteiro, na fase em que estava). */
export async function captureOriginSnapshot(campaign: IMaddoxCampaign, rewindId: string): Promise<IMaddoxCampaignSnapshot> {
    const data = await collect(campaign, campaign.turn.number)
    const created = await MaddoxCampaignSnapshotModel.create({ ...data, kind: "origin", rewindId, turn: campaign.turn as unknown as Record<string, unknown>, memories: [], pendingWrites: [], phase: campaign.turn.phase })
    return created.toObject() as IMaddoxCampaignSnapshot
}

const idsOf = (rows: readonly { _id: unknown }[]) => rows.map((row) => row._id as Types.ObjectId)

/**
 * Repõe o retrato: cenário e situação, NPCs (os que surgiram depois somem, os alterados voltam), situação atual dos
 * personagens, fichas, combates (o iniciado depois é desfeito), preparação do combate, mensagens que mudaram e a execução
 * dos Personagens Opex. O turno da campanha é responsabilidade de quem chama.
 */
export async function restoreSnapshot(snapshot: IMaddoxCampaignSnapshot): Promise<void> {
    const campaignId = snapshot.campaignId
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { state: snapshot.state ?? {} } }, { timestamps: false })
    // Progressão de nível (DND-56): subidas, níveis declarados e capítulos voltam ao turno (retratos antigos não têm).
    if (snapshot.progression) await MaddoxCampaignModel.collection.updateOne({ _id: campaignId }, { $set: { progression: snapshot.progression.progression ?? null, levelUps: snapshot.progression.levelUps ?? [], chapters: snapshot.progression.chapters ?? [] } })

    const npcIds = idsOf(snapshot.npcs as { _id: unknown }[])
    await MaddoxNpcModel.deleteMany({ campaignId, _id: { $nin: npcIds } })
    for (const npc of snapshot.npcs) await MaddoxNpcModel.replaceOne({ _id: npc._id as Types.ObjectId }, npc, { upsert: true, timestamps: false })

    for (const character of snapshot.characters) {
        await MaddoxCharacterModel.updateOne({ _id: character._id }, { $set: { currentState: character.currentState, currentStatePublic: character.currentStatePublic, status: character.status } }, { timestamps: false })
    }

    await restoreSheets(snapshot.sheets)

    // Combates: o que nasceu depois do retrato some (desfaz o combate iniciado depois); os ativos no retrato voltam inteiros.
    const removedCombats = idsOf(await MaddoxCombatModel.find({ campaignId, _id: { $nin: snapshot.combatIds } }).select("_id").lean<{ _id: Types.ObjectId }[]>())
    const activeIds = idsOf(snapshot.combats as { _id: unknown }[])
    if (removedCombats.length) await MaddoxCombatModel.deleteMany({ _id: { $in: removedCombats } })
    await MaddoxCombatModel.deleteMany({ _id: { $in: activeIds } })
    if (snapshot.combats.length) await MaddoxCombatModel.insertMany(snapshot.combats as never[], { ordered: true })
    await MaddoxCombatPrepModel.deleteMany({ campaignId, combatId: { $in: [...removedCombats, ...activeIds] } })
    if (snapshot.preps.length) await MaddoxCombatPrepModel.insertMany(snapshot.preps as never[], { ordered: false })

    for (const message of snapshot.messages) {
        await MaddoxCampaignMessageModel.replaceOne({ _id: message._id as Types.ObjectId }, { ...message, discardedBy: null }, { ...INCLUDE_DISCARDED, timestamps: false })
    }
    for (const entry of snapshot.opexRuns) await MaddoxCampaignMemberModel.updateOne({ _id: entry.memberId, opex: { $ne: null } }, { $set: { "opex.run": entry.run } })
}

/** Repõe as fichas (com itens, ataques, traços, talentos e magias) e avisa as fichas abertas. */
export async function restoreSheets(sheets: readonly IMaddoxSheetSnapshot[]): Promise<void> {
    if (!sheets.length) return
    const [{ CharacterSheet }, { CharacterItem }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
    ])
    const children = [
        [CharacterItem, "items"],
        [CharacterAttack, "attacks"],
        [CharacterTrait, "traits"],
        [CharacterFeat, "feats"],
        [CharacterSpell, "spells"],
    ] as const
    for (const entry of sheets) {
        if (entry.sheet) await CharacterSheet.replaceOne({ _id: entry.sheetId }, entry.sheet, { upsert: true, timestamps: false })
        for (const [model, field] of children) {
            const rows = entry[field]
            await (model as unknown as typeof CharacterItem).deleteMany({ sheetId: entry.sheetId })
            if (rows.length) await (model as unknown as typeof CharacterItem).insertMany(rows as never[], { ordered: false })
        }
    }
    const { publishPatched } = await import("./combat-sheet")
    for (const entry of sheets) await publishPatched(String(entry.sheetId))
}

// ── Cópia das fichas no início (DND-50) ─────────────────────────────────────

/** Fichas dos personagens com a entrevista concluída. */
async function startSheetIds(campaignId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const characters = await MaddoxCharacterModel.find({ campaignId, "interview.status": "done", sheetId: { $ne: null } }).select("sheetId").lean<{ sheetId: Types.ObjectId }[]>()
    return characters.map((character) => character.sheetId)
}

/**
 * "Iniciar campanha" (DND-50): guarda a cópia das fichas para onde o reinício as devolve (substitui a anterior). Nunca
 * lança: sem cópia, o reinício usa o retrato do 1º turno ou o ajuste pelo Maddox.
 */
export async function captureStartCopy(campaignId: Types.ObjectId): Promise<void> {
    try {
        await dbConnect()
        const sheets = await sheetsOf(await startSheetIds(campaignId))
        await MaddoxCampaignSnapshotModel.replaceOne(
            { campaignId, kind: "start" },
            { campaignId, kind: "start", turnNumber: 0, rewindId: null, takenAt: new Date(), boundaryMessageId: null, excerpt: "", state: null, turn: null, npcs: [], characters: [], sheets, combats: [], combatIds: [], preps: [], messages: [], opexRuns: [], memories: [], pendingWrites: [], phase: null },
            { upsert: true },
        )
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] falha ao guardar a cópia das fichas do início")
    }
}

/**
 * Entrevista concluída com a campanha já iniciada (DND-50): a ficha desse personagem entra na cópia do início (ou a
 * substitui). Sem cópia (campanha iniciada antes do DND-50), cria uma só com ela. Nunca lança.
 */
export async function addToStartCopy(campaignId: Types.ObjectId, sheetId: Types.ObjectId): Promise<void> {
    try {
        await dbConnect()
        const [entry] = await sheetsOf([sheetId])
        if (!entry) return
        const existing = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "start" }).select("sheets").lean<Pick<IMaddoxCampaignSnapshot, "sheets">>()
        const sheets = [...(existing?.sheets ?? []).filter((item) => String(item.sheetId) !== String(sheetId)), entry]
        await MaddoxCampaignSnapshotModel.updateOne(
            { campaignId, kind: "start" },
            { $set: { sheets }, $setOnInsert: { turnNumber: 0, rewindId: null, takenAt: new Date(), boundaryMessageId: null, excerpt: "", state: null, turn: null, npcs: [], characters: [], combats: [], combatIds: [], preps: [], messages: [], opexRuns: [], memories: [], pendingWrites: [], phase: null } },
            { upsert: true },
        )
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), sheetId: String(sheetId) }, "[maddox] falha ao guardar a ficha na cópia do início")
    }
}
