"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FORM_GRID_COMPACT } from "@/components/ui/opex/form-grid"
import { Check, ChevronDown, Copy, Loader2, Play, RotateCcw } from "lucide-react"
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
import { Button } from "@/components/ui/opex/button"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { Textarea } from "@/components/ui/opex/textarea"
import { cn } from "@/lib/utils"
import {
    describeSchemaType,
    initialBodyText,
    initialParameterValue,
    jsonError,
    parameterKey,
    resolveSchema,
    splitParameterValues,
    validateParameters,
    type ParameterValues,
} from "../../openapi/examples"
import {
    isMutatingMethod,
    type ExplorerExecuteResult,
    type ExplorerOperation,
    type NormalizedSpec,
    type OperationParameter,
    type ParameterLocation,
} from "../../openapi/types"
import { integrationErrorMessage } from "../../hooks/useIntegrations"
import { statusTone } from "./MethodBadge"
import { SchemaTree } from "./SchemaTree"

const LOCATION_LABELS: Record<ParameterLocation, string> = {
    path: "Caminho",
    query: "Query",
    header: "Cabeçalhos",
}

interface OperationPanelProps {
    operation: ExplorerOperation
    schemas: NormalizedSpec["schemas"]
    integrationName: string
    onOpenSchema: (name: string) => void
    execute: (input: { operation: string; path: Record<string, string>; query: Record<string, string>; headers: Record<string, string>; body?: string }) => Promise<ExplorerExecuteResult>
    /** Execução bloqueada (ex.: sem URL base) — o motivo aparece no botão. */
    blockedReason?: string
}

function isJsonContent(contentType: string | null | undefined): boolean {
    return Boolean(contentType && /json/i.test(contentType))
}

