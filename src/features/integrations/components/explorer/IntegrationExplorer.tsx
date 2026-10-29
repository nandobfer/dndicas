"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ChevronRight, KeyRound, Lock, RefreshCw, Search, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardHeader } from "@/components/ui/opex/card"
import { Input } from "@/components/ui/opex/input"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { cn } from "@/lib/utils"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { integrationErrorMessage } from "../../hooks/useIntegrations"
import { useExecuteOperation, useExplorerSpec } from "../../hooks/useIntegrationExplorer"
import type { ExplorerOperation, ExplorerSpecDto, NormalizedSpec } from "../../openapi/types"
import { IconAction } from "../IconAction"
import { ClientTokenField } from "./ClientTokenField"
import { MethodBadge } from "./MethodBadge"
import { OperationPanel } from "./OperationPanel"
import { SchemaTree } from "./SchemaTree"

type Tab = "operations" | "schemas"

interface IntegrationExplorerProps {
    id: IntegrationId
    integrationName: string
    swaggerUrl: string
    onBack: () => void
}

/** Filtra operações por caminho, resumo, operationId ou método. */
export function filterOperations(operations: ExplorerOperation[], search: string): ExplorerOperation[] {
    const term = search.trim().toLowerCase()
    if (!term) return operations
    return operations.filter((op) =>
        [op.path, op.summary, op.operationId, op.method, op.description].some((value) => value?.toLowerCase().includes(term)),
    )
}

const listMotion = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.03 } },
}
const itemMotion = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0 },
}

