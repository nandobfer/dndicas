"use client"

import { aiAgentsOfTab } from "../../agents"
import { useMemoriesRealtime } from "../../hooks/useMemories"
import { AgentMemoriesCard } from "./AgentMemoriesCard"

/** Memórias de uma aba de `/integracoes/ia` (um card por lista do agente), com tempo real. */
export function AgentMemoriesSection({ tab }: { tab: string }) {
    useMemoriesRealtime(true)
    return (
        <>
            {aiAgentsOfTab(tab).map((agentId) => (
                <AgentMemoriesCard key={agentId} agentId={agentId} />
            ))}
        </>
    )
}
