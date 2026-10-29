"use client"

import { BookOpen, Compass, Lock } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"
import { SWAGGER_URL_DESCRIPTION } from "@/lib/integrations/catalog"

interface SwaggerDocsFieldProps {
    value: string
    onChange: (value: string) => void
    savedUrl: string | null
    /** Há alterações não salvas no formulário. */
    dirty: boolean
    canExplore: boolean
    disabled?: boolean
    /** Documentação servida pelo próprio app: URL automática, somente leitura. */
    managed?: boolean
    onExplore: () => void
}

export const MANAGED_SWAGGER_DESCRIPTION =
    "Gerada e servida pelo próprio app a partir do código; não pode ser alterada. Entregue a terceiros a página /api/docs."

/** Motivo de o botão Explorar estar desabilitado, ou `null` quando pode explorar. */
export function exploreBlockedReason({
    savedUrl,
    dirty,
    canExplore,
}: Pick<SwaggerDocsFieldProps, "savedUrl" | "dirty" | "canExplore">): string | null {
    if (!canExplore) return "Sem permissão para explorar a API desta integração"
    if (!savedUrl) return "Cadastre e salve a URL da documentação para explorar"
    if (dirty) return "Salve ou desfaça as alterações para explorar"
    return null
}

/** Campo "Documentação Swagger (OpenAPI)" com o botão Explorar. */
export function SwaggerDocsField({ value, onChange, savedUrl, dirty, canExplore, disabled, managed, onExplore }: SwaggerDocsFieldProps) {
    const blocked = exploreBlockedReason({ savedUrl, dirty, canExplore })
    const button = (
        <Button type="button" variant="outline" onClick={onExplore} disabled={blocked !== null} className="shrink-0">
            <Compass className="mr-2 h-4 w-4" /> Explorar
        </Button>
    )
    return (
        <div className="space-y-1.5">
            <Label htmlFor="field-swagger-url" className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-primary" /> Documentação Swagger (OpenAPI)
                {managed && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Gerenciada pelo app" />}
            </Label>
            <div className="flex gap-2">
                <Input
                    id="field-swagger-url"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="https://servico.exemplo.com/openapi.json"
                    disabled={disabled}
                    readOnly={managed}
                    className={cn("font-mono text-xs", managed && "bg-muted text-muted-foreground")}
                />
                {blocked ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {/* span: botão desabilitado não dispara eventos de ponteiro. */}
                                <span tabIndex={0}>{button}</span>
                            </TooltipTrigger>
                            <TooltipContent>{blocked}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    button
                )}
            </div>
            <p className="text-xs text-muted-foreground">{managed ? MANAGED_SWAGGER_DESCRIPTION : SWAGGER_URL_DESCRIPTION}</p>
        </div>
    )
}
