"use client"

import { AgentMemoriesSection } from "@/features/ai/components/memories/AgentMemoriesSection"
import { MADDOX_AI_TAB } from "../../constants"

/** Memórias do Maddox (lista `maddox`), gerenciadas pelo admin. */
export function MaddoxMemoriesSection() {
    return <AgentMemoriesSection tab={MADDOX_AI_TAB} />
}
