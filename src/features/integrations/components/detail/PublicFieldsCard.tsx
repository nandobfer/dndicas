"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { isPublicFieldVisible, type PublicFieldDef, type PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "../../types"
import { PublicField } from "../PublicField"
import { TokenField } from "../TokenField"
import { cardMotion, FIELD_GRID, type PublicDraft } from "./draft"

interface PublicFieldsCardProps {
    fields: readonly PublicFieldDef[]
    data: IntegrationDetailDto
    publicValues: PublicDraft
    setPublic: (key: string, value: PublicFieldValue | "") => void
    readOnly?: boolean
}

/** Entrada/saída dos campos condicionais (ex.: Cluster ↔ URL ao trocar a "Conexão" do Pusher). */
const conditionalFieldMotion = {
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2, ease: "easeOut" },
} as const

/**
 * Card "Campos públicos": campos em texto simples (tokens com campo próprio). Campos com
 * `visibleWhen` só aparecem quando a condição vale no rascunho; o valor escondido é preservado.
 */
export function PublicFieldsCard({ fields, data, publicValues, setPublic, readOnly }: PublicFieldsCardProps) {
    const visibleFields = fields.filter((field) => isPublicFieldVisible(field, fields, publicValues))
    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.05 }}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Campos públicos</CardTitle>
                    <CardDescription>Salvos em texto simples; visíveis para quem acessa esta integração.</CardDescription>
                </CardHeader>
                <CardContent className={FIELD_GRID}>
                    <AnimatePresence initial={false}>
                    {visibleFields.map((field) => (
                        <motion.div key={field.key} {...conditionalFieldMotion}>
                        {field.kind === "token" ? (
                            <TokenField
                                field={field}
                                value={String(publicValues[field.key] ?? "")}
                                onChange={(value) => setPublic(field.key, value)}
                                disabled={readOnly}
                                hasSavedValue={Boolean(data.publicValues[field.key])}
                            />
                        ) : (
                            <PublicField
                                field={field}
                                value={publicValues[field.key] ?? ""}
                                onChange={(value) => setPublic(field.key, value)}
                                disabled={readOnly}
                            />
                        )}
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </motion.div>
    )
}
