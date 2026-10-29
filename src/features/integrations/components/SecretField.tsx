"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Eraser, KeyRound, Pencil, Undo2 } from "lucide-react"
import { IconAction } from "./IconAction"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { cn } from "@/lib/utils"
import type { SecretFieldDef } from "@/lib/integrations/catalog"
import type { SecretAction } from "../schemas/integration.schema"
import type { IntegrationSecretStateDto } from "../types"

interface SecretFieldProps {
    field: SecretFieldDef
    state: IntegrationSecretStateDto
    action: SecretAction | undefined
    onChange: (action: SecretAction | undefined) => void
    disabled?: boolean
    encryptionAvailable: boolean
}

const SOURCE_LABEL: Record<IntegrationSecretStateDto["source"], string> = {
    db: "Configurado",
    env: "Configurado no .env",
    none: "Não configurado",
}

/**
 * Campo privado somente-escrita: o valor salvo nunca volta ao navegador. O administrador
 * pode apenas substituir (novo valor) ou limpar; "Desfazer" volta a manter o atual.
 */
export function SecretField({ field, state, action, onChange, disabled, encryptionAvailable }: SecretFieldProps) {
    const [editing, setEditing] = useState(false)
    const inputId = `secret-${field.key}`
    const mode = action?.action === "clear" ? "clear" : editing || action?.action === "set" ? "set" : "keep"

    const reset = () => {
        setEditing(false)
        onChange(undefined)
    }

    return (
        <div className="space-y-1.5">
            <Label htmlFor={inputId} className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {field.label}
                {field.required && <span className="text-destructive">*</span>}
            </Label>
            <AnimatePresence mode="wait" initial={false}>
                {mode === "set" ? (
                    <motion.div
                        key="set"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        className="flex gap-2"
                    >
                        <Input
                            id={inputId}
                            type="password"
                            autoComplete="new-password"
                            autoFocus
                            placeholder={`Novo valor para ${field.label.toLowerCase()}`}
                            value={action?.action === "set" ? action.value : ""}
                            onChange={(event) =>
                                onChange(event.target.value ? { action: "set", value: event.target.value } : undefined)
                            }
                            disabled={disabled}
                        />
                        <IconAction label="Desfazer" icon={<Undo2 className="h-4 w-4" />} onClick={reset} className="h-10 w-10" />
                    </motion.div>
                ) : (
                    <motion.div
                        key={mode}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        className={cn(
                            "flex h-10 items-center justify-between gap-2 rounded-md border px-3",
                            mode === "clear" ? "border-destructive/40 bg-destructive/5" : "bg-muted/40",
                        )}
                    >
                        <span className="flex items-center gap-2 text-sm">
                            {mode === "clear" ? (
                                <span className="text-destructive">Será removido ao salvar</span>
                            ) : (
                                <>
                                    <span className={cn(state.configured ? "text-foreground" : "text-muted-foreground")}>
                                        {SOURCE_LABEL[state.source]}
                                    </span>
                                    {state.configured && <span className="tracking-widest text-muted-foreground">••••••••</span>}
                                </>
                            )}
                        </span>
                        <span className="-mr-2 flex items-center">
                            {mode === "clear" ? (
                                <IconAction label="Desfazer" icon={<Undo2 className="h-4 w-4" />} onClick={reset} />
                            ) : (
                                <>
                                    <IconAction
                                        label={
                                            encryptionAvailable
                                                ? state.configured
                                                    ? "Substituir"
                                                    : "Definir"
                                                : "Chave de criptografia ausente no servidor"
                                        }
                                        icon={<Pencil className="h-4 w-4" />}
                                        onClick={() => setEditing(true)}
                                        disabled={disabled || !encryptionAvailable}
                                    />
                                    {state.configured && (
                                        <IconAction
                                            label="Limpar"
                                            icon={<Eraser className="h-4 w-4" />}
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => onChange({ action: "clear" })}
                                            disabled={disabled}
                                        />
                                    )}
                                </>
                            )}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
            {state.unreadable && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> O valor salvo não pôde ser lido com a chave atual; defina-o novamente.
                </p>
            )}
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
    )
}
