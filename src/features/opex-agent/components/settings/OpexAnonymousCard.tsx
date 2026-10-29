"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Field } from "@/components/ui/opex/field"
import { FORM_GRID_WIDE } from "@/components/ui/opex/form-grid"
import { FormToggleCard } from "@/components/ui/opex/toggle-card"
import { Input } from "@/components/ui/opex/input"
import { OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX, OPEX_ANONYMOUS_TOTAL_TURNS_PER_HOUR_MAX, OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))

type NumberField = "anonymous.turnsPerHourPerVisitor" | "anonymous.turnsPerHourPerIp" | "anonymous.turnsPerHourTotal" | "anonymous.sessionTtlDays"

/**
 * Visitantes sem login: liga/desliga o agente para eles, limita as mensagens por hora (por visitante e
 * por IP) e define em quantos dias as sessões deles expiram. Visitantes só usam o catálogo e a
 * documentação pública (sem arquivos, fichas, NPCs nem jobs).
 */
export function OpexAnonymousCard({ form }: { form: UseFormReturn<OpexAgentSettings> }) {
    const errors = form.formState.errors.anonymous
    const numberInput = (name: NumberField, id: string, max: number) => (
        <Controller
            control={form.control}
            name={name}
            render={({ field }) => (
                <Input id={id} type="number" step={1} min={1} max={max} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toNumber(event.target.value))} />
            )}
        />
    )
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Visitantes sem login</CardTitle>
                <CardDescription>
                    Visitantes consultam o catálogo e a documentação pública. As sessões deles ficam neste navegador (cookie) e expiram sozinhas; limpar os cookies começa do zero.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <FormToggleCard<OpexAgentSettings>
                    control={form.control}
                    name="anonymous.enabled"
                    id="opex-anonymous-enabled"
                    label="Atender visitantes"
                    description="Desligado, o item do Agente Opex some para quem não está logado"
                />
                <div className={FORM_GRID_WIDE}>
                    <Field id="opex-anonymous-visitor" label="Mensagens por hora, por visitante" error={errors?.turnsPerHourPerVisitor?.message}>
                        {numberInput("anonymous.turnsPerHourPerVisitor", "opex-anonymous-visitor", OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX)}
                    </Field>
                    <Field id="opex-anonymous-ip" label="Mensagens por hora, por IP" error={errors?.turnsPerHourPerIp?.message}>
                        {numberInput("anonymous.turnsPerHourPerIp", "opex-anonymous-ip", OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX)}
                    </Field>
                    <Field id="opex-anonymous-total" label="Mensagens por hora, todos os visitantes" error={errors?.turnsPerHourTotal?.message}>
                        {numberInput("anonymous.turnsPerHourTotal", "opex-anonymous-total", OPEX_ANONYMOUS_TOTAL_TURNS_PER_HOUR_MAX)}
                        <p className="text-xs text-muted-foreground">Teto do orçamento de IA para quem não está logado.</p>
                    </Field>
                    <Field id="opex-anonymous-ttl" label="Validade das sessões (dias)" error={errors?.sessionTtlDays?.message}>
                        {numberInput("anonymous.sessionTtlDays", "opex-anonymous-ttl", OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX)}
                        <p className="text-xs text-muted-foreground">Contada a partir da última mensagem.</p>
                    </Field>
                </div>
            </CardContent>
        </Card>
    )
}
