"use client"

import { KeyRound } from "lucide-react"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"

/**
 * Token informado no explorador quando o adaptador não injeta credencial (API interna): vai como
 * `Authorization: Bearer …` só nas chamadas desta tela e nunca é salvo.
 */
export function ClientTokenField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="space-y-1">
            <Label htmlFor="explorer-client-token" className="flex items-center gap-1.5 text-xs font-semibold">
                <KeyRound className="h-3.5 w-3.5 text-primary" aria-hidden /> Token de sistema (Authorization: Bearer)
            </Label>
            <Input
                id="explorer-client-token"
                type="password"
                autoComplete="off"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="mt_sys_…"
                className="font-mono text-xs"
            />
        </div>
    )
}
