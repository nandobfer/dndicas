import { createHash } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import { MADDOX_COMBAT_CLASSIFY_RETRY_MS, MADDOX_COMBAT_CLASSIFY_TIMEOUT_MS, MADDOX_COMBAT_COSTS, MADDOX_JEV_MODEL, MADDOX_REACTION_TRIGGERS, type MaddoxCombatCost, type MaddoxReactionTrigger } from "../constants"
import { profileFromText, type CombatProfile } from "../combat-options"

/**
 * Classificador do custo das habilidades e talentos no combate tático (Maddox 7) — SOMENTE servidor.
 *
 * 1. Cache (`maddox_combat_option_profiles`) pela entidade e pela versão do texto.
 * 2. Regra pelo texto (`profileFromText`: "como uma Ação Bônus", "usa sua ação", "como Reação, quando…").
 * 3. JEV (chave `combat-option-cost`), em SEGUNDO PLANO: quem pede a lista não espera; quando o JEV responde, o perfil
 *    vai para o cache e `onClassified` avisa a mesa (a opção aparece na Ação certa). Sem resposta, a habilidade fica em
 *    "Custo não identificado" e é tratada como ação livre conferida pelo Maddox.
 */

const log = loggerFor({ module: "maddox", feature: "combat-classifier" })

export interface ClassifyEntry {
    entityType: "trait" | "feat" | "spell"
    /** Id no catálogo (ou o id na ficha, para entrada própria). */
    entityId: string
    name: string
    text: string
}

export const textHashOf = (text: string) => createHash("sha256").update(text.trim()).digest("hex").slice(0, 32)
const keyOf = (entry: ClassifyEntry) => `${entry.entityType}:${entry.entityId}:${textHashOf(entry.text)}`

const inflight = ((globalThis as unknown as { __maddoxClassifying?: Set<string> }).__maddoxClassifying ??= new Set<string>())
/**
 * Cache negativo em memória: quando a habilidade já foi mandada ao JEV (ou a chave estava desligada, ou falhou), não
 * tenta de novo antes de `MADDOX_COMBAT_CLASSIFY_RETRY_MS` — cada leitura da mesa do jogador da vez não refaz chamadas
 * pagas nem consultas de configuração. Instância única (como o barramento da mesa).
 */
const attempted = ((globalThis as unknown as { __maddoxClassifyAttempted?: Map<string, number> }).__maddoxClassifyAttempted ??= new Map<string, number>())

/** Só para testes: esquece as tentativas. */
export function resetClassifierAttempts(): void {
    attempted.clear()
}

/** Perfis em cache ou pelo texto; o que faltar vai para o JEV em segundo plano (quando a chave está ligada). */
export async function resolveProfiles(entries: readonly ClassifyEntry[], onClassified?: () => void | Promise<void>): Promise<Map<string, CombatProfile | null>> {
    const result = new Map<string, CombatProfile | null>()
    if (!entries.length) return result
    const { MaddoxCombatOptionProfileModel } = await import("../models")
    const keys = entries.map((entry) => ({ entry, key: keyOf(entry), hash: textHashOf(entry.text) }))
    const cached = await MaddoxCombatOptionProfileModel.find({ $or: keys.map(({ entry, hash }) => ({ entityType: entry.entityType, entityId: entry.entityId, textHash: hash })) })
        .lean<{ entityType: string; entityId: string; textHash: string; cost: MaddoxCombatCost; trigger: MaddoxReactionTrigger | null; resolution: CombatProfile["resolution"]; halfOnSave: boolean }[]>()
        .catch(() => [])
    const byKey = new Map(cached.map((row) => [`${row.entityType}:${row.entityId}:${row.textHash}`, { cost: row.cost, trigger: row.trigger ?? null, resolution: row.resolution ?? null, halfOnSave: Boolean(row.halfOnSave) }]))
    const missing: ClassifyEntry[] = []
    for (const { entry, key, hash } of keys) {
        const hit = byKey.get(key)
        if (hit) {
            result.set(key, hit)
            continue
        }
        const byText = profileFromText(`${entry.name}. ${entry.text}`)
        if (byText) {
            result.set(key, byText)
            await MaddoxCombatOptionProfileModel.updateOne({ entityType: entry.entityType, entityId: entry.entityId, textHash: hash }, { $setOnInsert: { name: entry.name, ...byText, source: "text" } }, { upsert: true }).catch(() => undefined)
            continue
        }
        result.set(key, null)
        missing.push(entry)
    }
    const now = Date.now()
    const due = missing.filter((entry) => {
        const at = attempted.get(keyOf(entry))
        return at === undefined || now - at >= MADDOX_COMBAT_CLASSIFY_RETRY_MS
    })
    for (const entry of due) attempted.set(keyOf(entry), now)
    if (due.length) void classifyInBackground(due, onClassified)
    return result
}

