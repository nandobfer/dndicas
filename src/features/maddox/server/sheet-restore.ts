import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_RESET_TEXTS, MADDOX_SHEET_AUDIT_ENTITY, MADDOX_SHEET_RESTORE_STALE_MS } from "../constants"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxCharacter, type IMaddoxInterview } from "../models"
import { plainText } from "../combat-options"
import type { MaddoxCampaignDetailDto, MaddoxSheetRestoreDto } from "../campaign-types"
import { parseSheetRestoreChanges, SHEET_RESTORE_COLLECTIONS, SHEET_RESTORE_FIELDS, type SheetRestoreChange, type SheetRestoreCollection, type SheetRestoreField } from "../sheet-restore-schemas"
import { isOpexRunning, runOpexOnce } from "./opex-runtime"

/**
 * Ajuste da ficha pelo Maddox no reinício da campanha (DND-50) — SOMENTE servidor. Vale para o personagem sem cópia da
 * ficha do início e sem retrato do 1º turno: o servidor calcula a ficha que a entrevista gerou (a referência), o Maddox
 * compara com a atual e devolve a lista fechada de alterações (`sheetRestoreChangeSchema`), com os valores sempre tirados
 * da referência. Cada alteração aplicada é auditada (`FichaPersonagem`).
 *
 * Um ajuste por personagem (`runOpexOnce("sheet-restore:<id>")`); enquanto algum estiver `pending`, "Iniciar campanha" é
 * recusado. Falha: a ficha fica como estava, o dono vê o aviso com "Tentar de novo" e o início é liberado.
 */

const log = loggerFor({ module: "maddox", feature: "sheet-restore" })

type CampaignDoc = IMaddoxCampaign
type CharacterDoc = IMaddoxCharacter
type Row = Record<string, unknown> & { _id?: Types.ObjectId }

const runKey = (characterId: Types.ObjectId | string) => `sheet-restore:${String(characterId)}`
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T

/** Valor do campo na ficha recém-criada quando a entrevista não o preenche (o padrão da ficha). */
const FIELD_DEFAULTS: Partial<Record<SheetRestoreField, unknown>> = {
    experience: "",
    hpTemp: 0,
    hitDiceUsed: 0,
    deathSavesSuccess: 0,
    deathSavesFailure: 0,
    inspiration: false,
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    notes: "",
    classFeatures: "",
    speciesTraits: "",
    featuresNotes: "",
    weaponProficiencies: "",
    toolProficiencies: "",
    resourceCharges: [],
    weaponMasteries: [],
    spellSlots: {},
}

const COLLECTION_LABELS: Record<SheetRestoreCollection, string> = { items: "Item", attacks: "Ataque", traits: "Traço", feats: "Talento", spells: "Magia" }
const REF_PREFIX: Record<SheetRestoreCollection, string> = { items: "i", attacks: "a", traits: "t", feats: "f", spells: "s" }

/** Ficha da entrevista calculada pelo servidor (valores da referência). */
export interface SheetReference {
    fields: Partial<Record<SheetRestoreField, unknown>>
    rows: Record<SheetRestoreCollection, Row[]>
}

export interface CurrentSheet {
    sheet: Record<string, unknown> | null
    rows: Record<SheetRestoreCollection, Row[]>
}

const text = (value: unknown, max = 160) => {
    const plainValue = typeof value === "string" ? plainText(value) : ""
    return plainValue.length > max ? `${plainValue.slice(0, max)}…` : plainValue
}

/** Resumo de um registro para o Maddox comparar (nome e os campos que mudam no jogo). */
function rowSummary(row: Row): Record<string, unknown> {
    const summary: Record<string, unknown> = { nome: text(row.name, 120) }
    for (const key of ["quantity", "equipped", "attackBonus", "damageType", "circle", "prepared", "notes", "description"] as const) {
        const value = row[key]
        if (value === undefined || value === null || value === "") continue
        summary[key] = typeof value === "string" ? text(value) : value
    }
    return summary
}

