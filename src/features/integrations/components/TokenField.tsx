"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy, KeyRound, RefreshCcw } from "lucide-react"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/opex/alert-dialog"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import type { PublicFieldDef } from "@/lib/integrations/catalog"
import { IconAction } from "./IconAction"

/** 32 bytes aleatórios em hexadecimal (64 caracteres) — mesmo formato de `openssl rand -hex 32`. */
export function generateApiToken(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

interface TokenFieldProps {
    field: PublicFieldDef
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    /** Token atualmente salvo — gerar um novo exige confirmação só quando ele existe. */
    hasSavedValue: boolean
}

/**
 * Token visível (entregue a clientes) com ações Copiar e Gerar novo token. O novo token só
 * passa a valer ao salvar o formulário.
 */
export function TokenField({ field, value, onChange, disabled, hasSavedValue }: TokenFieldProps) {
    const inputId = `field-${field.key}`
    const [copied, setCopied] = useState(false)
    const [confirming, setConfirming] = useState(false)

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success("Token copiado")
            setTimeout(() => setCopied(false), 1500)
        } catch {
            toast.error("Não foi possível copiar o token")
        }
    }

    const regenerate = () => {
        onChange(generateApiToken())
        setConfirming(false)
        toast.info("Novo token gerado. Salve para aplicar.")
    }

    return (
        <div className="space-y-1.5">
            <Label htmlFor={inputId} className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {field.label}
                {field.required && <span className="text-destructive">*</span>}
            </Label>
            <div className="flex items-center gap-1">
                <Input
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono text-xs"
                />
                <IconAction
                    label="Copiar"
                    className="h-10 w-10"
                    onClick={() => void copy()}
                    disabled={!value}
                    icon={
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={copied ? "ok" : "copy"}
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.6, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="inline-flex"
                            >
                                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </motion.span>
                        </AnimatePresence>
                    }
                />
                <IconAction
                    label="Gerar novo token"
                    className="h-10 w-10"
                    onClick={() => (hasSavedValue ? setConfirming(true) : regenerate())}
                    disabled={disabled}
                    icon={<RefreshCcw className="h-4 w-4" />}
                />
            </div>
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Gerar novo token?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ao salvar, o token atual deixa de funcionar e os clientes que o usam precisarão receber o novo.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={regenerate}>Gerar novo token</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