export const profileKey = keyOf

async function classifyInBackground(entries: readonly ClassifyEntry[], onClassified?: () => void | Promise<void>): Promise<void> {
    let enabled = false
    try {
        const { loadMaddoxSettings } = await import("./settings")
        enabled = Boolean((await loadMaddoxSettings()).settings.jev?.["combat-option-cost"])
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] configuração do Maddox indisponível; habilidades sem custo ficam em 'Custo não identificado'")
        return
    }
    if (!enabled) {
        log.info({ entries: entries.length }, "[maddox] JEV 'Custo de ação no combate' desligado; habilidades sem custo claro ficam em 'Custo não identificado'")
        return
    }
    let classified = 0
    for (const entry of entries) {
        const key = keyOf(entry)
        if (inflight.has(key)) continue
        inflight.add(key)
        try {
            const profile = await classifyWithJev(entry)
            if (!profile) continue
            const { MaddoxCombatOptionProfileModel } = await import("../models")
            await MaddoxCombatOptionProfileModel.updateOne(
                { entityType: entry.entityType, entityId: entry.entityId, textHash: textHashOf(entry.text) },
                { $set: { name: entry.name, ...profile, source: "jev" } },
                { upsert: true },
            )
            classified += 1
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), entity: entry.name }, "[maddox] JEV não classificou o custo da habilidade; fica em 'Custo não identificado'")
        } finally {
            inflight.delete(key)
        }
    }
    if (classified && onClassified) await Promise.resolve(onClassified()).catch(() => undefined)
}

/** Pergunta tipada ao JEV: custo (Ação, Ação bônus, Reação, passiva, outro) e, sendo Reação, o gatilho. */
export async function classifyWithJev(entry: ClassifyEntry): Promise<CombatProfile | null> {
    const { askJevSystemOne } = await import("@/lib/ai/jev")
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`JEV passou de ${MADDOX_COMBAT_CLASSIFY_TIMEOUT_MS} ms`))
        }, MADDOX_COMBAT_CLASSIFY_TIMEOUT_MS)
    })
    try {
        const response = await Promise.race([
            askJevSystemOne({
                model: MADDOX_JEV_MODEL,
                tracking: { feature: "maddox", subject: `${entry.entityType}:${entry.entityId}` },
                signal: controller.signal,
                state: { regras: "D&D 5e (PHB 2024)", habilidade: entry.name, texto: entry.text },
                questions: {
                    custo: {
                        type: "choice",
                        instructions: "Em combate, o que usar esta habilidade gasta do turno do personagem?",
                        criteria: {
                            action: "Gasta a Ação do turno.",
                            bonus: "Gasta a Ação bônus.",
                            reaction: "É usada como Reação, em resposta a um gatilho.",
                            passive: "É passiva: vale sempre ou é ativada por outra coisa, sem gastar ação.",
                            other: "Não se usa em combate ou o custo não é nenhum dos anteriores.",
                        },
                    },
                    gatilho: {
                        type: "choice",
                        instructions: "Se for uma Reação, qual é o gatilho?",
                        criteria: {
                            hit: "Quando o personagem é atingido (ou alvo) de uma jogada de ataque.",
                            damaged: "Quando o personagem sofre dano.",
                            "leave-reach": "Quando um inimigo sai do alcance do personagem.",
                            spell: "Quando uma criatura conjura uma magia.",
                            other: "Outro gatilho ou não é uma Reação.",
                        },
                    },
                },
            }),
            timeout,
        ])
        const cost = response.answers?.custo
        const trigger = response.answers?.gatilho
        const costValue = cost?.type === "choice" && (MADDOX_COMBAT_COSTS as readonly string[]).includes(cost.choice) ? (cost.choice as MaddoxCombatCost) : null
        if (!costValue) return null
        const triggerValue = costValue === "reaction" && trigger?.type === "choice" && (MADDOX_REACTION_TRIGGERS as readonly string[]).includes(trigger.choice) ? (trigger.choice as MaddoxReactionTrigger) : costValue === "reaction" ? "other" : null
        log.info({ entity: entry.name, cost: costValue, trigger: triggerValue }, "[maddox] JEV classificou o custo da habilidade")
        return { cost: costValue, trigger: triggerValue, resolution: null, halfOnSave: false }
    } finally {
        if (timer) clearTimeout(timer)
    }
}
