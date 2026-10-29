"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { getIntegrationDef, INTEGRATIONS_BASE_PATH, integrationPath, type IntegrationDef } from "@/lib/integrations/catalog"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import type { IntegrationDetailDto } from "../../types"
import { IntegrationStatusDot } from "../IntegrationBadges"

interface DetailHeaderProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    hasAnySecret: boolean
}

/** Cabeçalho (voltar, nome, status, última alteração) e aviso de chave de criptografia ausente. */
export function DetailHeader({ def, data, hasAnySecret }: DetailHeaderProps) {
    // Integração-filha (ex.: provedor de IA) volta para a página da mãe.
    const back = def.parent ? { href: integrationPath(def.parent), label: `Voltar para ${getIntegrationDef(def.parent).name}` } : { href: INTEGRATIONS_BASE_PATH, label: "Voltar para Integrações" }
    return (
        <>
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                <Button asChild variant="ghost" size="icon" className="mt-0.5" aria-label={back.label}>
                    <Link href={back.href}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="flex items-center gap-3 text-lg font-semibold md:text-2xl">
                        {def.name}
                        <IntegrationStatusDot health={data.health} />
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
                    {data.updatedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Última alteração em {formatLogTimestamp(data.updatedAt).slice(0, 16)}
                        </p>
                    )}
                </div>
            </motion.div>

            <AnimatePresence>
                {hasAnySecret && !data.encryptionKeyConfigured && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Chave de criptografia ausente no servidor (INTEGRATIONS_ENCRYPTION_KEY). Os campos privados continuam
                        sendo lidos do .env e não podem ser alterados por aqui.
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
