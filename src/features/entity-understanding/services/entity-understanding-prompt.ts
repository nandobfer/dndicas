import { sanitizeEntityUnderstandingHtml } from "./entity-understanding-html"
import type { EntityUnderstandingChatRequest } from "../types/entity-understanding.types"

const MAX_ENTITY_JSON_CHARS = 24_000
const MAX_MESSAGE_HTML_CHARS = 4_000

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return JSON.stringify({ erro: "Entidade não pôde ser serializada." })
    }
}

function truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}\n...[conteudo truncado]`
}

export function buildEntityUnderstandingSystemInstruction(): string {
    return [
        "Você é o assistente de IA do DnDicas, especializado em D&D 5e e no catálogo interno do produto.",
        "Responda sempre em pt-BR para usuário final, de forma breve, prática e clara.",
        "Não mencione JSON, campos internos, IDs, banco de dados, schemas, código ou detalhes técnicos.",
        "Use somente as informações recebidas ou consultadas pelas ferramentas. Não invente regras.",
        "Se faltar contexto, peça uma pergunta mais específica.",
        "Quando fizer sentido, explique como usar a entidade em mesa, criação de personagem, preparação de campanha ou consulta de regras.",
        "Responda com HTML simples usando apenas p, strong, em, ul, ol, li, br e spans de menção.",
        "Quando referenciar uma entidade existente retornada pelas ferramentas, use exatamente este formato:",
        '<span data-type="mention" data-id="ENTITY_ID" data-label="Nome" data-entity-type="Tipo">Nome</span>',
    ].join("\n")
}

export function buildEntityUnderstandingHistory(input: EntityUnderstandingChatRequest): Array<{ role: "user" | "model"; parts: string }> {
    const entityJson = truncate(safeStringify(input.entity), MAX_ENTITY_JSON_CHARS)
    const firstUserMessage = input.mode === "initial_summary"
        ? "Faça um resumo curto e útil desta entidade para o usuário final."
        : "Continue a conversa considerando a entidade original e o histórico a seguir."

    const history: Array<{ role: "user" | "model"; parts: string }> = [{
        role: "user",
        parts: [
            `Tipo da entidade: ${input.entityType}`,
            `ID da entidade: ${input.entityId}`,
            "Entidade completa em JSON para contexto interno:",
            entityJson,
            firstUserMessage,
        ].join("\n\n"),
    }]

    for (const message of input.messages) {
        history.push({
            role: message.role,
            parts: truncate(sanitizeEntityUnderstandingHtml(message.html), MAX_MESSAGE_HTML_CHARS),
        })
    }

    return history
}
