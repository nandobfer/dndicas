"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { Bug } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Label } from "@/components/ui/opex/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { Switch } from "@/components/ui/opex/switch"
import { INTEGRATION_ENVIRONMENT_LABELS, type IntegrationEnvironment } from "@/lib/integrations/catalog"
import { cardMotion, FIELD_GRID, type Draft } from "./draft"

interface GeneralCardProps {
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    readOnly?: boolean
}

/** Card "Geral": ambiente e modo debug. */
export function GeneralCard({ draft, setDraft, readOnly }: GeneralCardProps) {
    return (
        <motion.div {...cardMotion}>
            <Card animate={false}>
                <CardHeader>
                    <CardTitle className="text-base">Geral</CardTitle>
                </CardHeader>
                <CardContent className={`${FIELD_GRID} p-6 pt-0`}>
                    <div className="space-y-1.5">
                        <Label>Ambiente</Label>
                        <Select
                            value={draft.environment}
                            onValueChange={(environment) => setDraft({ ...draft, environment: environment as IntegrationEnvironment })}
                            disabled={readOnly}
                        >
                            <SelectTrigger aria-label="Ambiente">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(INTEGRATION_ENVIRONMENT_LABELS) as IntegrationEnvironment[]).map((env) => (
                                    <SelectItem key={env} value={env}>
                                        {INTEGRATION_ENVIRONMENT_LABELS[env]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                            <Bug className="h-3.5 w-3.5 text-amber-600" /> Modo debug
                        </Label>
                        <div className="flex h-10 items-center gap-3">
                            <Switch
                                checked={draft.debugMode}
                                onCheckedChange={(debugMode) => setDraft({ ...draft, debugMode })}
                                disabled={readOnly}
                                aria-label="Modo debug"
                            />
                            <span className="text-xs text-muted-foreground">Registra chamadas, eventos e etapas (retidos por 48h)</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
