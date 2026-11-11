import type { DiceRollResponse } from "@/features/dice-roller/types"

/** Rolagem local em andamento num card: o passo clicado e, depois da resposta, o id da rolagem oficial. */
export interface LocalRollHold {
    index: number
    rollId: string | null
}

export interface RollSlotInput {
    /** Rolagem gravada de cada passo (na ordem do card); `null` quando o passo ainda não foi rolado. */
    rolls: ReadonlyArray<Pick<DiceRollResponse, "rollId"> | null>
    /** Passo que o jogador rola agora pela mesa (`-1` sem passo pendente). */
    pendingIndex: number
    local: LocalRollHold | null
    /** Rolagem de outro participante recebida pelo stream (já sem a de quem rola). */
    replay: Pick<DiceRollResponse, "rollId"> | null
    /** Rolagens cujo dado já parou (o resultado pode aparecer). */
    revealed: ReadonlySet<string>
    /** Rolagens cujo palco já saiu da tela (o card não segura mais o passo). */
    finished: ReadonlySet<string>
}

export interface RollSlot {
    /** Passo em que o dado do card fica (`-1`: nenhum). */
    index: number
    /** O passo está preso ao dado que rola (a mesa nova não troca o dado de lugar). */
    holding: boolean
    /** O dado do passo preso já parou. */
    revealed: boolean
}

/**
 * Onde fica o dado de um card de combate (DND-48). A mesa nova chega logo depois da resposta da rolagem, com o passo já
 * resolvido: sem segurar o passo, o dado trocaria de lugar ou sumiria no meio da animação. Ordem: a rolagem local, a
 * repetição de outro participante ainda na tela (no passo que ela resolveu ou, antes da mesa nova, no pendente) e, por
 * fim, o passo pendente.
 */
export function rollSlot({ rolls, pendingIndex, local, replay, revealed, finished }: RollSlotInput): RollSlot {
    if (local) return { index: local.index, holding: true, revealed: local.rollId !== null && revealed.has(local.rollId) }
    if (replay && !finished.has(replay.rollId)) {
        const rolled = rolls.findIndex((roll) => roll?.rollId === replay.rollId)
        const index = rolled >= 0 ? rolled : pendingIndex
        if (index >= 0) return { index, holding: true, revealed: revealed.has(replay.rollId) }
    }
    return { index: pendingIndex, holding: false, revealed: false }
}
