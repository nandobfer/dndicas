/**
 * Foco no campo de texto quando o Maddox termina de responder (entrevista e mesa): o jogador escreve a próxima fala
 * sem clicar. Não rouba o foco de outro campo editável nem de um diálogo aberto.
 */
export function focusComposer(element: HTMLTextAreaElement | null): boolean {
    if (!element || element.disabled || typeof document === "undefined") return false
    const active = document.activeElement as HTMLElement | null
    if (active && active !== element && active !== document.body) {
        const editable = active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
        if (editable) return false
    }
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
    element.focus({ preventScroll: true })
    return true
}
