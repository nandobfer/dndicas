import { Schema, type Query } from "mongoose"

/**
 * Marca de descarte da volta a um turno (DND-44) nas mensagens da mesa e nas imagens das cenas.
 *
 * O documento posterior ao turno de destino não é apagado enquanto a volta está pendente (o dono ainda pode retomar o
 * turno de origem): ele recebe `discardedBy` e some de TODAS as leituras — mesa, Diário (histórico, busca e imagens),
 * transcrição do narrador e do Opex, testes, reações e imagens — por um filtro aplicado no próprio schema. Só quem
 * passa `{ includeDiscarded: true }` nas opções da consulta (a cota de imagens) ou filtra pelo próprio `discardedBy` (a volta e
 * a perda definitiva) o enxerga.
 * Gravações atrasadas (uma imagem ou um timer que terminam depois da volta) também caem no filtro e não tocam o
 * documento descartado.
 */
export interface IMaddoxDiscardMark {
    rewindId: string
    at: Date
    /** Valor original de `turnAction` (a mensagem descartada sai do índice único de uma declaração por turno). */
    turnAction?: boolean
}

export const INCLUDE_DISCARDED = { includeDiscarded: true } as const

const FILTERED_OPS = ["find", "findOne", "countDocuments", "findOneAndUpdate", "findOneAndDelete", "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne", "distinct"] as const

export function applyDiscardFilter<T>(schema: Schema<T>): void {
    schema.add({ discardedBy: { type: new Schema<IMaddoxDiscardMark>({ rewindId: { type: String, required: true }, at: { type: Date, required: true }, turnAction: { type: Boolean, default: undefined } }, { _id: false }), default: null } } as never)
    schema.pre([...FILTERED_OPS], function (this: Query<unknown, unknown>) {
        const options = this.getOptions() as { includeDiscarded?: boolean }
        if (options.includeDiscarded) return
        const filter = this.getFilter() as Record<string, unknown>
        if (Object.keys(filter).some((key) => key === "discardedBy" || key.startsWith("discardedBy."))) return
        this.where({ discardedBy: null })
    })
    schema.pre("aggregate", function () {
        const options = this.options as { includeDiscarded?: boolean }
        if (options?.includeDiscarded) return
        this.pipeline().unshift({ $match: { discardedBy: null } })
    })
    schema.index({ "discardedBy.rewindId": 1 }, { partialFilterExpression: { "discardedBy.rewindId": { $exists: true } } })
}
