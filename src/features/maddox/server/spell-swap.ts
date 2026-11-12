import { createHash } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import type { SpellSwapInput, SpellSwapResolver } from "@/features/character-sheets/level-up/level-up-options"
import type { LevelUpSpellSwap } from "@/features/character-sheets/level-up/level-up-types"
import type { MaddoxRigorLevel } from "../constants"

/**
 * Troca de magia ao subir de nível (DND-56): decisão do Maddox pelo traço de conjuração do catálogo. Só vale com o trecho
 * copiado do texto do traço (a fonte); sem fonte, sem troca. A decisão fica em cache por classe/subclasse e texto.
 */

const log = loggerFor({ module: "maddox", feature: "spell-swap" })
const NO_SWAP: LevelUpSpellSwap = { allowed: false, source: null }

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase()

/** Confere a resposta do Maddox: a troca só vale com um trecho literal de um dos traços enviados. */
export function interpretSpellSwap(raw: unknown, traits: SpellSwapInput["traits"]): LevelUpSpellSwap {
    const value = (raw ?? {}) as { permite?: unknown; ref?: unknown; trecho?: unknown }
    if (value.permite !== true) return NO_SWAP
    const quote = typeof value.trecho === "string" ? value.trecho.trim() : ""
    if (quote.length < 10) return NO_SWAP
    const trait = traits.find((item) => item.id === value.ref) ?? traits.find((item) => normalize(item.text).includes(normalize(quote)))
    if (!trait || !normalize(trait.text).includes(normalize(quote))) return NO_SWAP
    return { allowed: true, source: `${trait.label}: “${quote.slice(0, 300)}”` }
}

const keyOf = (input: SpellSwapInput) => `${input.classId}:${input.subclassId ?? "-"}:${createHash("sha1").update(input.traits.map((trait) => `${trait.id}|${trait.text}`).join("\n")).digest("hex").slice(0, 16)}`

/** Resolve a troca pelo grau da campanha (fora de campanha, o modelo do Fiel ao D&D). */
export function spellSwapResolver(rigor: MaddoxRigorLevel = "fiel-dnd"): SpellSwapResolver {
    return async (input) => {
        const { MaddoxSpellSwapRuleModel } = await import("../models/maddox-spell-swap-rule")
        const key = keyOf(input)
        const cached = await MaddoxSpellSwapRuleModel.findOne({ key }).lean()
        if (cached) return { allowed: cached.allowed, source: cached.source }
        try {
            const { askSpellSwap } = await import("./level-up-ai")
            const decision = interpretSpellSwap(await askSpellSwap({ className: input.className, rigor, traits: input.traits }), input.traits)
            await MaddoxSpellSwapRuleModel.updateOne({ key }, { $setOnInsert: { key, allowed: decision.allowed, source: decision.source } }, { upsert: true }).catch(() => undefined)
            return decision
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), classId: input.classId }, "[maddox] decisão da troca de magia indisponível: sem troca nesta subida")
            return NO_SWAP
        }
    }
}