function TagGroup({
    name,
    description,
    operations,
    openOperation,
    onToggleOperation,
    renderPanel,
    defaultOpen,
}: {
    name: string
    description?: string
    operations: ExplorerOperation[]
    openOperation: string | null
    onToggleOperation: (key: string) => void
    renderPanel: (operation: ExplorerOperation) => React.ReactNode
    defaultOpen: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <motion.section variants={itemMotion} className="overflow-hidden rounded-lg border">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
                aria-expanded={open}
            >
                <motion.span className="flex" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </motion.span>
                <span className="font-semibold">{name}</span>
                <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">{operations.length}</span>
                {description && <span className="min-w-0 truncate text-xs text-muted-foreground">{description}</span>}
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="divide-y overflow-hidden"
                    >
                        {operations.map((operation) => {
                            const expanded = openOperation === operation.key
                            return (
                                <li key={operation.key}>
                                    <button
                                        type="button"
                                        onClick={() => onToggleOperation(operation.key)}
                                        className={cn(
                                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40",
                                            expanded && "bg-muted/30",
                                        )}
                                        aria-expanded={expanded}
                                        data-testid={`operation-${operation.key}`}
                                    >
                                        <MethodBadge method={operation.method} />
                                        <span className={cn("min-w-0 truncate font-mono text-xs", operation.deprecated && "line-through opacity-60")}>
                                            {operation.path}
                                        </span>
                                        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{operation.summary}</span>
                                        {operation.deprecated && <span className="text-[10px] uppercase text-amber-600">obsoleta</span>}
                                        {operation.secured && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Exige autenticação" />}
                                    </button>
                                    <AnimatePresence initial={false}>
                                        {expanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.22, ease: "easeOut" }}
                                                className="overflow-hidden"
                                            >
                                                <div className="border-t bg-background px-4 py-3">{renderPanel(operation)}</div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </li>
                            )
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </motion.section>
    )
}

function SchemasView({
    schemas,
    selected,
    onSelect,
    search,
}: {
    schemas: NormalizedSpec["schemas"]
    selected: string | null
    onSelect: (name: string | null) => void
    search: string
}) {
    const names = Object.keys(schemas)
        .filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
    if (names.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum schema encontrado.</p>
    return (
        <motion.ul initial="hidden" animate="visible" variants={listMotion} className="space-y-2">
            {names.map((name) => {
                const open = selected === name
                return (
                    <motion.li key={name} variants={itemMotion} className="overflow-hidden rounded-lg border" id={`schema-${name}`}>
                        <button
                            type="button"
                            onClick={() => onSelect(open ? null : name)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                            aria-expanded={open}
                        >
                            <motion.span className="flex" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </motion.span>
                            <span className="font-mono text-sm font-medium">{name}</span>
                            {schemas[name].description && (
                                <span className="min-w-0 truncate text-xs text-muted-foreground">{schemas[name].description}</span>
                            )}
                        </button>
                        <AnimatePresence initial={false}>
                            {open && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t px-3 py-2"
                                >
                                    <SchemaTree node={{ ref: name }} schemas={schemas} onOpenRef={onSelect} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.li>
                )
            })}
        </motion.ul>
    )
}

function ExplorerSkeleton() {
    return (
        <div className="space-y-3" role="status" aria-label="Carregando documentação">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-9 w-full" />
            {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
    )
}

/**
 * Explorador da documentação Swagger (OpenAPI 3.x) da integração: operações agrupadas por tag,
 * schemas e execução com as credenciais do servidor. Substitui o formulário na coluna da
 * esquerda; o debug continua à direita e recebe as linhas `[explorar]`.
 */
export function IntegrationExplorer({ id, integrationName, swaggerUrl, onBack }: IntegrationExplorerProps) {
    const spec = useExplorerSpec(id, swaggerUrl, true)
    const execute = useExecuteOperation(id)
    const [tab, setTab] = useState<Tab>("operations")
    const [search, setSearch] = useState("")
    const [openOperation, setOpenOperation] = useState<string | null>(null)
    const [selectedSchema, setSelectedSchema] = useState<string | null>(null)
    const [reloading, setReloading] = useState(false)
    const [clientToken, setClientToken] = useState("")

    const data: ExplorerSpecDto | undefined = spec.data
    const operationsByKey = useMemo(() => new Map((data?.spec.operations ?? []).map((op) => [op.key, op])), [data])
    const visibleKeys = useMemo(
        () => new Set(filterOperations(data?.spec.operations ?? [], search).map((op) => op.key)),
        [data, search],
    )

    const reload = async () => {
        setReloading(true)
        try {
            await spec.reload()
            toast.success("Especificação recarregada")
        } catch (error) {
            toast.error(integrationErrorMessage(error, "Não foi possível recarregar a especificação"))
        } finally {
            setReloading(false)
        }
    }

    const openSchema = (name: string) => {
        setTab("schemas")
        setSelectedSchema(name)
        setSearch("")
    }

    const blockedReason = data && !data.baseUrl ? "Sem URL base para executar" : undefined

    return (
        <Card>
            <CardHeader className="space-y-3">
                <div className="flex items-start gap-2">
                    <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={onBack}>
                        <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar ao formulário
                    </Button>
                    <div className="ml-auto">
                        <IconAction
                            label="Recarregar especificação"
                            icon={<RefreshCw className={cn("h-4 w-4", reloading && "animate-spin")} />}
                            onClick={() => void reload()}
                            disabled={reloading || spec.isLoading}
                        />
                    </div>
                </div>
                {data && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
                        <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold">
                            {data.spec.info.title}
                            {data.spec.info.version && <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">v{data.spec.info.version}</span>}
                            <span className="font-mono text-xs font-normal text-muted-foreground">OpenAPI {data.spec.openapi}</span>
                        </h2>
                        <p className="truncate font-mono text-[11px] text-muted-foreground" title={data.baseUrl ?? undefined}>
                            Base: {data.baseUrl ?? "—"}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {data.auth ? (
                                data.clientAuthorization ? (
                                    <>
                                        <KeyRound className="h-3.5 w-3.5 text-primary" /> {data.auth}
                                    </>
                                ) : data.authReady ? (
                                    <>
                                        <KeyRound className="h-3.5 w-3.5 text-emerald-600" /> Autenticação automática: {data.auth}
                                    </>
                                ) : (
                                    <>
                                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Credenciais incompletas na integração ({data.auth})
                                    </>
                                )
                            ) : (
                                <>
                                    <ShieldAlert className="h-3.5 w-3.5" /> Sem autenticação automática para esta integração
                                </>
                            )}
                        </p>
                    </motion.div>
                )}
                {data?.clientAuthorization && <ClientTokenField value={clientToken} onChange={setClientToken} />}
                {data && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={tab === "operations" ? "Buscar operação" : "Buscar schema"}
                                aria-label={tab === "operations" ? "Buscar operação" : "Buscar schema"}
                                className="h-9 pl-8"
                            />
                        </div>
                        <div className="relative inline-flex rounded-md bg-muted p-1" role="tablist">
                            {(
                                [
                                    ["operations", `Operações (${data.spec.operations.length})`],
                                    ["schemas", `Schemas (${Object.keys(data.spec.schemas).length})`],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === value}
                                    onClick={() => {
                                        setTab(value)
                                        setSearch("")
                                    }}
                                    className={cn(
                                        "relative z-10 rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                                        tab === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {/* Sem layoutId: projeção de layout nesta página já deixou a tela em branco. */}
                                    {tab === value && (
                                        <motion.span
                                            initial={{ opacity: 0, scale: 0.92 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute inset-0 -z-10 rounded-sm bg-background shadow-sm"
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                {spec.isLoading && <ExplorerSkeleton />}
                {spec.isError && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center"
                        role="alert"
                    >
                        <ShieldAlert className="h-6 w-6 text-destructive" />
                        <p className="text-sm text-destructive">{integrationErrorMessage(spec.error, "Não foi possível carregar a documentação")}</p>
                        <p className="break-all font-mono text-[11px] text-muted-foreground">{swaggerUrl}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void spec.refetch()}>
                            Tentar novamente
                        </Button>
                    </motion.div>
                )}
                {data && (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={tab}
                            initial={{ opacity: 0, x: tab === "operations" ? -12 : 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: tab === "operations" ? -12 : 12 }}
                            transition={{ duration: 0.18 }}
                        >
                            {tab === "operations" ? (
                                data.spec.tags.every((group) => group.operations.every((key) => !visibleKeys.has(key))) ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        {data.spec.operations.length === 0 ? "A especificação não declara operações." : "Nenhuma operação encontrada."}
                                    </p>
                                ) : (
                                    <motion.div initial="hidden" animate="visible" variants={listMotion} className="space-y-3">
                                        {data.spec.tags.map((group) => {
                                            const operations = group.operations
                                                .filter((key) => visibleKeys.has(key))
                                                .map((key) => operationsByKey.get(key))
                                                .filter((op): op is ExplorerOperation => Boolean(op))
                                            if (operations.length === 0) return null
                                            return (
                                                <TagGroup
                                                    // Busca ativa reabre os grupos com resultado.
                                                    key={`${group.name}-${search ? "s" : ""}`}
                                                    name={group.name}
                                                    description={group.description}
                                                    operations={operations}
                                                    openOperation={openOperation}
                                                    onToggleOperation={(key) => setOpenOperation((current) => (current === key ? null : key))}
                                                    defaultOpen={Boolean(search) || data.spec.tags.length <= 3}
                                                    renderPanel={(operation) => (
                                                        <OperationPanel
                                                            operation={operation}
                                                            schemas={data.spec.schemas}
                                                            integrationName={integrationName}
                                                            onOpenSchema={openSchema}
                                                            execute={(input) =>
                                                                execute.mutateAsync(
                                                                    data?.clientAuthorization && clientToken.trim()
                                                                        ? { ...input, headers: { ...input.headers, Authorization: `Bearer ${clientToken.trim()}` } }
                                                                        : input,
                                                                )
                                                            }
                                                            blockedReason={blockedReason}
                                                        />
                                                    )}
                                                />
                                            )
                                        })}
                                    </motion.div>
                                )
                            ) : (
                                <SchemasView schemas={data.spec.schemas} selected={selectedSchema} onSelect={setSelectedSchema} search={search} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                )}
            </CardContent>
        </Card>
    )
}
