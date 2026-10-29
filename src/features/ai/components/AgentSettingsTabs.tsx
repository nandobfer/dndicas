"use client"

import type { ReactNode } from "react"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"

/** Parâmetro da URL com a seção ativa dentro da aba de um agente (`?aba=agente-opex&secao=ferramentas`). */
export const AGENT_SECTION_PARAM = "secao"

interface AgentSettingsTabsProps<T extends string> {
    tabs: readonly IntegrationTabDef<T>[]
    fallback: T
    label: string
    children: (section: T, go: (section: T) => void) => ReactNode
}

const noop = () => undefined

/**
 * Seções da configuração de um agente de IA (mesmas abas da página da integração). O formulário do
 * agente fica montado acima das seções, então trocar de seção não descarta o rascunho: o Salvar de
 * qualquer seção grava tudo.
 */
export function AgentSettingsTabs<T extends string>({ tabs, fallback, label, children }: AgentSettingsTabsProps<T>) {
    const { tab, requestTab } = useIntegrationTab<T>(
        tabs.map((item) => item.id),
        fallback,
        false,
        noop,
        AGENT_SECTION_PARAM,
    )
    return (
        <IntegrationTabs tabs={tabs} active={tab} onSelect={requestTab} pendingTab={null} onConfirmDiscard={noop} onCancelDiscard={noop} label={label}>
            {children(tab, requestTab)}
        </IntegrationTabs>
    )
}