const fieldsOf = (source: Record<string, unknown> | null | undefined, fallback: boolean) =>
    Object.fromEntries(SHEET_RESTORE_FIELDS.map((field) => [field, source?.[field] !== undefined ? source[field] : fallback ? (FIELD_DEFAULTS[field] ?? null) : null]))

/** Texto da ficha atual (com o `id` de cada registro). */
export function currentSheetText(current: CurrentSheet): string {
    const rows = Object.fromEntries(SHEET_RESTORE_COLLECTIONS.map((collection) => [collection, current.rows[collection].map((row) => ({ id: String(row._id), ...rowSummary(row) }))]))
    return JSON.stringify({ campos: fieldsOf(current.sheet, false), ...rows }, null, 1)
}

/** Texto da referência (com o `ref` de cada registro). */
export function referenceSheetText(reference: SheetReference): string {
    const rows = Object.fromEntries(SHEET_RESTORE_COLLECTIONS.map((collection) => [collection, reference.rows[collection].map((row, index) => ({ ref: `${REF_PREFIX[collection]}${index + 1}`, ...rowSummary(row) }))]))
    return JSON.stringify({ campos: fieldsOf(reference.fields as Record<string, unknown>, true), ...rows }, null, 1)
}

async function sheetModels() {
    const [{ CharacterSheet }, { CharacterItem }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
    ])
    const collections = { items: CharacterItem, attacks: CharacterAttack, traits: CharacterTrait, feats: CharacterFeat, spells: CharacterSpell } as unknown as Record<SheetRestoreCollection, typeof CharacterItem>
    return { CharacterSheet, collections }
}

export interface ApplySheetRestoreContext {
    sheetId: Types.ObjectId
    campaignId: string
    characterName: string
    auditUserId: string
}

/**
 * Aplica as alterações escolhidas pelo Maddox. Os valores vêm da referência; `id` desconhecido, `ref` inexistente ou campo
 * sem valor na referência ficam como "não aplicadas". Devolve quantas foram aplicadas.
 */
export async function applySheetRestore(changes: readonly SheetRestoreChange[], reference: SheetReference, context: ApplySheetRestoreContext): Promise<{ applied: number; skipped: number }> {
    const { CharacterSheet, collections } = await sheetModels()
    const sheetId = context.sheetId
    let applied = 0
    let skipped = 0
    const events: { name: SheetRestoreCollection; action: "created" | "deleted"; recordId: string }[] = []
    let sheetTouched = false
    for (const change of changes) {
        let audit: { label: string; before: unknown; after: unknown } | null = null
        try {
            if (change.type === "field") {
                const value = reference.fields[change.field] !== undefined ? reference.fields[change.field] : FIELD_DEFAULTS[change.field]
                if (value === undefined) {
                    skipped++
                    continue
                }
                const current = await CharacterSheet.findById(sheetId).select(change.field).lean<Record<string, unknown>>()
                if (!current) {
                    skipped++
                    continue
                }
                await CharacterSheet.updateOne({ _id: sheetId }, { $set: { [change.field]: value } })
                sheetTouched = true
                audit = { label: change.field, before: current[change.field] ?? null, after: value }
            } else if (change.type === "remove") {
                if (!Types.ObjectId.isValid(change.id)) {
                    skipped++
                    continue
                }
                const model = collections[change.collection]
                const row = await model.findOneAndDelete({ _id: new Types.ObjectId(change.id), sheetId }).lean<Row>()
                if (!row) {
                    skipped++
                    continue
                }
                events.push({ name: change.collection, action: "deleted", recordId: change.id })
                audit = { label: `${COLLECTION_LABELS[change.collection]} removido`, before: rowSummary(row), after: null }
            } else {
                const prefix = REF_PREFIX[change.collection]
                const index = change.ref.startsWith(prefix) ? Number(change.ref.slice(prefix.length)) - 1 : -1
                const row = Number.isInteger(index) && index >= 0 ? reference.rows[change.collection][index] : undefined
                if (!row) {
                    skipped++
                    continue
                }
                const { _id: _ignored, ...data } = row
                void _ignored
                const [created] = await collections[change.collection].insertMany([{ ...data, sheetId }])
                events.push({ name: change.collection, action: "created", recordId: String(created!._id) })
                audit = { label: `${COLLECTION_LABELS[change.collection]} restaurado`, before: null, after: rowSummary(row) }
            }
        } catch (error) {
            log.warn({ err: errorText(error), sheetId: String(sheetId), type: change.type }, "[maddox] falha ao gravar um ajuste da ficha no reinício")
            skipped++
            continue
        }
        applied++
        await recordAudit({
            userId: context.auditUserId,
            entidade: MADDOX_SHEET_AUDIT_ENTITY,
            entidadeId: String(sheetId),
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { [audit.label]: plain(audit.before) },
            depois: { by: "maddox", origin: "campaign-reset", campaign: context.campaignId, character: context.characterName, [audit.label]: plain(audit.after), reason: change.reason },
        })
    }
    await publishSheet(String(sheetId), sheetTouched, events)
    return { applied, skipped }
}

