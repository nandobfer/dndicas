"use client"

import { createElement, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { Download, X } from "lucide-react"
import { VisuallyHidden } from "@/components/ui/opex/visually-hidden"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import type { OpexFileDto } from "../../types"
import { useOpexScope } from "../OpexScopeProvider"
import { OPEX_FILE_ICONS } from "./file-icons"

/** Arquivos de uma mensagem do usuário: imagens em miniatura (ampliam ao clicar) e os demais para baixar. */
export function OpexMessageFiles({ files, align = "end" }: { files: OpexFileDto[]; align?: "start" | "end" }) {
    const { apiBase } = useOpexScope()
    const [zoomed, setZoomed] = useState<OpexFileDto | null>(null)
    // Conteúdo pela rota autenticada do agente (só o dono da sessão).
    const fileHref = (id: string, download = false) => withBasePath(`/api${apiBase}/files/${id}${download ? "?download=1" : ""}`)
    if (!files.length) return null
    const images = files.filter((file) => file.kind === "image")
    const others = files.filter((file) => file.kind !== "image")

    return (
        <div className={cn("flex max-w-[85%] flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
            {images.length > 0 && (
                <div className={cn("flex flex-wrap gap-1.5", align === "end" && "justify-end")}>
                    {images.map((file) => (
                        <motion.button
                            key={file.id}
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setZoomed(file)}
                            aria-label={`Ampliar ${file.name}`}
                            className="overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- conteúdo autenticado do app */}
                            <img src={fileHref(file.id)} alt={file.name} loading="lazy" className="h-24 w-24 object-cover" />
                        </motion.button>
                    ))}
                </div>
            )}
            {others.map((file) => (
                <a
                    key={file.id}
                    href={fileHref(file.id, true)}
                    download={file.name}
                    className="group flex max-w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs transition-colors hover:border-primary/50"
                >
                    {createElement(OPEX_FILE_ICONS[file.kind], { className: "h-4 w-4 shrink-0 text-primary", "aria-hidden": true })}
                    <span className="min-w-0 truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </a>
            ))}

            <DialogPrimitive.Root open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
                <AnimatePresence>
                    {zoomed && (
                        <DialogPrimitive.Portal forceMount>
                            <DialogPrimitive.Overlay forceMount asChild>
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm" />
                            </DialogPrimitive.Overlay>
                            <DialogPrimitive.Content forceMount asChild aria-describedby={undefined}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.94 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.94 }}
                                    transition={{ duration: 0.18 }}
                                    className="fixed inset-6 z-[60] flex flex-col items-center justify-center gap-3"
                                >
                                    <VisuallyHidden>
                                        <DialogPrimitive.Title>{zoomed.name}</DialogPrimitive.Title>
                                    </VisuallyHidden>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- conteúdo autenticado do app */}
                                    <img src={fileHref(zoomed.id)} alt={zoomed.name} className="max-h-[85%] max-w-full rounded-lg border object-contain shadow-2xl" />
                                    <div className="flex items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs shadow-lg">
                                        <span className="max-w-[40vw] truncate">{zoomed.name}</span>
                                        <a href={fileHref(zoomed.id, true)} download={zoomed.name} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Baixar">
                                            <Download className="h-3.5 w-3.5" aria-hidden />
                                        </a>
                                        <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar">
                                            <X className="h-3.5 w-3.5" aria-hidden />
                                        </DialogPrimitive.Close>
                                    </div>
                                </motion.div>
                            </DialogPrimitive.Content>
                        </DialogPrimitive.Portal>
                    )}
                </AnimatePresence>
            </DialogPrimitive.Root>
        </div>
    )
}
