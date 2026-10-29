import type { OpexLiveMessage, OpexPart, OpexStreamLine } from "./types"

/**
 * Redutor puro da resposta em andamento: o servidor mantém o retrato (enviado como `snapshot` a quem
 * conecta) e o cliente aplica as mesmas linhas do stream. Textos e raciocínios consecutivos se juntam
 * numa parte só.
 */

export function startLiveMessage(messageId: string, startedAt: string): OpexLiveMessage {
    return { id: messageId, parts: [], startedAt, thinking: false }
}

function appendText(parts: OpexPart[], type: "text" | "reasoning", text: string): OpexPart[] {
    const last = parts.at(-1)
    if (last && last.type === type) return [...parts.slice(0, -1), { ...last, text: last.text + text }]
    return [...parts, { type, text }]
}

function updateTool(parts: OpexPart[], id: string, patch: (part: Extract<OpexPart, { type: "tool" }>) => Extract<OpexPart, { type: "tool" }>): OpexPart[] {
    return parts.map((part) => (part.type === "tool" && part.id === id ? patch(part) : part))
}

export function applyLiveLine(live: OpexLiveMessage | null, line: OpexStreamLine): OpexLiveMessage | null {
    switch (line.type) {
        case "snapshot":
            return line.live
        case "turn-start":
            return startLiveMessage(line.messageId, line.startedAt)
        case "turn-end":
            return null
        case "ping":
            return live
    }
    if (!live) return live
    switch (line.type) {
        case "text-delta":
            return line.text ? { ...live, thinking: false, parts: appendText(live.parts, "text", line.text) } : live
        case "reasoning-delta":
            return { ...live, thinking: true, parts: line.text ? appendText(live.parts, "reasoning", line.text) : live.parts }
        case "tool-start":
            if (live.parts.some((part) => part.type === "tool" && part.id === line.id)) return live
            return {
                ...live,
                thinking: false,
                parts: [...live.parts, { type: "tool", id: line.id, name: line.name, group: line.group, label: line.label, state: "running", input: null, output: null, error: null, confirmation: null, durationMs: null }],
            }
        case "tool-input":
            return { ...live, parts: updateTool(live.parts, line.id, (part) => ({ ...part, input: line.input })) }
        case "tool-end":
            return {
                ...live,
                parts: updateTool(live.parts, line.id, (part) => ({ ...part, state: line.state, output: line.output, error: line.error, confirmation: line.confirmation, durationMs: line.durationMs })),
            }
    }
}

/** Ferramentas ainda rodando viram erro (turno interrompido ou falho). */
export function closeRunningTools(parts: OpexPart[], reason: string): OpexPart[] {
    return parts.map((part) => (part.type === "tool" && part.state === "running" ? { ...part, state: "error", error: reason } : part))
}

/** Texto final da resposta (para o subagente de título e para o histórico em caso de interrupção). */
export function partsText(parts: OpexPart[]): string {
    return parts
        .filter((part): part is Extract<OpexPart, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim()
}