async function publishSheet(sheetId: string, sheetTouched: boolean, events: { name: SheetRestoreCollection; action: "created" | "deleted"; recordId: string }[]) {
    if (!sheetTouched && !events.length) return
    try {
        const [{ CharacterSheetPusherService }, { CharacterSheet, collections }] = await Promise.all([import("@/features/character-sheets/realtime/character-sheet-pusher-service"), sheetModels()])
        const pusher = CharacterSheetPusherService.getInstance()
        if (sheetTouched) {
            const sheet = await CharacterSheet.findById(sheetId).lean()
            if (sheet) await pusher.publishSheetPatched({ sheet: plain({ ...sheet, _id: String(sheet._id) }) })
        }
        for (const event of events) {
            const record = event.action === "deleted" ? undefined : await collections[event.name].findById(event.recordId).lean()
            await pusher.publishCollectionChanged({ sheetId, collection: event.name, action: event.action, recordId: event.recordId, ...(record ? { record: plain({ ...record, _id: String(record._id), sheetId }) } : {}) } as never)
        }
    } catch (error) {
        log.warn({ err: errorText(error), sheetId }, "[maddox] falha ao avisar a ficha em tempo real")
    }
}

// ── Execução ─────────────────────────────────────────────────────────────────

async function loadCurrent(sheetId: Types.ObjectId): Promise<CurrentSheet> {
    const { CharacterSheet, collections } = await sheetModels()
    const sheet = await CharacterSheet.findById(sheetId).lean<Record<string, unknown>>()
    const rows = Object.fromEntries(await Promise.all(SHEET_RESTORE_COLLECTIONS.map(async (collection) => [collection, await collections[collection].find({ sheetId }).sort({ _id: 1 }).lean<Row[]>()] as const))) as Record<SheetRestoreCollection, Row[]>
    return { sheet, rows }
}

/** Ficha que a entrevista gera (sem gravar), pelo mesmo construtor da conclusão. */
async function computeReference(campaign: CampaignDoc, character: CharacterDoc, interview: IMaddoxInterview): Promise<SheetReference> {
    const [{ computeCharacterSheet }, { buildContextOfCampaign }, { campaignReservedNames }] = await Promise.all([import("./sheet-builder"), import("./character-build"), import("./interviews")])
    const seed = ((interview.result as { sheet?: unknown } | null)?.sheet ?? null) as Parameters<typeof computeCharacterSheet>[0]["seed"]
    const reserved = [...(await campaignReservedNames(campaign)), character.name]
    const computed = await computeCharacterSheet({ sheetId: character.sheetId!, name: character.name, portraitUrl: character.portraitUrl ?? null, doc: interview, seed, ctx: buildContextOfCampaign(campaign), reserved })
    return {
        fields: Object.fromEntries(SHEET_RESTORE_FIELDS.filter((field) => computed.set[field] !== undefined).map((field) => [field, plain(computed.set[field])])),
        rows: { items: computed.items, attacks: computed.attacks, spells: computed.spells, traits: [], feats: [] },
    }
}

