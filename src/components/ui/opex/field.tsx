import type { ReactNode } from "react"
import { Label } from "@/components/ui/opex/label"

/** Campo rotulado de formulário, com a mensagem de erro pt-BR. */
export function Field({ id, label, error, children, className }: { id: string; label: string; error?: string; children: ReactNode; className?: string }) {
    return (
        <div className={className ?? "space-y-1.5"}>
            <Label htmlFor={id} className="text-xs font-semibold">
                {label}
            </Label>
            {children}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    )
}
