/** Falha acionável de um provedor de IA (mensagem em pt-BR, segura para a tela). */
export class AiProviderError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "AiProviderError"
    }
}
