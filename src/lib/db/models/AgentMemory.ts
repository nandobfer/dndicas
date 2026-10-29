import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Memória (instrução permanente) de um agente de IA — `agent_memories`. `agentId` é uma das listas do
 * catálogo `src/features/ai/agents.ts`. O texto é formatado pelo uso "Resumo de memórias" antes de
 * salvar e ganha um resumo de uma linha para a lista. Copiado do Ciliar.
 */
export interface IAgentMemory {
    _id: Types.ObjectId
    agentId: string
    texto: string
    resumo: string
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}

const AgentMemorySchema = new Schema<IAgentMemory>(
    {
        agentId: { type: String, required: true },
        texto: { type: String, required: true },
        resumo: { type: String, required: true },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
    },
    { collection: "agent_memories", versionKey: false },
)

AgentMemorySchema.index({ agentId: 1, createdAt: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.AgentMemory
}

export const AgentMemory: Model<IAgentMemory> = (models.AgentMemory as Model<IAgentMemory>) || model<IAgentMemory>("AgentMemory", AgentMemorySchema)
