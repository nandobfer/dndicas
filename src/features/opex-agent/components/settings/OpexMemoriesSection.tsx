"use client"

import { AgentMemoriesSection } from "@/features/ai/components/memories/AgentMemoriesSection"

/** Seção "Memórias" do Agente Opex: um card por lista da aba (globais, de administradores e de usuários), com tempo real. */
export function OpexMemoriesSection() {
    return <AgentMemoriesSection tab="agente-opex" />
}
