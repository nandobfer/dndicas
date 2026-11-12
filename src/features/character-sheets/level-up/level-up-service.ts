import { LevelUpError, loadLevelUpContext } from "./level-up-context"
import type { LevelUpChoices, LevelUpGains, LevelUpOptions } from "./level-up-types"

/**
 * Subida de nível pela ficha (DND-56) — SOMENTE servidor. Junta o motor da ficha (`level-up-options`/`level-up-apply`)
 * com a trava das Campanhas Maddox: ficha de campanha com nível só sobe pelo degrau aberto pelo Maddox (marco ou XP);
 * fora de campanha, a subida segue livre. Só o dono da ficha (no Opex, o dono da campanha) sobe de nível.
 */

export interface SheetLevelUpCampaignInfo {
    campaignId: string
    stepId: string | null
    mode: "marco" | "experiencia"
    status: string | null
    /** Motivo de não poder subir agora (pt-BR); `null` = pode. */
    blocked: string | null
}

export interface SheetLevelUpState {
    options: LevelUpOptions | null
    campaign: SheetLevelUpCampaignInfo | null
    /** Motivo de não haver opções (nível 20, ficha sem classe…). */
    unavailable: string | null
}

async function gateOf(sheetId: string) {
    const [{ default: dbConnect }, { campaignLevelUpGate }] = await Promise.all([import("@/core/database/db"), import("@/features/maddox/server/level-ups")])
    await dbConnect()
    return campaignLevelUpGate(sheetId)
}

function blockedReason(gate: NonNullable<Awaited<ReturnType<typeof gateOf>>>): string | null {
    const step = gate.step
    if (!step) return gate.mode === "marco" ? "Esta ficha só sobe de nível quando o Maddox declarar a subida." : "Esta ficha só sobe de nível quando atingir a XP do próximo nível."
    if (step.status === "waiting-combat") return "A subida de nível fica para depois do combate tático."
    if (step.status === "deciding") return "O Personagem Opex está decidindo a subida de nível."
    if (step.kind === "opex" && step.status !== "failed") return "O Personagem Opex decide a própria subida de nível."
    return null
}

async function assertOwner(sheetId: string, userId: string) {
    const ctx = await loadLevelUpContext(sheetId)
    if (ctx.sheet.userId !== userId) throw new LevelUpError("Ficha não encontrada ou não autorizado.", 404)
    return ctx
}

async function swapResolver(campaignId: string | null) {
    const [{ spellSwapResolver }, { MaddoxCampaignModel }] = await Promise.all([import("@/features/maddox/server/spell-swap"), import("@/features/maddox/models")])
    const campaign = campaignId ? await MaddoxCampaignModel.findById(campaignId).select("rigor").lean<{ rigor: "equilibrado" | "rigoroso" | "fiel-dnd" }>() : null
    return spellSwapResolver(campaign?.rigor ?? "fiel-dnd")
}

export async function getSheetLevelUp(sheetId: string, userId: string, subclassId: string | null): Promise<SheetLevelUpState> {
    const ctx = await assertOwner(sheetId, userId)
    const gate = await gateOf(sheetId)
    const campaign = gate ? { campaignId: String(gate.campaignId), stepId: gate.step ? String(gate.step._id) : null, mode: gate.mode, status: gate.step?.status ?? null, blocked: blockedReason(gate) } : null
    if (campaign?.blocked) return { options: null, campaign, unavailable: campaign.blocked }
    const { buildLevelUpOptions } = await import("./level-up-options")
    try {
        const options = await buildLevelUpOptions(sheetId, { subclassId, resolveSpellSwap: await swapResolver(campaign?.campaignId ?? null) }, ctx)
        return { options, campaign, unavailable: null }
    } catch (error) {
        if (error instanceof LevelUpError && error.status === 422) return { options: null, campaign, unavailable: error.message }
        throw error
    }
}

export async function applySheetLevelUp(sheetId: string, userId: string, choices: LevelUpChoices): Promise<{ gains: LevelUpGains }> {
    await assertOwner(sheetId, userId)
    const gate = await gateOf(sheetId)
    if (gate) {
        const blocked = blockedReason(gate)
        if (blocked) throw new LevelUpError(blocked, 409)
        if (gate.step && gate.step.toLevel !== choices.targetLevel) throw new LevelUpError(`A subida pendente é para o nível ${gate.step.toLevel}.`, 409)
    }
    const { applyLevelUp } = await import("./level-up-apply")
    const result = await applyLevelUp(sheetId, choices, { userId, by: gate?.step?.kind === "opex" ? "owner" : "player", ...(gate ? { context: { campaign: String(gate.campaignId) } } : {}) }, { resolveSpellSwap: await swapResolver(gate ? String(gate.campaignId) : null) })
    if (gate?.step) {
        const { completeLevelUpStep } = await import("@/features/maddox/server/level-ups")
        await completeLevelUpStep(gate.campaignId, gate.step._id, result.gains, userId)
    }
    return result
}

/** PATCH da ficha (DND-56): em ficha de campanha com nível, o nível só muda pela subida e a XP do modo Experiência só pelo Maddox. */
export async function campaignPatchRefusal(sheetId: string, fields: { level?: unknown; experience?: unknown }): Promise<string | null> {
    if (fields.level === undefined && fields.experience === undefined) return null
    const gate = await gateOf(sheetId)
    if (!gate) return null
    if (fields.level !== undefined) return "O nível desta ficha muda pela subida de nível da campanha (wizard \"Subir de nível\")."
    if (fields.experience !== undefined && gate.mode === "experiencia") return "A XP desta ficha é controlada pelo Maddox."
    return null
}
