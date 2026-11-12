import mongoose from "mongoose"
import { logger } from "@/lib/logger"

const MARK_ID = "reclassify-opex-memories"
const running = globalThis as typeof globalThis & { __reclassifyOpexMemories?: Promise<void> | null }

/**
 * Reclassificação única das memórias dos Personagens e NPCs Opex (DND-57): tira das categorias de regra o que o Opex
 * gravou sem categoria. Roda em segundo plano (o boot não espera a geração) e só grava a marca em `migration_marks`
 * quando termina (`done`); com o Engramind fora ou sem modelo, tenta de novo no próximo boot. Nunca lança.
 */
export async function reclassifyOpexMemoriesOnce(): Promise<void> {
    const marks = mongoose.connection.collection<{ _id: string; at: Date }>("migration_marks")
    if (await marks.findOne({ _id: MARK_ID })) return
    if (running.__reclassifyOpexMemories) return
    running.__reclassifyOpexMemories = runAndMark(marks).finally(() => {
        running.__reclassifyOpexMemories = null
    })
}

async function runAndMark(marks: mongoose.mongo.Collection<{ _id: string; at: Date }>): Promise<void> {
    try {
        const { reclassifyOpexMemories } = await import("@/features/engramind/server/opex-memory-reclassify")
        const outcome = await reclassifyOpexMemories()
        if (outcome.status !== "done") return
        await marks.updateOne({ _id: MARK_ID }, { $setOnInsert: { at: new Date() } }, { upsert: true })
    } catch (error) {
        logger.warn({ err: error, migration: MARK_ID }, "Reclassificação das memórias dos Opex adiada para o próximo boot")
    }
}

/** Testes: espera a execução em segundo plano. */
export async function waitForOpexMemoryReclassify(): Promise<void> {
    await running.__reclassifyOpexMemories
}
