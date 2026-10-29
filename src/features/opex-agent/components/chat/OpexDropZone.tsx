"use client"

import { useRef, useState, type DragEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Upload } from "lucide-react"

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

/** Área do chat que aceita arquivos arrastados (mostra o destino animado enquanto arrasta). */
export function OpexDropZone({ onFiles, disabled, children }: { onFiles: (files: File[]) => void; disabled?: boolean; children: ReactNode }) {
    const [dragging, setDragging] = useState(false)
    const depth = useRef(0)

    const reset = () => {
        depth.current = 0
        setDragging(false)
    }

    return (
        <div
            className="relative flex min-h-0 flex-1 flex-col"
            onDragEnter={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                depth.current++
                setDragging(true)
            }}
            onDragOver={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy"
            }}
            onDragLeave={(event) => {
                if (disabled || !hasFiles(event)) return
                depth.current = Math.max(0, depth.current - 1)
                if (depth.current === 0) setDragging(false)
            }}
            onDrop={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                reset()
                const files = Array.from(event.dataTransfer.files ?? [])
                if (files.length) onFiles(files)
            }}
        >
            {children}
            <AnimatePresence>
                {dragging && (
                    <motion.div
                        key="drop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/70 bg-primary/10 backdrop-blur-[2px]"
                    >
                        <motion.span initial={{ y: 6, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                            <Upload className="h-6 w-6" aria-hidden />
                        </motion.span>
                        <p className="text-sm font-medium">Solte para anexar à mensagem</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
