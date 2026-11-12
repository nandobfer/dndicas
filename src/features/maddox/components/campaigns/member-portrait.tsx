"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { motion } from "framer-motion"
import { ImageOff, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/opex/avatar"
import { GlassBackdrop } from "@/components/ui/glass-backdrop"
import { cn } from "@/lib/utils"
import { MADDOX_PORTRAIT_HOVER_CLOSE_MS, MADDOX_PORTRAIT_HOVER_OPEN_MS, PORTRAIT_HOVER_IDLE, portraitHoverElapsed, portraitHoverPointer, type PortraitHoverState, type PortraitHoverZone } from "../../portrait-hover"

/** Iniciais do nome (até duas), ou "?" sem nome. */
export const portraitInitials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?"

export const NO_PORTRAIT_LABEL = "Sem retrato"

export interface MemberPortraitProps {
    name: string
    imageUrl: string | null
    color?: string
    /** Quem é (papel, situação do NPC): aparece no popover e no retrato grande. */
    context?: string | null
}

const stop = (event: SyntheticEvent) => event.stopPropagation()

/** Avatar estático (o de sempre): retrato, senão as iniciais. */
export function StaticMemberAvatar({ name, imageUrl, color, className }: MemberPortraitProps & { className?: string }) {
    return (
        <Avatar className={cn("h-8 w-8 border-2 border-background", className)} style={color ? { borderColor: color } : undefined}>
            {imageUrl && <AvatarImage src={imageUrl} alt={name} className="object-cover" />}
            <AvatarFallback className="bg-white/10 text-[11px] text-white/80">{portraitInitials(name)}</AvatarFallback>
        </Avatar>
    )
}

/** Imagem do retrato que cai nas iniciais quando não existe ou não carrega. */
function PortraitArt({ name, imageUrl, color, fit, initialsClassName }: MemberPortraitProps & { fit: "cover" | "contain"; initialsClassName: string }) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const url = imageUrl && imageUrl !== failedUrl ? imageUrl : null
    if (url) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={url} alt={name} onError={() => setFailedUrl(url)} className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")} data-testid="member-portrait-image" />
    }
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white/[0.06]" data-testid="member-portrait-initials">
            <span className={cn("font-semibold tracking-wide", initialsClassName)} style={{ color: color ?? "rgba(255,255,255,0.85)" }}>
                {portraitInitials(name)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-white/55">
                <ImageOff className="h-3 w-3" aria-hidden /> {NO_PORTRAIT_LABEL}
            </span>
        </div>
    )
}

function PortraitCaption({ name, context, color, large }: { name: string; context?: string | null; color?: string; large?: boolean }) {
    return (
        <div className="min-w-0 space-y-0.5 text-center">
            <p className={cn("break-words font-semibold text-white", large ? "text-lg" : "text-sm")}>{name}</p>
            {context && (
                <p className={cn("break-words", large ? "text-sm" : "text-xs")} style={{ color: color ?? "rgba(255,255,255,0.6)" }} data-testid="member-portrait-context">
                    {context}
                </p>
            )}
        </div>
    )
}

/** Abrir e fechar o popover no hover, com os dois sinais de presença (avatar e popover). */
function usePortraitHover(disabled: boolean) {
    const [open, setOpen] = useState(false)
    const state = useRef<PortraitHoverState>(PORTRAIT_HOVER_IDLE)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearTimer = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
    }, [])

    const close = useCallback(() => {
        clearTimer()
        state.current = PORTRAIT_HOVER_IDLE
        setOpen(false)
    }, [clearTimer])

    const pointer = useCallback(
        (zone: PortraitHoverZone, inside: boolean) => (event: PointerEvent) => {
            // Só o mouse tem hover: no toque, o clique vai direto para o retrato grande.
            if (event.pointerType !== "mouse" || disabled) return
            const result = portraitHoverPointer(state.current, zone, inside)
            state.current = result.state
            if (!result.timer) return
            clearTimer()
            if (result.timer === "cancel") return
            const kind = result.timer
            timer.current = setTimeout(
                () => {
                    timer.current = null
                    state.current = portraitHoverElapsed(state.current, kind)
                    setOpen(state.current.open)
                },
                kind === "open" ? MADDOX_PORTRAIT_HOVER_OPEN_MS : MADDOX_PORTRAIT_HOVER_CLOSE_MS,
            )
        },
        [clearTimer, disabled],
    )

    useEffect(() => clearTimer, [clearTimer])

    // Some ao rolar (qualquer contêiner): o popover não fica solto longe do avatar.
    useEffect(() => {
        if (!open) return
        window.addEventListener("scroll", close, { capture: true, passive: true })
        return () => window.removeEventListener("scroll", close, { capture: true })
    }, [open, close])

    return {
        open,
        close,
        trigger: { onPointerEnter: pointer("trigger", true), onPointerLeave: pointer("trigger", false) },
        panel: { onPointerEnter: pointer("panel", true), onPointerLeave: pointer("panel", false) },
    }
}

