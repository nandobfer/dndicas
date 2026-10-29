"use client"

import { createElement } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, RotateCw, X } from "lucide-react"
import { formatAttachmentSize } from "@/lib/attachments"
import { cn } from "@/lib/utils"
import type { OpexUploadItem } from "../../hooks/useOpexUploads"
import { OPEX_FILE_ICONS } from "./file-icons"

interface OpexAttachmentChipsProps {
    items: OpexUploadItem[]
    onRetry: (localId: string) => void
    onRemove: (localId: string) => void
}

/** Arquivos da próxima mensagem: miniatura ou ícone, progresso real do PUT no storage, erro com nova tentativa. */
export function OpexAttachmentChips({ items, onRetry, onRemove }: OpexAttachmentChipsProps) {
    return (
        <AnimatePresence initial={false}>
            {items.length > 0 && (
                <motion.ul
                    key="chips"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-wrap gap-2 overflow-hidden pb-2"
                    aria-label="Arquivos anexados"
                >
                    <AnimatePresence initial={false}>
                        {items.map((item) => (
                            <motion.li
                                key={item.localId}
                                layout="position"
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
                                transition={{ duration: 0.18 }}
                                className={cn(
                                    "relative flex w-52 items-center gap-2 overflow-hidden rounded-lg border bg-card py-1.5 pl-1.5 pr-7 text-xs",
                                    item.status === "error" && "border-destructive/50 bg-destructive/5",
                                )}
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                    {item.previewUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob:)
                                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        createElement(OPEX_FILE_ICONS[item.kind], { className: "h-4 w-4 text-primary", "aria-hidden": true })
                                    )}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium" title={item.name}>
                                        {item.name}
                                    </span>
                                    {item.status === "error" ? (
                                        <span className="flex items-center gap-1 text-[10px] text-destructive" role="alert">
                                            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                            <span className="truncate" title={item.error ?? undefined}>
                                                {item.error}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="block text-[10px] text-muted-foreground">{item.status === "uploading" ? `Enviando… ${item.progress}%` : item.status === "confirming" ? "Confirmando…" : formatAttachmentSize(item.size)}</span>
                                    )}
                                </span>
                                {item.status === "error" && (
                                    <button type="button" onClick={() => onRetry(item.localId)} aria-label={`Enviar ${item.name} de novo`} title="Tentar novamente" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                                        <RotateCw className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onRemove(item.localId)}
                                    aria-label={`Remover ${item.name}`}
                                    className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                                <AnimatePresence>
                                    {(item.status === "uploading" || item.status === "confirming") && (
                                        <motion.span
                                            key="progress"
                                            className="absolute bottom-0 left-0 h-0.5 bg-primary"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${item.progress}%` }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            aria-hidden
                                        />
                                    )}
                                </AnimatePresence>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </motion.ul>
            )}
        </AnimatePresence>
    )
}
