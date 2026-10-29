import { NextResponse } from "next/server"
import type { ApiResponse } from "@/core/types/common"
import { isIntegrationInDevelopment } from "@/lib/integrations/catalog"

/**
 * O fluxo agêntico da central de feedback (plano, implementação, iteração, aprovação e modelos do
 * OpenCode) passa a ser responsabilidade da integração "Opex". Enquanto ela estiver "Em
 * desenvolvimento" em Integrações, essas ações ficam bloqueadas (o worker externo foi removido).
 */

export const OPEX_INTEGRATION_UNAVAILABLE_CODE = "OPEX_INTEGRATION_UNAVAILABLE"

export const OPEX_INTEGRATION_UNAVAILABLE_MESSAGE =
    'O fluxo agêntico dos feedbacks depende da integração "Opex", que ainda está em desenvolvimento em Integrações. As demais ações da central continuam disponíveis.'

export class OpexIntegrationUnavailableError extends Error {
    readonly code = OPEX_INTEGRATION_UNAVAILABLE_CODE

    constructor() {
        super(OPEX_INTEGRATION_UNAVAILABLE_MESSAGE)
        this.name = "OpexIntegrationUnavailableError"
    }
}

/** A integração Opex está disponível para o fluxo agêntico? */
export function isOpexIntegrationAvailable(): boolean {
    return !isIntegrationInDevelopment("opex")
}

/** Lança `OpexIntegrationUnavailableError` enquanto a integração Opex estiver em desenvolvimento. */
export function assertOpexIntegrationAvailable(): void {
    if (!isOpexIntegrationAvailable()) throw new OpexIntegrationUnavailableError()
}

/** Resposta 409 padronizada (`ApiResponse`) das rotas bloqueadas, ou `null` para seguir. */
export function opexIntegrationUnavailableResponse(): NextResponse<ApiResponse<null>> | null {
    if (isOpexIntegrationAvailable()) return null
    return NextResponse.json({ success: false, error: OPEX_INTEGRATION_UNAVAILABLE_MESSAGE, code: OPEX_INTEGRATION_UNAVAILABLE_CODE }, { status: 409 })
}