export function prettyBody(body: string, contentType: string | null): string {
    if (!isJsonContent(contentType) && !/^\s*[[{]/.test(body)) return body
    try {
        return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
        return body
    }
}

function ParameterInput({
    param,
    value,
    error,
    schemas,
    onChange,
}: {
    param: OperationParameter
    value: string
    error?: string
    schemas: NormalizedSpec["schemas"]
    onChange: (value: string) => void
}) {
    const schema = resolveSchema(param.schema, schemas)
    const inputId = `param-${param.in}-${param.name}`
    const type = schema?.type?.split(" | ")[0]
    const options = schema?.enum ?? (type === "boolean" ? [true, false] : undefined)
    return (
        <div className="space-y-1">
            <Label htmlFor={inputId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs">{param.name}</span>
                {param.required && <span className="text-destructive">*</span>}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">{describeSchemaType(schema ?? param.schema)}</span>
                {param.deprecated && <span className="text-[10px] uppercase text-amber-600">obsoleto</span>}
            </Label>
            {options ? (
                <Select value={value || undefined} onValueChange={onChange}>
                    <SelectTrigger id={inputId} aria-label={param.name} className={cn("h-9 font-mono text-xs", error && "border-destructive")}>
                        <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={String(option)} value={String(option)} className="font-mono text-xs">
                                {String(option)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <Input
                    id={inputId}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    inputMode={type === "integer" || type === "number" ? "decimal" : undefined}
                    placeholder={schema?.format ?? type ?? ""}
                    aria-invalid={Boolean(error)}
                    className={cn("h-9 font-mono text-xs", error && "border-destructive")}
                />
            )}
            {param.description && <p className="text-xs text-muted-foreground">{param.description}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    )
}

function ResponseView({ result }: { result: ExplorerExecuteResult }) {
    const [copied, setCopied] = useState(false)
    const [showHeaders, setShowHeaders] = useState(false)
    const pretty = useMemo(() => prettyBody(result.body, result.contentType), [result.body, result.contentType])
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(pretty)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            toast.error("Não foi possível copiar")
        }
    }
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2 rounded-lg border bg-muted/30 p-3"
            data-testid="explorer-response"
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded px-2 py-0.5 font-mono text-xs font-semibold", statusTone(result.status))}>
                    {result.status} {result.statusText}
                </span>
                <span className="text-xs text-muted-foreground">{result.latencyMs} ms</span>
                {result.truncated && <span className="text-xs text-amber-600">Resposta truncada em 1 MB</span>}
                <div className="ml-auto flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowHeaders((v) => !v)}>
                        Cabeçalhos
                        <motion.span className="ml-1 flex" animate={{ rotate: showHeaders ? 180 : 0 }}>
                            <ChevronDown className="h-3 w-3" />
                        </motion.span>
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void copy()} aria-label="Copiar resposta">
                        {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                        {copied ? "Copiado" : "Copiar"}
                    </Button>
                </div>
            </div>
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={result.url}>
                {result.url}
            </p>
            <AnimatePresence initial={false}>
                {showHeaders && (
                    <motion.pre
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden rounded bg-background p-2 font-mono text-[11px]"
                    >
                        {Object.entries(result.headers)
                            .map(([name, value]) => `${name}: ${value}`)
                            .join("\n") || "(nenhum)"}
                    </motion.pre>
                )}
            </AnimatePresence>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-3 font-mono text-xs">
                {pretty || <span className="text-muted-foreground">(corpo vazio)</span>}
            </pre>
        </motion.div>
    )
}

/**
 * Detalhe de uma operação: descrição, formulário de parâmetros gerado pelo schema, editor do
 * corpo (JSON com exemplo) e execução — com confirmação para métodos que alteram dados.
 */
export function OperationPanel({ operation, schemas, integrationName, onOpenSchema, execute, blockedReason }: OperationPanelProps) {
    const initialValues = useMemo(() => {
        const values: ParameterValues = {}
        for (const param of operation.parameters) values[parameterKey(param)] = initialParameterValue(param, schemas)
        return values
    }, [operation.parameters, schemas])
    const initialBody = useMemo(
        () => (operation.requestBody ? initialBodyText(operation.requestBody.example, operation.requestBody.schema, schemas) : ""),
        [operation.requestBody, schemas],
    )

    const [values, setValues] = useState<ParameterValues>(initialValues)
    const [body, setBody] = useState(initialBody)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [confirming, setConfirming] = useState(false)
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<ExplorerExecuteResult | null>(null)
    const [failure, setFailure] = useState<string | null>(null)

    const bodyIsJson = operation.requestBody ? /json/i.test(operation.requestBody.contentType) : false
    const bodyError = bodyIsJson ? jsonError(body) : null
    const mutating = isMutatingMethod(operation.method)
    const grouped = (["path", "query", "header"] as ParameterLocation[])
        .map((location) => ({ location, params: operation.parameters.filter((p) => p.in === location) }))
        .filter((group) => group.params.length > 0)

    const run = async () => {
        setConfirming(false)
        setRunning(true)
        setFailure(null)
        try {
            const split = splitParameterValues(operation.parameters, values)
            const response = await execute({
                operation: operation.key,
                ...split,
                body: operation.requestBody && body.trim() !== "" ? body : undefined,
            })
            setResult(response)
        } catch (error) {
            setResult(null)
            setFailure(integrationErrorMessage(error, "Não foi possível executar a operação"))
        } finally {
            setRunning(false)
        }
    }

    const requestRun = () => {
        const nextErrors = validateParameters(operation.parameters, values, schemas)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0 || bodyError) return
        if (operation.requestBody?.required && body.trim() === "") {
            setFailure("O corpo da requisição é obrigatório")
            return
        }
        if (mutating) setConfirming(true)
        else void run()
    }

    return (
        <div className="space-y-4 pt-1" data-ctrl-enter-scope>
            {(operation.description || operation.summary) && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">{operation.description ?? operation.summary}</p>
            )}

            {grouped.map((group) => (
                <section key={group.location} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{LOCATION_LABELS[group.location]}</h4>
                    <div className={FORM_GRID_COMPACT}>
                        {group.params.map((param) => {
                            const key = parameterKey(param)
                            return (
                                <ParameterInput
                                    key={key}
                                    param={param}
                                    value={values[key] ?? ""}
                                    error={errors[key]}
                                    schemas={schemas}
                                    onChange={(value) => {
                                        setValues((prev) => ({ ...prev, [key]: value }))
                                        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }))
                                    }}
                                />
                            )
                        })}
                    </div>
                </section>
            ))}

            {operation.requestBody && (
                <section className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Corpo {operation.requestBody.required && <span className="text-destructive">*</span>}
                        </h4>
                        <span className="font-mono text-[11px] text-muted-foreground">{operation.requestBody.contentType}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-7 px-2 text-xs"
                            onClick={() => setBody(initialBody)}
                            disabled={body === initialBody}
                        >
                            <RotateCcw className="mr-1 h-3 w-3" /> Restaurar exemplo
                        </Button>
                    </div>
                    <Textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        spellCheck={false}
                        aria-label="Corpo da requisição"
                        aria-invalid={Boolean(bodyError)}
                        className={cn("min-h-40 font-mono text-xs", bodyError && "border-destructive")}
                    />
                    {bodyError && <p className="text-xs text-destructive">{bodyError}</p>}
                    {operation.requestBody.schema && (
                        <details className="rounded-md border p-2 text-sm">
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Schema do corpo</summary>
                            <div className="mt-2">
                                <SchemaTree node={operation.requestBody.schema} schemas={schemas} onOpenRef={onOpenSchema} />
                            </div>
                        </details>
                    )}
                </section>
            )}

            {operation.responses.length > 0 && (
                <details className="rounded-md border p-2 text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Respostas documentadas</summary>
                    <ul className="mt-2 space-y-2">
                        {operation.responses.map((response) => (
                            <li key={response.status} className="space-y-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-xs font-semibold">{response.status}</span>
                                    <span className="text-xs text-muted-foreground">{response.description}</span>
                                </div>
                                {response.schema && <SchemaTree node={response.schema} schemas={schemas} onOpenRef={onOpenSchema} defaultDepth={0} />}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <div className="flex items-center justify-end gap-2">
                {blockedReason && <span className="text-xs text-muted-foreground">{blockedReason}</span>}
                <Button type="button" data-ctrl-enter-submit onClick={requestRun} disabled={running || Boolean(blockedReason)}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Executar
                </Button>
            </div>

            <AnimatePresence mode="wait">
                {failure && (
                    <motion.p
                        key="failure"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
                        role="alert"
                    >
                        {failure}
                    </motion.p>
                )}
                {result && <ResponseView key={`${result.status}-${result.latencyMs}`} result={result} />}
            </AnimatePresence>

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Executar {operation.method.toUpperCase()}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta operação pode alterar dados em {integrationName}. A chamada usa as credenciais configuradas na integração e
                            fica registrada na auditoria.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void run()}>Executar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
