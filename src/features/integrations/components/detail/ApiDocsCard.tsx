"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { IntegrationDetailDto } from "../../types"
import { SwaggerDocsField } from "../SwaggerDocsField"
import { cardMotion, type Draft } from "./draft"

interface ApiDocsCardProps {
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    readOnly?: boolean
    onExplore: () => void
}

/** Card "Documentação da API": URL do Swagger e entrada para o explorador. */
export function ApiDocsCard({ data, draft, setDraft, dirty, readOnly, onExplore }: ApiDocsCardProps) {
    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.03 }}>
            <Card animate={false}>
                <CardHeader>
                    <CardTitle className="text-base">Documentação da API</CardTitle>
                    <CardDescription>
                        {data.explorerAuth
                            ? `O explorador autentica as chamadas no servidor: ${data.explorerAuth}.`
                            : "Sem autenticação automática: o explorador chama a API sem credenciais."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <SwaggerDocsField
                        value={draft.swaggerUrl}
                        onChange={(swaggerUrl) => setDraft((prev) => ({ ...prev, swaggerUrl }))}
                        savedUrl={data.swaggerUrl}
                        dirty={dirty}
                        canExplore
                        disabled={readOnly}
                        managed={data.swaggerUrlManaged === true}
                        onExplore={onExplore}
                    />
                </CardContent>
            </Card>
        </motion.div>
    )
}
