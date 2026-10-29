"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import type { SecretFieldDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "../../types"
import { SecretField } from "../SecretField"
import { cardMotion, FIELD_GRID, type Draft } from "./draft"

interface SecretFieldsCardProps {
    fields: readonly SecretFieldDef[]
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    readOnly?: boolean
}

/** Card "Campos privados": segredos criptografados no servidor. */
export function SecretFieldsCard({ fields, data, draft, setDraft, readOnly }: SecretFieldsCardProps) {
    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.1 }}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Campos privados</CardTitle>
                    <CardDescription>Criptografados no servidor. O valor salvo nunca é exibido.</CardDescription>
                </CardHeader>
                <CardContent className={FIELD_GRID}>
                    {fields.map((field) => (
                        <SecretField
                            key={`${field.key}-${data.updatedAt ?? ""}`}
                            field={field}
                            state={data.secrets[field.key] ?? { configured: false, source: "none", unreadable: false }}
                            action={draft.secrets[field.key]}
                            onChange={(action) => setDraft({ ...draft, secrets: { ...draft.secrets, [field.key]: action } })}
                            disabled={readOnly}
                            encryptionAvailable={data.encryptionKeyConfigured}
                        />
                    ))}
                </CardContent>
            </Card>
        </motion.div>
    )
}
