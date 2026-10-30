import { dynamicTool, type ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import type { OpexConfirmationDto } from "../types"
import { toolErrorMessage, type OpexTool, type OpexToolContext } from "./tools/define"
import { needsConfirmation } from "./tools/registry"

/** Saída de ferramenta enviada ao modelo (o resto é cortado com aviso). */
export const MAX_TOOL_OUTPUT_CHARS = 30_000
/** Entrada/saída guardadas para exibição no card. */
export const MAX_TOOL_DISPLAY_CHARS = 6000

const log = loggerFor({ module: "opex-agent" })

export function stringifyForDisplay(value: unknown, max = MAX_TOOL_DISPLAY_CHARS): string | null {
    if (value === undefined) return null
    let text: string
    try {
        text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    } catch {
        text = String(value)
    }
    if (text === undefined) return null
    return text.length > max ? `${text.slice(0, max)}\n…(+${(text.length - max).toLocaleString("pt-BR")} caracteres)` : text
}

/** Resultado grande vira um texto cortado (o modelo é avisado para refinar a consulta). */
export function compactToolOutput(value: unknown): unknown {
    const json = JSON.stringify(value ?? null) ?? "null"
    if (json.length <= MAX_TOOL_OUTPUT_CHARS) return value ?? null
    return {
        truncated: true,
        note: `Resultado com ${json.length.toLocaleString("pt-BR")} caracteres cortado em ${MAX_TOOL_OUTPUT_CHARS.toLocaleString("pt-BR")}: use filtros ou limites menores para ver o resto.`,
        partialJson: json.slice(0, MAX_TOOL_OUTPUT_CHARS),
    }
}

export interface ToolRuntimeHooks {
    /** Grava a ação pendente e devolve o card de confirmação. */
    requestConfirmation: (tool: OpexTool, input: unknown, toolCallId: string) => Promise<OpexConfirmationDto>
    /**
     * Revalida o acesso à ferramenta **imediatamente antes** de executar ou pedir confirmação:
     * no portal, relê a configuração do cliente e o papel do usuário (desligar no meio do turno vale
     * na hora). Ausente = confia no catálogo montado no início do turno (dono).
     */
    authorize?: (tool: OpexTool, input: unknown) => Promise<void>
}

export interface ToolRuntime {
    tools: ToolSet
    /** Confirmações pedidas neste turno, por chamada. */
    confirmations: Map<string, OpexConfirmationDto>
    durations: Map<string, number>
}

/**
 * Converte as ferramentas do registro em ferramentas da AI SDK (execução no servidor do app).
 * `confirmationOverrides`: ajuste por ferramenta (dono); vazio = só as destrutivas pedem confirmação.
 */
export function buildToolRuntime(list: readonly OpexTool[], context: OpexToolContext, confirmationOverrides: Readonly<Record<string, boolean>>, hooks: ToolRuntimeHooks): ToolRuntime {
    const confirmations = new Map<string, OpexConfirmationDto>()
    const durations = new Map<string, number>()
    const tools: ToolSet = {}
    for (const def of list) {
        tools[def.name] = dynamicTool({
            description: def.description,
            inputSchema: def.input,
            execute: async (input: unknown, options) => {
                const startedAt = Date.now()
                try {
                    await hooks.authorize?.(def, def.input.parse(input))
                    if (needsConfirmation(def, confirmationOverrides)) {
                        const confirmation = await hooks.requestConfirmation(def, input, options.toolCallId)
                        confirmations.set(options.toolCallId, confirmation)
                        return {
                            status: "confirmation_required",
                            actionId: confirmation.actionId,
                            summary: confirmation.summary,
                            instruction: "A ação NÃO foi executada: aguarda o usuário clicar em Confirmar ou Cancelar no chat. Diga em uma frase o que será feito e encerre a resposta.",
                        }
                    }
                    const output = await def.execute(def.input.parse(input), { ...context, signal: options.abortSignal ?? context.signal })
                    return compactToolOutput(output)
                } catch (error) {
                    const message = toolErrorMessage(error)
                    log.info({ tool: def.name, sessionId: context.sessionId, err: message }, "[opex] ferramenta falhou")
                    throw new Error(message)
                } finally {
                    durations.set(options.toolCallId, Date.now() - startedAt)
                }
            },
        })
    }
    return { tools, confirmations, durations }
}
