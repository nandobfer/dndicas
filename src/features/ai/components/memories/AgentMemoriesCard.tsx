"use client"

import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { AI_AGENTS, type AiAgentId } from "../../agents"
import { agentMemoriesSource } from "../../hooks/useMemories"
import { MemoryList } from "./MemoryList"

/**
 * Card de uma lista de memórias do agente (mesmo card "Memórias" do Ciliar): alimenta e treina o
 * agente com instruções permanentes. Salva sozinho (cada memória grava na hora). O tempo real
 * (`useMemoriesRealtime`) fica com quem monta os cards, uma assinatura para todas as listas.
 */
export function AgentMemoriesCard({ agentId }: { agentId: AiAgentId }) {
    const agent = AI_AGENTS[agentId]
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{agent.title}</CardTitle>
                <CardDescription>
                    {agent.description} Use para alimentar e treinar o agente. Clique para ver o texto completo.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
                <MemoryList source={agentMemoriesSource(agentId)} canEdit emptyTitle="Nenhuma memória" emptyDescription={`Adicione instruções e fatos que o ${agent.label} deve lembrar.`} />
            </CardContent>
        </Card>
    )
}
