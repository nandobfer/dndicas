/** Erros do formulário do Agente Maddox (módulo PURO). */

/** Campos cujo erro aparece na tela, abaixo do próprio controle. */
const RENDERED_ERROR_PATHS = new Set([
    "main.provider",
    "main.model",
    "main.temperature",
    "main.maxOutputTokens",
    "interviewer.provider",
    "interviewer.model",
    "instructions",
    "interviewerInstructions",
    "avatar.persona",
    "opencode.directory",
])

/** Caminhos e mensagens de todos os erros (react-hook-form aninha por objeto). */
export function flattenFormErrors(errors: unknown, prefix = ""): Array<{ path: string; message: string }> {
    if (!errors || typeof errors !== "object") return []
    const node = errors as Record<string, unknown>
    if (typeof node.message === "string" && node.message) return [{ path: prefix, message: node.message }]
    return Object.entries(node)
        .filter(([key]) => key !== "ref" && key !== "type" && key !== "types" && key !== "root")
        .flatMap(([key, value]) => flattenFormErrors(value, prefix ? `${prefix}.${key}` : key))
}

/** Primeira mensagem de erro sem lugar na tela (ex.: URL do avatar), para virar aviso. `null` se todas aparecem. */
export function firstHiddenFormError(errors: unknown): string | null {
    const hidden = flattenFormErrors(errors).find((item) => !RENDERED_ERROR_PATHS.has(item.path))
    return hidden ? hidden.message : null
}