function interviewText(character: CharacterDoc): string {
    const profile = character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) }
    return Object.entries(profile)
        .map(([key, value]) => `### ${key}\n${value}`)
        .join("\n\n")
}

async function finish(characterId: Types.ObjectId, resetId: string, status: "done" | "failed", error: string | null): Promise<boolean> {
    const updated = await MaddoxCharacterModel.updateOne({ _id: characterId, "sheetRestore.resetId": resetId, "sheetRestore.status": "pending" }, { $set: { "sheetRestore.status": status, "sheetRestore.error": error, "sheetRestore.updatedAt": new Date() } })
    return updated.modifiedCount > 0
}

/** Um ajuste: referência → Maddox → alterações. Falha grava `failed` (o motivo só no log e no banco). */
async function runSheetRestore(characterId: Types.ObjectId, resetId: string): Promise<void> {
    await dbConnect()
    const character = await MaddoxCharacterModel.findById(characterId).lean<CharacterDoc>()
    if (!character || character.sheetRestore?.resetId !== resetId || character.sheetRestore.status !== "pending") return
    const campaign = await MaddoxCampaignModel.findById(character.campaignId).lean<CampaignDoc>()
    let outcome: { status: "done" | "failed"; error: string | null }
    try {
        if (!campaign || campaign.reset?.id !== resetId || campaign.status !== "lobby") throw new Error("a campanha não está mais no lobby deste reinício")
        if (!character.sheetId) throw new Error("o personagem não tem ficha")
        const interview = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: "character", memberId: character.memberId }).lean<IMaddoxInterview>()
        if (!interview || interview.status !== "done") throw new Error("a entrevista do personagem não está concluída")
        const [reference, current] = await Promise.all([computeReference(campaign, character, interview), loadCurrent(character.sheetId)])
        if (!current.sheet) throw new Error("a ficha do personagem não existe mais")
        const { reviewSheetRestore } = await import("./sheet-restore-ai")
        const response = await reviewSheetRestore({ campaign, characterName: character.name, currentText: currentSheetText(current), referenceText: referenceSheetText(reference), interviewText: interviewText(character) })
        const { changes, invalid } = parseSheetRestoreChanges(response)
        const result = await applySheetRestore(changes, reference, { sheetId: character.sheetId, campaignId: String(campaign._id), characterName: character.name, auditUserId: campaign.reset?.byUserId ?? campaign.ownerId })
        log.info({ campaignId: String(campaign._id), characterId: String(characterId), applied: result.applied, skipped: result.skipped + invalid }, "[maddox] ficha ajustada pelo Maddox no reinício")
        outcome = { status: "done", error: null }
    } catch (error) {
        log.warn({ err: errorText(error), characterId: String(characterId), resetId }, "[maddox] o Maddox não conseguiu ajustar a ficha no reinício: ficou como estava")
        outcome = { status: "failed", error: errorText(error).slice(0, 500) }
    }
    if ((await finish(characterId, resetId, outcome.status, outcome.error)) && campaign) {
        const { changed } = await import("./campaigns")
        await changed(campaign._id)
    }
}