/**
 * Avatar interativo do Maddox (DND-55): o hover mostra o popover expandido e o clique (ou Enter/Espaço, ou o toque)
 * abre o retrato grande. É um botão nativo: nunca o coloque dentro de link ou de outro botão.
 */
export function MemberPortraitAvatar({ name, imageUrl, color, context, className }: MemberPortraitProps & { className?: string }) {
    const [viewing, setViewing] = useState(false)
    const hover = usePortraitHover(viewing)

    const openViewer = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        hover.close()
        setViewing(true)
    }

    const border: CSSProperties | undefined = color ? { borderColor: color } : undefined

    return (
        <>
            <PopoverPrimitive.Root open={hover.open} onOpenChange={(next) => !next && hover.close()}>
                <PopoverPrimitive.Anchor asChild>
                    <button
                        type="button"
                        aria-label={`Ver retrato de ${name}`}
                        aria-haspopup="dialog"
                        data-testid="member-avatar"
                        className={cn(
                            "relative inline-flex h-8 w-8 shrink-0 cursor-zoom-in rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                            className,
                        )}
                        onClick={openViewer}
                        {...hover.trigger}
                    >
                        <StaticMemberAvatar name={name} imageUrl={imageUrl} color={color} className="h-full w-full" />
                    </button>
                </PopoverPrimitive.Anchor>
                {hover.open && (
                    <PopoverPrimitive.Portal>
                        <PopoverPrimitive.Content
                            side="right"
                            align="start"
                            sideOffset={8}
                            collisionPadding={8}
                            hideWhenDetached
                            onOpenAutoFocus={(event) => event.preventDefault()}
                            onCloseAutoFocus={(event) => event.preventDefault()}
                            onClick={stop}
                            onPointerDown={stop}
                            className="z-[100] w-[min(14rem,calc(100vw-16px))] outline-none"
                            data-testid="member-portrait-popover"
                            {...hover.panel}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                                className="relative overflow-hidden rounded-xl border border-white/10 p-3 shadow-2xl shadow-black/50 backdrop-blur-md"
                            >
                                <GlassBackdrop />
                                <div className="relative z-10 flex flex-col items-center gap-2.5">
                                    <div className="aspect-square w-full max-w-44 overflow-hidden rounded-xl border-2 border-white/10" style={border}>
                                        <PortraitArt name={name} imageUrl={imageUrl} color={color} fit="cover" initialsClassName="text-4xl" />
                                    </div>
                                    <PortraitCaption name={name} context={context} color={color} />
                                </div>
                            </motion.div>
                        </PopoverPrimitive.Content>
                    </PopoverPrimitive.Portal>
                )}
            </PopoverPrimitive.Root>
            {viewing && <MemberPortraitViewer name={name} imageUrl={imageUrl} color={color} context={context} onClose={() => setViewing(false)} />}
        </>
    )
}

/** Retrato grande, quase em tela cheia: X, Esc, Enter e clique fora fecham; o foco fica preso no diálogo. */
export function MemberPortraitViewer({ name, imageUrl, color, context, onClose }: MemberPortraitProps & { onClose: () => void }) {
    return (
        <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
            <DialogPrimitive.Portal>
                {/* Eventos do portal sobem pela árvore do React até o pai do avatar: param aqui. */}
                <div onClick={stop} onPointerDown={stop} onKeyDown={stop}>
                    <DialogPrimitive.Overlay asChild>
                        <motion.div className="fixed inset-0 z-[110] bg-black/82 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
                    </DialogPrimitive.Overlay>
                    <DialogPrimitive.Content
                        className="fixed inset-0 z-[120] flex items-center justify-center p-4 focus:outline-none sm:p-8"
                        data-testid="member-portrait-viewer"
                        onClick={(event) => event.target === event.currentTarget && onClose()}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return
                            event.preventDefault()
                            onClose()
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="relative flex w-[min(90vw,90vh)] flex-col items-center gap-3"
                        >
                            <DialogPrimitive.Title className="sr-only">Retrato de {name}</DialogPrimitive.Title>
                            <DialogPrimitive.Description className="sr-only">{context ? `${name}, ${context}.` : `Retrato ampliado de ${name}.`}</DialogPrimitive.Description>
                            <div
                                className="relative aspect-square max-h-[78vh] w-full overflow-hidden rounded-[28px] border-2 border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
                                style={color ? { borderColor: color } : undefined}
                            >
                                <PortraitArt name={name} imageUrl={imageUrl} color={color} fit="contain" initialsClassName="text-[clamp(3rem,18vmin,9rem)]" />
                            </div>
                            <PortraitCaption name={name} context={context} color={color} large />
                            <DialogPrimitive.Close
                                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 transition hover:bg-black/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                aria-label="Fechar retrato"
                            >
                                <X className="h-4 w-4" aria-hidden />
                            </DialogPrimitive.Close>
                        </motion.div>
                    </DialogPrimitive.Content>
                </div>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

