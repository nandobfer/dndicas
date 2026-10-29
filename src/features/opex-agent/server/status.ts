import { getAiProvider } from "@/lib/ai/providers"
import { DomainError } from "@/lib/api/route"
import type { OpexStatusDto } from "../types"
import { ownerKeyOf, requestOpexScope, roleOf, type OpexServerScope } from "./scope"
import { loadOpexSettings, opexAvailability } from "./settings"

/**
 * Situação do Agente Opex para quem está vendo (rota pública `GET /api/opex/status`): o visitante
 * ganha o cookie anônimo aqui, para assinar o próprio canal do Pusher antes da primeira mensagem.
 */
export async function getOpexStatus(scope: OpexServerScope): Promise<OpexStatusDto> {
    const { settings } = await loadOpexSettings()
    const availability = await opexAvailability(settings)
    const anonymousBlocked = scope.kind === "anonymous" && !settings.anonymous.enabled
    return {
        available: availability.available && !anonymousBlocked,
        reason: anonymousBlocked ? "Faça login para conversar com o Agente Opex." : availability.reason,
        role: roleOf(scope),
        ownerKey: ownerKeyOf(scope),
        modelLabel: settings.main.provider && settings.main.model ? `${getAiProvider(settings.main.provider).name} · ${settings.main.model}` : null,
        files: settings.files,
    }
}

/**
 * Escopo das rotas do chat: o usuário logado ou o visitante (cookie anônimo assinado). Com o agente
 * fechado para visitantes, o visitante recebe 403 com o motivo.
 */
export async function requireOpexScope(options: { loggedIn?: boolean } = {}): Promise<OpexServerScope> {
    const scope = await requestOpexScope()
    if (scope.kind === "anonymous") {
        if (options.loggedIn) throw new DomainError(403, "Faça login para usar este recurso do Agente Opex.", "OPEX_LOGIN_REQUIRED")
        const { settings } = await loadOpexSettings()
        if (!settings.anonymous.enabled) throw new DomainError(403, "Faça login para conversar com o Agente Opex.", "OPEX_LOGIN_REQUIRED")
    }
    return scope
}
