import { getAiProvider } from "@/lib/ai/providers"
import { MADDOX_RIGOR_LEVELS, type MaddoxRigorLevel } from "./constants"
import type { MaddoxRigorModel, MaddoxSettings } from "./schemas"

/**
 * Modelo usado pelo Maddox em cada campanha (DND-32) — módulo PURO.
 *
 * - Narrador: o bloco do rigor da campanha; sem ele, a seleção padrão (`main`).
 * - Entrevistador: o bloco dele para o rigor; sem ele, o provedor próprio; em "Mesmo do Maddox", o modelo que o
 *   narrador usa NAQUELE rigor (bloco do narrador ou o padrão).
 * - Temperatura e máximo de tokens vêm sempre do padrão do Maddox, e só quando o provedor resolvido os aceita.
 * - `rigor` vazio = a seleção padrão (quem não conhece a campanha).
 */

export interface MaddoxResolvedModel {
    provider: NonNullable<MaddoxSettings["main"]["provider"]>
    model: string
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

type Source = { provider: MaddoxSettings["main"]["provider"]; model: string | null; agent: string | null; variant: string | null }

/** Bloco completo (provedor e modelo) do rigor na lista do alvo; configurações antigas sem o campo = nenhum. */
export function rigorModelFor(settings: Pick<MaddoxSettings, "rigorModels">, target: "main" | "interviewer" | "opexCharacter", rigor: MaddoxRigorLevel | null | undefined): MaddoxRigorModel | null {
    if (!rigor) return null
    const block = settings.rigorModels?.[target]?.find((item) => item.rigor === rigor)
    return block?.provider && block.model ? block : null
}

function resolved(source: Source, sampling: Pick<MaddoxSettings["main"], "temperature" | "maxOutputTokens"> | null): MaddoxResolvedModel | null {
    if (!source.provider || !source.model) return null
    const samples = sampling && getAiProvider(source.provider).supportsSampling
    return {
        provider: source.provider,
        model: source.model,
        agent: source.agent ?? null,
        variant: source.variant ?? null,
        temperature: samples ? sampling.temperature : null,
        maxOutputTokens: samples ? sampling.maxOutputTokens : null,
    }
}

/** Modelo do narrador para o rigor (bloco do nível > padrão). */
export function resolveNarratorModel(settings: MaddoxSettings, rigor?: MaddoxRigorLevel | null): MaddoxResolvedModel | null {
    return resolved(rigorModelFor(settings, "main", rigor) ?? settings.main, settings.main)
}

/** Modelo do entrevistador para o rigor (bloco dele > provedor próprio > o do narrador no mesmo rigor). */
export function resolveInterviewerModel(settings: MaddoxSettings, rigor?: MaddoxRigorLevel | null): MaddoxResolvedModel | null {
    const block = rigorModelFor(settings, "interviewer", rigor)
    if (block) return resolved(block, null)
    if (settings.interviewer.provider && settings.interviewer.model) return resolved(settings.interviewer, null)
    return resolveNarratorModel(settings, rigor)
}

/** Modelo do Personagem Opex (DND-26) para o rigor: bloco dele > provedor próprio > o do narrador no mesmo rigor. */
export function resolveOpexCharacterModel(settings: MaddoxSettings, rigor?: MaddoxRigorLevel | null): MaddoxResolvedModel | null {
    const block = rigorModelFor(settings, "opexCharacter", rigor)
    if (block) return resolved(block, null)
    if (settings.opexCharacter?.provider && settings.opexCharacter.model) return resolved(settings.opexCharacter, null)
    return resolveNarratorModel(settings, rigor)
}

/** Primeiro nível sem bloco (ordem do slider), ou `null` com todos configurados. */
export function firstFreeRigor(used: readonly MaddoxRigorLevel[]): MaddoxRigorLevel | null {
    return MADDOX_RIGOR_LEVELS.find((level) => !used.includes(level)) ?? null
}

/**
 * Próxima posição válida do slider de um bloco: o nível pedido ou, se outro bloco já o usa, o próximo livre na
 * mesma direção do movimento; sem nível livre nessa direção, fica onde está.
 */
export function nextFreeRigorIndex(from: number, to: number, used: readonly MaddoxRigorLevel[]): number {
    if (to === from) return from
    const step = to > from ? 1 : -1
    for (let index = to; index >= 0 && index < MADDOX_RIGOR_LEVELS.length; index += step) {
        if (!used.includes(MADDOX_RIGOR_LEVELS[index])) return index
    }
    return from
}
