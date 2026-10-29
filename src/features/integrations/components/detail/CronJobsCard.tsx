"use client"

import { motion } from "framer-motion"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { CronJobConfig, PublicFieldDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "../../types"
import { CronJobsEditor } from "../CronJobsEditor"
import { cardMotion, type PublicDraft } from "./draft"

interface CronJobsCardProps {
    field: PublicFieldDef
    data: IntegrationDetailDto
    publicValues: PublicDraft
    setPublic: (key: string, value: PublicFieldValue | "") => void
    readOnly?: boolean
    canRun: boolean
    /** Rotinas de integrações desativadas: ficam fora da lista (continuam salvas). */
    hiddenJobIds?: ReadonlySet<string>
}

/** Card das rotinas agendadas (campo `cron-jobs`). */
export function CronJobsCard({ field, data, publicValues, setPublic, readOnly, canRun, hiddenJobIds }: CronJobsCardProps) {
    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.15 }}>
            <Card animate={false}>
                <CardHeader>
                    <CardTitle className="text-base">{field.label}</CardTitle>
                    <CardDescription>Executadas por uma única instância do servidor por vez. Horários de Brasília.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <CronJobsEditor
                        value={(publicValues[field.key] as CronJobConfig[] | "") || []}
                        onChange={(jobs) => setPublic(field.key, jobs)}
                        states={data.cronStates}
                        disabled={readOnly}
                        savedJobs={(data.publicValues[field.key] as CronJobConfig[] | null) ?? []}
                        canRun={canRun}
                        hiddenJobIds={hiddenJobIds}
                    />
                </CardContent>
            </Card>
        </motion.div>
    )
}