/** Agenda os ajustes `pending` do reinício atual da campanha (um por personagem; repetir é seguro). */
export async function scheduleSheetRestores(campaignId: Types.ObjectId): Promise<number> {
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("reset").lean<Pick<CampaignDoc, "reset">>()
    const resetId = campaign?.reset?.id
    if (!resetId) return 0
    const characters = await MaddoxCharacterModel.find({ campaignId, "sheetRestore.resetId": resetId, "sheetRestore.status": "pending" }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    for (const character of characters) void runOpexOnce(runKey(character._id), () => runSheetRestore(character._id, resetId))
    return characters.length
}

/**
 * Leitura do detalhe: `pending` sem execução viva (processo reiniciado) é retomado; preso há mais que
 * `MADDOX_SHEET_RESTORE_STALE_MS`, vira falha acionável. Nunca lança.
 */
export async function reconcileSheetRestores(campaign: Pick<CampaignDoc, "_id" | "reset">, characters: readonly Pick<CharacterDoc, "_id" | "sheetRestore">[]): Promise<void> {
    const resetId = campaign.reset?.id
    if (!resetId || campaign.reset?.status !== "done") return
    try {
        let resume = false
        for (const character of characters) {
            const restore = character.sheetRestore
            if (restore?.resetId !== resetId || restore.status !== "pending" || isOpexRunning(runKey(character._id))) continue
            if (Date.now() - new Date(restore.updatedAt).getTime() > MADDOX_SHEET_RESTORE_STALE_MS) await finish(character._id, resetId, "failed", "ajuste interrompido (processo reiniciado)")
            else resume = true
        }
        if (resume) await scheduleSheetRestores(campaign._id)
    } catch (error) {
        log.warn({ err: errorText(error), campaignId: String(campaign._id) }, "[maddox] falha ao conferir os ajustes de ficha do reinício")
    }
}

/** Situação dos ajustes do reinício atual (só o dono recebe; os demais, lista vazia). */
export function sheetRestoreDtos(campaign: Pick<CampaignDoc, "reset" | "ownerId">, characters: readonly Pick<CharacterDoc, "_id" | "name" | "sheetRestore">[], userId: string): MaddoxSheetRestoreDto[] {
    const resetId = campaign.reset?.id
    if (!resetId || campaign.ownerId !== userId) return []
    return characters
        .filter((character) => character.sheetRestore?.resetId === resetId && character.sheetRestore.status !== "done")
        .map((character) => ({ characterId: String(character._id), characterName: character.name, status: character.sheetRestore!.status as "pending" | "failed" }))
}

/** "Iniciar campanha": recusado enquanto o Maddox ajusta alguma ficha do reinício. */
export async function assertSheetsSettled(campaign: Pick<CampaignDoc, "_id" | "reset">): Promise<void> {
    const resetId = campaign.reset?.id
    if (!resetId) return
    const pending = await MaddoxCharacterModel.exists({ campaignId: campaign._id, "sheetRestore.resetId": resetId, "sheetRestore.status": "pending" })
    if (pending) throw new DomainError(409, MADDOX_RESET_TEXTS.sheetsAdjusting, "SHEETS_ADJUSTING")
}

/** "Tentar de novo" do aviso de falha: só o dono, só o personagem que falhou neste reinício. */
export async function retrySheetRestore(campaignId: string, characterId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { loadMembership, getCampaignDetail } = await import("./campaigns")
    const { campaign } = await loadMembership(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode fazer isso.", "FORBIDDEN")
    const resetId = campaign.reset?.id
    if (!resetId || !Types.ObjectId.isValid(characterId) || campaign.status !== "lobby") throw new DomainError(409, "Não há ajuste de ficha para tentar de novo.", "NO_SHEET_RESTORE")
    const updated = await MaddoxCharacterModel.updateOne(
        { _id: new Types.ObjectId(characterId), campaignId: campaign._id, "sheetRestore.resetId": resetId, "sheetRestore.status": "failed" },
        { $set: { "sheetRestore.status": "pending", "sheetRestore.error": null, "sheetRestore.updatedAt": new Date() } },
    )
    if (updated.modifiedCount === 0) throw new DomainError(409, "Não há ajuste de ficha para tentar de novo.", "NO_SHEET_RESTORE")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, antes: { sheetRestore: "failed" }, depois: { sheetRestore: "retry", characterId } })
    const { changed } = await import("./campaigns")
    await changed(campaign._id)
    void runOpexOnce(runKey(characterId), () => runSheetRestore(new Types.ObjectId(characterId), resetId))
    return getCampaignDetail(campaignId, userId)
}

/** Testes: espera os ajustes em andamento. */
export { waitForOpexIdle as waitForSheetRestores } from "./opex-runtime"
