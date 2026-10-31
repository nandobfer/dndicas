import { catalogEntityTypes, type CatalogEntityType } from "@/features/mcp/server/catalog-schemas"

/**
 * Marcação de citação do catálogo nas falas do Maddox (módulo PURO, cliente e servidor). O entrevistador cita uma
 * entidade de D&D só de forma explícita e com o tipo: `{{Raça:Elfo}}`, `{{Magia:Bola de Fogo}}`. O servidor resolve a
 * marcação em menção clicável (`server/catalog-mentions.ts`); tudo o que não for resolvido vira `**Nome**`, então a
 * marcação nunca aparece crua para a pessoa. **Negrito comum nunca vira menção.**
 */

export const CATALOG_MARKUP = /\{\{\s*([^{}:\n]{2,30}?)\s*:\s*([^{}\n]{1,80}?)\s*\}\}/g

/** Tamanho máximo de uma marcação aberta segurada no stream antes de liberar o texto como veio. */
const MAX_PENDING = 120

const TYPE_BY_KEY = new Map<string, CatalogEntityType>(catalogEntityTypes.map((type) => [normalizeCatalogName(type), type]))

export function normalizeCatalogName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

/** Tipo do catálogo pelo rótulo escrito pelo modelo (sem acento e sem caixa); `null` se não existir. */
export function catalogTypeOf(value: string): CatalogEntityType | null {
    return TYPE_BY_KEY.get(normalizeCatalogName(value)) ?? null
}

const boldLabel = (name: string) => `**${name.replace(/\*/g, "").trim()}**`

/** Troca toda marcação `{{Tipo:Nome}}` por `**Nome**`. */
export function markupToBold(text: string): string {
    return text.includes("{{") ? text.replace(CATALOG_MARKUP, (_whole, _type: string, name: string) => boldLabel(name)) : text
}

/** Texto ao vivo: converte as marcações fechadas e esconde a que ainda está aberta no fim. */
export function liveMarkupToBold(text: string): string {
    const open = text.lastIndexOf("{{")
    const pending = open >= 0 && !text.includes("}}", open) && text.length - open <= MAX_PENDING ? text.slice(0, open) : text
    return markupToBold(pending.endsWith("{") ? pending.slice(0, -1) : pending)
}

/**
 * Filtro do stream: segura uma marcação ainda aberta (ou um `{` solto no fim) até fechar e devolve o texto já com
 * as marcações em negrito. `flush` libera o resto (uma marcação que nunca fechou sai como veio).
 */
export function createMarkupFilter() {
    let buffer = ""
    return {
        push(chunk: string): string {
            buffer += chunk
            let cut = buffer.length
            const open = buffer.lastIndexOf("{{")
            if (open >= 0 && !buffer.includes("}}", open) && buffer.length - open <= MAX_PENDING) cut = open
            else if (buffer.endsWith("{")) cut = buffer.length - 1
            const ready = buffer.slice(0, cut)
            buffer = buffer.slice(cut)
            return markupToBold(ready)
        },
        flush(): string {
            const rest = markupToBold(buffer)
            buffer = ""
            return rest
        },
    }
}
