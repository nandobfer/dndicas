import { z } from "zod"
import { AI_AGENT_IDS, AI_AGENTS, type AiAgentId } from "@/features/ai/agents"
import { MEMORY_TEXT_MAX } from "@/features/ai/schemas"
import { createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from "@/features/ai/server/agent-memory-service"
import type { MemoryDto } from "@/features/ai/types"
import { defineTool } from "./define"
import { isObjectId } from "./json"

/**
 * Memórias dos agentes (copiadas do Opex): chamam o serviço real (`agent-memory-service`). A lista é
 * um enum do catálogo `src/features/ai/agents.ts` (globais, de administradores e de usuários do Agente
 * Opex e as dos agentes Gerador de imagens, Entender com IA e Importador 5etools), então listas
 * futuras entram sozinhas. Só administradores recebem estas ferramentas.
 */

const AGENT_LIST = AI_AGENT_IDS.map((id) => `${id} = ${AI_AGENTS[id].title}`).join("; ")
const agent = z.enum(AI_AGENT_IDS).describe(`Lista de memórias: ${AGENT_LIST}`)
const memoryId = z.string().trim().refine(isObjectId, "Id inválido (24 caracteres hexadecimais)").describe("Id da memória (de list_agent_memories)")
const text = z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, "Até 2.000 caracteres").describe("Texto livre da memória (instrução ou fato permanente)")

const view = (agentId: AiAgentId, memory: MemoryDto) => ({
    agent: agentId,
    agentLabel: AI_AGENTS[agentId].title,
    id: memory.id,
    summary: memory.resumo,
    text: memory.texto,
    author: memory.autor,
    createdAt: memory.criadaEm,
    updatedAt: memory.atualizadaEm,
})
const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

export const memoryTools = [
    defineTool({
        name: "list_agent_memories",
        group: "memories",
        minRole: "admin",
        permission: "integrations.ai.view",
        label: "Listar memórias",
        risk: "read",
        description: `Memórias (instruções permanentes) do Agente Opex e do Agente Adversário (${AGENT_LIST}), com id, resumo, texto, autor e datas. Sem agent, lista as de todas as listas.`,
        input: z.object({ agent: agent.optional() }),
        async execute(input) {
            const agents = input.agent ? [input.agent] : [...AI_AGENT_IDS]
            const lists = await Promise.all(agents.map(async (id) => ({ agent: id, agentLabel: AI_AGENTS[id].title, items: (await listAgentMemories(id)).map((memory) => view(id, memory)) })))
            return { agents: lists, total: lists.reduce((sum, list) => sum + list.items.length, 0) }
        },
    }),
    defineTool({
        name: "get_agent_memory",
        group: "memories",
        minRole: "admin",
        permission: "integrations.ai.view",
        label: "Ler memória",
        risk: "read",
        description: "Uma memória (texto completo, resumo, autor e datas).",
        input: z.object({ agent, memoryId }),
        async execute(input) {
            return view(input.agent, await getAgentMemory(input.agent, input.memoryId))
        },
    }),
    defineTool({
        name: "create_agent_memory",
        group: "memories",
        minRole: "admin",
        permission: "integrations.ai.edit",
        label: "Criar memória",
        risk: "write",
        description: `Cria uma memória (instrução ou fato permanente, de 3 a 2.000 caracteres) numa lista do Agente Opex ou do Agente Adversário (${AGENT_LIST}). O texto é revisado e resumido pelo uso "Resumo de memórias" (formattedByAi=false quando ele está indisponível). Até 50 por lista.`,
        input: z.object({ agent, text }),
        summarize: (input) => `Criar a memória (${AI_AGENTS[input.agent].title}): "${short(input.text)}"`,
        async execute(input, { actorId }) {
            const result = await createAgentMemory(input.agent, input.text, actorId)
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool({
        name: "update_agent_memory",
        group: "memories",
        minRole: "admin",
        permission: "integrations.ai.edit",
        label: "Editar memória",
        risk: "write",
        description: "Substitui o texto de uma memória (revisado e resumido de novo pelo Resumo de memórias).",
        input: z.object({ agent, memoryId, text }),
        summarize: (input) => `Editar a memória (${AI_AGENTS[input.agent].title}): "${short(input.text)}"`,
        async execute(input, { actorId }) {
            const result = await updateAgentMemory(input.agent, input.memoryId, input.text, actorId)
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool({
        name: "delete_agent_memory",
        group: "memories",
        minRole: "admin",
        permission: "integrations.ai.edit",
        label: "Excluir memória",
        risk: "destructive",
        description: "Exclui uma memória: o agente deixa de segui-la a partir da próxima resposta.",
        input: z.object({ agent, memoryId }),
        summarize: (input) => `Excluir a memória ${input.memoryId} (${AI_AGENTS[input.agent].title})`,
        async execute(input, { actorId }) {
            const removed = await deleteAgentMemory(input.agent, input.memoryId, actorId)
            return { ok: true, deleted: view(input.agent, removed) }
        },
    }),
]
