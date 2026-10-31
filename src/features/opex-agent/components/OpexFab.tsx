"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { VisuallyHidden } from "@/components/ui/opex/visually-hidden"
import { isOpexShortcut } from "../constants"
import { useOpexRealtime, useOpexSessions } from "../hooks/useOpexSessions"
import { useOpexJobNotifications } from "../hooks/useOpexJobs"
import { useOpexScope } from "./OpexScopeProvider"
import { OpexUploadsProvider } from "../hooks/useOpexUploads"
import { onOpenOpexSession } from "../open-session"
import { OpexPanel } from "./OpexPanel"

const LABEL = "Agente Opex"
const MOBILE_MAX = 768

function subscribeResize(callback: () => void) {
    window.addEventListener("resize", callback)
    return () => window.removeEventListener("resize", callback)
}

/** Tamanho da janela (para o painel do desktop e o modo celular). */
function useViewport(): { width: number; height: number } {
    const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1280)
    const height = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800)
    return { width, height }
}

/** O botão aparece com a situação carregada: com o agente fechado para visitantes, some para eles. */
export function useOpexFabEnabled() {
    const scope = useOpexScope()
    return Boolean(scope.status && (scope.role !== "anonymous" || scope.status.available))
}

const GLASS_STYLE = "bg-black/40 backdrop-blur-[4px]"

/**
 * Botão flutuante redondo do "Agente Opex" (para todos, inclusive visitantes, se liberado): abre o
 * chat num popover ancorado acima do botão (no celular, painel em tela cheia). Atalho Ctrl+Shift+O.
 * Mostra um ponto pulsando quando alguma sessão está respondendo ou espera confirmação.
 */
export function OpexFab() {
    // A fila de arquivos fica fora do popover: fechar o chat não perde os envios em andamento.
    return (
        <OpexUploadsProvider>
            <OpexFabContent />
        </OpexUploadsProvider>
    )
}

function OpexFabContent() {
    const enabled = useOpexFabEnabled()
    const [open, setOpen] = useState(false)
    const [maximized, setMaximized] = useState(false)
    const [focusSessionId, setFocusSessionId] = useState<string | null>(null)
    const reduceMotion = useReducedMotion() ?? false
    const viewport = useViewport()
    const mobile = viewport.width < MOBILE_MAX
    const sessions = useOpexSessions(enabled)
    useOpexRealtime(enabled)
    useOpexJobNotifications(enabled)
    const busy = (sessions.data ?? []).some((session) => session.status === "running" || session.status === "awaiting_confirmation")

    useEffect(() => {
        if (!enabled) return
        return onOpenOpexSession((sessionId) => {
            setFocusSessionId(sessionId)
            setOpen(true)
        })
    }, [enabled])

    useEffect(() => {
        if (!enabled) return
        const onKey = (event: KeyboardEvent) => {
            if (!isOpexShortcut(event)) return
            event.preventDefault()
            setOpen((value) => !value)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [enabled])

    if (!enabled) return null

    const trigger = (
        <motion.button
            type="button"
            aria-label={LABEL}
            title={`${LABEL} (Ctrl+Shift+O)`}
            aria-expanded={open}
            aria-haspopup="dialog"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="relative rounded-full bg-gradient-to-r from-primary/30 via-purple-500/20 to-primary/30 bg-[length:200%_auto] p-[1.5px] shadow-2xl animate-gradient focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            onClick={() => setOpen((value) => !value)}
        >
            <span className={cn("relative flex items-center justify-center rounded-full p-3.5 transition-colors hover:bg-slate-900/40", GLASS_STYLE, open && "bg-slate-900/60")}>
                <motion.span className="inline-flex" animate={open && !reduceMotion ? { rotate: [0, -12, 10, 0] } : { rotate: 0 }} transition={{ duration: 0.4 }}>
                    <Bot className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                </motion.span>
            </span>
            <AnimatePresence>
                {busy && (
                    <motion.span key="busy" data-testid="opex-fab-busy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-0.5 top-0.5 flex h-3 w-3" aria-hidden>
                        {!reduceMotion && <motion.span className="absolute inset-0 rounded-full bg-primary" animate={{ opacity: [0.7, 0], scale: [1, 2.2] }} transition={{ duration: 1.4, repeat: Infinity }} />}
                        <span className="relative h-3 w-3 rounded-full bg-primary ring-2 ring-black" />
                    </motion.span>
                )}
            </AnimatePresence>
            {busy && <span className="sr-only">: respondendo</span>}
        </motion.button>
    )

    if (mobile) {
        return (
            <div>
                <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                    <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
                    <AnimatePresence>
                        {open && (
                            <DialogPrimitive.Portal forceMount>
                                <DialogPrimitive.Content forceMount asChild aria-describedby={undefined} onOpenAutoFocus={(event) => event.preventDefault()}>
                                    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="fixed inset-0 z-[70] flex flex-col bg-popover text-popover-foreground">
                                        <VisuallyHidden>
                                            <DialogPrimitive.Title>{LABEL}</DialogPrimitive.Title>
                                        </VisuallyHidden>
                                        <OpexPanel maximized onClose={() => setOpen(false)} focusSessionId={focusSessionId} onFocused={() => setFocusSessionId(null)} />
                                    </motion.div>
                                </DialogPrimitive.Content>
                            </DialogPrimitive.Portal>
                        )}
                    </AnimatePresence>
                </DialogPrimitive.Root>
            </div>
        )
    }

    const width = maximized ? viewport.width - 48 : Math.min(720, viewport.width - 48)
    // Acima do botão (canto inferior direito): desconta o botão e o header fixo.
    const height = maximized ? viewport.height - 112 : Math.min(680, viewport.height - 160)

    return (
        <div>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
                <AnimatePresence>
                    {open && (
                        <PopoverPrimitive.Portal forceMount>
                            <PopoverPrimitive.Content forceMount asChild side="top" align="end" sideOffset={12} collisionPadding={12} onOpenAutoFocus={(event) => event.preventDefault()} aria-label={LABEL}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.92, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0, width, height }}
                                    exit={{ opacity: 0, scale: 0.94, y: 8, transition: { duration: 0.15 } }}
                                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                                    style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                                    className="z-[70] flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl shadow-primary/10"
                                >
                                    <OpexPanel
                                        maximized={maximized}
                                        onToggleMaximize={() => setMaximized((value) => !value)}
                                        onClose={() => setOpen(false)}
                                        focusSessionId={focusSessionId}
                                        onFocused={() => setFocusSessionId(null)}
                                    />
                                </motion.div>
                            </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                    )}
                </AnimatePresence>
            </PopoverPrimitive.Root>
        </div>
    )
}
