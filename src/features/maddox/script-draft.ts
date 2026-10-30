/** Rascunho dos roteiros na tela (módulo PURO). */

import {
    DEFAULT_MADDOX_CHARACTER_GUIDE,
    DEFAULT_MADDOX_CHARACTER_TOPICS,
    DEFAULT_MADDOX_SCENARIO_GUIDE,
    DEFAULT_MADDOX_SCENARIO_TOPICS,
    type MaddoxScriptKind,
    type MaddoxScriptTopic,
} from "./constants"
import { maddoxScriptGuideSchema, maddoxScriptTopicsSchema } from "./schemas"
import type { MaddoxScriptVersionDto } from "./types"

export interface MaddoxScriptDraft {
    /** Versão vigente na abertura (um refetch não promove um rascunho antigo à nova versão). */
    version: number
    guide: string
    topics: MaddoxScriptTopic[]
    notes: string
}

export function defaultScriptDraft(kind: MaddoxScriptKind): Pick<MaddoxScriptDraft, "guide" | "topics"> {
    return kind === "scenario"
        ? { guide: DEFAULT_MADDOX_SCENARIO_GUIDE, topics: DEFAULT_MADDOX_SCENARIO_TOPICS.map((topic) => ({ ...topic })) }
        : { guide: DEFAULT_MADDOX_CHARACTER_GUIDE, topics: DEFAULT_MADDOX_CHARACTER_TOPICS.map((topic) => ({ ...topic })) }
}

/** Roteiro padrão de um tipo (versão 0, enquanto nada foi gravado). */
export function defaultMaddoxScript(kind: MaddoxScriptKind): MaddoxScriptVersionDto {
    return { kind, version: 0, notes: "Roteiro padrão", createdBy: null, createdByName: null, createdAt: null, ...defaultScriptDraft(kind) }
}

export function draftFromScript(script: MaddoxScriptVersionDto): MaddoxScriptDraft {
    return { version: script.version, guide: script.guide, topics: script.topics.map((topic) => ({ ...topic })), notes: "" }
}

/** O rascunho difere da versão vigente na abertura (notas sozinhas não contam). */
export function isScriptDraftDirty(draft: MaddoxScriptDraft, script: MaddoxScriptVersionDto): boolean {
    return draft.guide !== script.guide || JSON.stringify(draft.topics) !== JSON.stringify(script.topics)
}

export function isScriptDraftValid(draft: MaddoxScriptDraft): boolean {
    return maddoxScriptGuideSchema.safeParse(draft.guide).success && maddoxScriptTopicsSchema.safeParse(draft.topics).success
}
