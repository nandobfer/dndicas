import { isCardManagedField, type IntegrationEnvironment, type PublicFieldDef, type PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationUpdateInput, SecretAction } from "../../schemas/integration.schema"
import type { IntegrationDetailDto } from "../../types"

export type PublicDraft = Record<string, PublicFieldValue | "">

export interface Draft {
    environment: IntegrationEnvironment
    debugMode: boolean
    swaggerUrl: string
    publicValues: PublicDraft
    secrets: Record<string, SecretAction | undefined>
}

export function draftFrom(detail: IntegrationDetailDto): Draft {
    const publicValues: PublicDraft = {}
    for (const [key, value] of Object.entries(detail.publicValues)) publicValues[key] = value ?? ""
    return { environment: detail.environment, debugMode: detail.debugMode, swaggerUrl: detail.swaggerUrl ?? "", publicValues, secrets: {} }
}

/** Diferença entre o rascunho e o salvo, no formato do PATCH. Número vazio vira ausente. */
export function buildIntegrationPatch(
    fields: readonly PublicFieldDef[],
    detail: IntegrationDetailDto,
    draft: Draft,
): IntegrationUpdateInput {
    const patch: IntegrationUpdateInput = {}
    if (draft.environment !== detail.environment) patch.environment = draft.environment
    if (draft.debugMode !== detail.debugMode) patch.debugMode = draft.debugMode
    // Documentação gerenciada (servida pelo app) nunca vai no PATCH — o servidor recusa.
    if (!detail.swaggerUrlManaged && draft.swaggerUrl.trim() !== (detail.swaggerUrl ?? "")) patch.swaggerUrl = draft.swaggerUrl.trim()

    const publicValues: Record<string, unknown> = {}
    for (const field of fields) {
        // Campos de card próprio (ex.: leitura e digitando) não estão no detalhe nem no PATCH genérico.
        if (isCardManagedField(field)) continue
        const current = draft.publicValues[field.key]
        const saved = detail.publicValues[field.key] ?? ""
        if (JSON.stringify(current) === JSON.stringify(saved)) continue
        if (field.kind === "number") {
            if (current === "" || current === undefined) continue
            publicValues[field.key] = Number(current)
        } else {
            publicValues[field.key] = current
        }
    }
    if (Object.keys(publicValues).length > 0) patch.publicValues = publicValues

    const secrets = Object.fromEntries(Object.entries(draft.secrets).filter(([, action]) => action !== undefined))
    if (Object.keys(secrets).length > 0) patch.secrets = secrets
    return patch
}

export const cardMotion = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: "easeOut" },
} as const

/** Grade dos formulários das integrações (ver `@/components/ui/opex/form-grid`). */
export { FORM_GRID_WIDE as FIELD_GRID } from "@/components/ui/opex/form-grid"
