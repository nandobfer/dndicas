"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeSchemaType, resolveSchema } from "../../openapi/examples"
import type { NormalizedSpec, SchemaNode } from "../../openapi/types"

interface SchemaTreeProps {
    node: SchemaNode | undefined
    schemas: NormalizedSpec["schemas"]
    /** Navega para um schema nomeado (aba Schemas). */
    onOpenRef?: (name: string) => void
    /** Profundidade inicial expandida. */
    defaultDepth?: number
}

/** Filhos navegáveis de um nó: propriedades de objeto, item de array ou alternativas. */
function childrenOf(node: SchemaNode | undefined): { label: string; node: SchemaNode; required?: boolean }[] {
    if (!node) return []
    if (node.properties) {
        const required = new Set(node.required ?? [])
        return Object.entries(node.properties).map(([key, child]) => ({ label: key, node: child, required: required.has(key) }))
    }
    if (node.items) return [{ label: "[item]", node: node.items }]
    const alternatives = node.oneOf ?? node.anyOf
    if (alternatives) return alternatives.map((alt, index) => ({ label: `${node.oneOf ? "oneOf" : "anyOf"} ${index + 1}`, node: alt }))
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
        return [{ label: "[chave]", node: node.additionalProperties }]
    }
    return []
}

function Constraints({ node }: { node: SchemaNode }) {
    const parts: string[] = []
    if (node.enum) parts.push(`enum: ${node.enum.map((v) => JSON.stringify(v)).join(", ")}`)
    if (node.default !== undefined) parts.push(`padrão: ${JSON.stringify(node.default)}`)
    if (node.minimum !== undefined) parts.push(`mín. ${node.minimum}`)
    if (node.maximum !== undefined) parts.push(`máx. ${node.maximum}`)
    if (node.minLength !== undefined) parts.push(`tam. mín. ${node.minLength}`)
    if (node.maxLength !== undefined) parts.push(`tam. máx. ${node.maxLength}`)
    if (node.pattern) parts.push(`padrão regex: ${node.pattern}`)
    if (parts.length === 0) return null
    return <p className="font-mono text-[11px] text-muted-foreground">{parts.join(" · ")}</p>
}

function SchemaRow({
    label,
    node,
    required,
    schemas,
    onOpenRef,
    depth,
    defaultDepth,
    trail,
}: {
    label: string
    node: SchemaNode
    required?: boolean
    schemas: NormalizedSpec["schemas"]
    onOpenRef?: (name: string) => void
    depth: number
    defaultDepth: number
    trail: ReadonlySet<string>
}) {
    const resolved = resolveSchema(node, schemas)
    const circular = Boolean(node.ref && trail.has(node.ref)) || node.circular
    const kids = circular ? [] : childrenOf(resolved)
    const [open, setOpen] = useState(depth < defaultDepth)
    const nextTrail = node.ref ? new Set(trail).add(node.ref) : trail

    return (
        <li>
            <div className="flex items-start gap-1.5 py-1">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    disabled={kids.length === 0}
                    className={cn("mt-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted", kids.length === 0 && "invisible")}
                    aria-label={open ? `Recolher ${label}` : `Expandir ${label}`}
                    aria-expanded={open}
                >
                    <motion.span className="flex" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronRight className="h-3.5 w-3.5" />
                    </motion.span>
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono text-xs font-medium">{label}</span>
                        {required && <span className="text-[10px] font-semibold uppercase text-destructive">obrigatório</span>}
                        {node.ref && onOpenRef ? (
                            <button type="button" onClick={() => onOpenRef(node.ref!)} className="font-mono text-xs text-primary hover:underline">
                                {node.ref}
                            </button>
                        ) : (
                            <span className="font-mono text-xs text-muted-foreground">{describeSchemaType(resolved ?? node)}</span>
                        )}
                        {resolved?.readOnly && <span className="text-[10px] uppercase text-muted-foreground">somente leitura</span>}
                        {resolved?.deprecated && <span className="text-[10px] uppercase text-amber-600">obsoleto</span>}
                        {circular && <span className="text-[10px] uppercase text-muted-foreground">referência circular</span>}
                    </div>
                    {resolved?.description && <p className="text-xs text-muted-foreground">{resolved.description}</p>}
                    {resolved && <Constraints node={resolved} />}
                </div>
            </div>
            <AnimatePresence initial={false}>
                {open && kids.length > 0 && (
                    <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="ml-3 overflow-hidden border-l border-border pl-2"
                    >
                        {kids.map((kid) => (
                            <SchemaRow
                                key={kid.label}
                                {...kid}
                                schemas={schemas}
                                onOpenRef={onOpenRef}
                                depth={depth + 1}
                                defaultDepth={defaultDepth}
                                trail={nextTrail}
                            />
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </li>
    )
}

/** Árvore de um schema (tipo, obrigatórios, enum, formato, descrição), expandindo `$ref` sob demanda. */
export function SchemaTree({ node, schemas, onOpenRef, defaultDepth = 1 }: SchemaTreeProps) {
    if (!node) return <p className="text-xs text-muted-foreground">Sem schema declarado.</p>
    const resolved = resolveSchema(node, schemas)
    const kids = childrenOf(resolved)
    const trail = new Set(node.ref ? [node.ref] : [])
    if (kids.length === 0) {
        return (
            <div className="space-y-0.5">
                <span className="font-mono text-xs text-muted-foreground">{describeSchemaType(resolved ?? node)}</span>
                {resolved?.description && <p className="text-xs text-muted-foreground">{resolved.description}</p>}
                {resolved && <Constraints node={resolved} />}
            </div>
        )
    }
    return (
        <ul className="text-sm">
            {kids.map((kid) => (
                <SchemaRow key={kid.label} {...kid} schemas={schemas} onOpenRef={onOpenRef} depth={0} defaultDepth={defaultDepth} trail={trail} />
            ))}
        </ul>
    )
}
