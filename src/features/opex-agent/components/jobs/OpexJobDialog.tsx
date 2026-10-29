"use client"

import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { AlarmClock, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { DatePicker } from "@/components/ui/opex/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/opex/dialog"
import { Field } from "@/components/ui/opex/field"
import { FORM_GRID } from "@/components/ui/opex/form-grid"
import { Input } from "@/components/ui/opex/input"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { Textarea } from "@/components/ui/opex/textarea"
import { TimePicker } from "@/components/ui/opex/time-picker"
import { useOpexSessions } from "../../hooks/useOpexSessions"
import { useSaveOpexJob } from "../../hooks/useOpexJobs"
import { OPEX_JOB_UNIT_LABELS, OPEX_JOB_UNITS, opexJobInputSchema, type OpexJobInput, type OpexJobWhen } from "../../jobs"

const NEW_SESSION = "new"

const WHEN_OPTIONS = [
    { value: "now", label: "Agora" },
    { value: "in", label: "Daqui a…" },
    { value: "at", label: "Em data e hora" },
] as const satisfies readonly { value: OpexJobWhen; label: string }[]

const UNIT_OPTIONS = OPEX_JOB_UNITS.map((unit) => ({ value: unit, label: OPEX_JOB_UNIT_LABELS[unit] }))

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" })

/** Valores iniciais: "agora", sessão nova; "em data e hora" já sugere hoje na próxima hora cheia. */
export function emptyJobInput(now = new Date()): OpexJobInput {
    const next = new Date(now.getTime() + 60 * 60_000)
    return { title: "", prompt: "", sessionId: null, when: "now", amount: 30, unit: "minutes", date: dayFormatter.format(next), time: `${hourFormatter.format(next).padStart(2, "0")}:00`, sourceJobId: null }
}

export type OpexJobDialogMode = { type: "create" } | { type: "edit"; id: string; values: OpexJobInput } | { type: "rerun"; values: OpexJobInput }

interface OpexJobDialogProps {
    mode: OpexJobDialogMode | null
    onOpenChange: (open: boolean) => void
}

const TITLES = { create: "Executar job", edit: "Editar job", rerun: "Reexecutar job" } as const

/** Criar, editar ou reexecutar um job: prompt do agente, sessão e quando executar. */
export function OpexJobDialog({ mode, onOpenChange }: OpexJobDialogProps) {
    const save = useSaveOpexJob()
    const sessions = useOpexSessions(Boolean(mode))
    const form = useForm<OpexJobInput>({ resolver: zodResolver(opexJobInputSchema), mode: "onChange", defaultValues: emptyJobInput() })
    const when = useWatch({ control: form.control, name: "when" })
    const selectedSession = useWatch({ control: form.control, name: "sessionId" })
    const errors = form.formState.errors
    const choices = useMemo(() => (sessions.data ?? []).filter((session) => !session.archived || session.id === selectedSession), [sessions.data, selectedSession])

    useEffect(() => {
        if (!mode) return
        form.reset(mode.type === "create" ? emptyJobInput() : { ...emptyJobInput(), ...mode.values, amount: mode.values.amount ?? 30, unit: mode.values.unit ?? "minutes", date: mode.values.date ?? emptyJobInput().date, time: mode.values.time ?? emptyJobInput().time })
    }, [mode, form])

    // Sem <form>: o diálogo fica dentro do formulário da página de Crons (o submit subiria pelo portal).
    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync({ id: mode?.type === "edit" ? mode.id : undefined, input: values }).catch(() => null)
        if (saved) onOpenChange(false)
    })

    return (
        <Dialog open={Boolean(mode)} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlarmClock className="h-4 w-4 text-primary" aria-hidden /> {TITLES[mode?.type ?? "create"]}
                    </DialogTitle>
                    <DialogDescription>O Agente Opex recebe o prompt no horário e executa sozinho. Ao terminar, você recebe um aviso com o link da sessão. Horários de Brasília.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <Field id="opex-job-title" label="Título" error={errors.title?.message}>
                        <Input id="opex-job-title" placeholder="Ex.: Resumo dos PRs do dia" autoFocus {...form.register("title")} />
                    </Field>
                    <Field id="opex-job-prompt" label="Prompt" error={errors.prompt?.message}>
                        <Textarea id="opex-job-prompt" rows={5} placeholder="O que o agente deve fazer e o que relatar" {...form.register("prompt")} />
                    </Field>
                    <Field id="opex-job-session" label="Sessão" error={errors.sessionId?.message}>
                        <Controller
                            control={form.control}
                            name="sessionId"
                            render={({ field }) => (
                                <Select value={field.value ?? NEW_SESSION} onValueChange={(value) => field.onChange(value === NEW_SESSION ? null : value)}>
                                    <SelectTrigger id="opex-job-session" className="w-full">
                                        <SelectValue placeholder="Nova sessão" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NEW_SESSION}>Nova sessão (com o título do job)</SelectItem>
                                        {choices.map((session) => (
                                            <SelectItem key={session.id} value={session.id}>
                                                {session.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <Field id="opex-job-when" label="Quando" error={undefined}>
                        <Controller
                            control={form.control}
                            name="when"
                            render={({ field }) => <OptionTabs id="opex-job-when" aria-label="Quando executar" options={WHEN_OPTIONS} value={field.value} onChange={(value) => field.onChange(value)} />}
                        />
                    </Field>
                    <AnimatePresence mode="wait" initial={false}>
                        {when !== "now" && (
                            <motion.div key={when} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                                {when === "in" ? (
                                    <div className={FORM_GRID}>
                                        <Field id="opex-job-amount" label="Em" error={errors.amount?.message}>
                                            <Input id="opex-job-amount" type="number" min={1} max={9999} inputMode="numeric" {...form.register("amount", { setValueAs: (value: string) => (value === "" ? null : Number(value)) })} />
                                        </Field>
                                        <Field id="opex-job-unit" label="Unidade" error={errors.unit?.message}>
                                            <Controller control={form.control} name="unit" render={({ field }) => <OptionTabs id="opex-job-unit" aria-label="Unidade" options={UNIT_OPTIONS} value={field.value ?? "minutes"} onChange={(value) => field.onChange(value)} />} />
                                        </Field>
                                    </div>
                                ) : (
                                    <div className={FORM_GRID}>
                                        <Field id="opex-job-date" label="Data" error={errors.date?.message}>
                                            <Controller control={form.control} name="date" render={({ field }) => <DatePicker id="opex-job-date" value={field.value ?? ""} onChange={field.onChange} fromDate={new Date()} />} />
                                        </Field>
                                        <Field id="opex-job-time" label="Horário" error={errors.time?.message}>
                                            <Controller control={form.control} name="time" render={({ field }) => <TimePicker id="opex-job-time" aria-label="Horário" value={field.value ?? ""} onChange={field.onChange} step={5} />} />
                                        </Field>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={save.isPending || !form.formState.isValid} onClick={() => void submit()}>
                        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : when === "now" ? <Play className="h-4 w-4" aria-hidden /> : <AlarmClock className="h-4 w-4" aria-hidden />}
                        {mode?.type === "edit" ? "Salvar" : when === "now" ? "Executar agora" : "Agendar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
