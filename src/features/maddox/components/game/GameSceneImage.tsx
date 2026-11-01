"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ImageOff, Paintbrush } from "lucide-react"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import type { MaddoxGameSceneImageDto } from "../../game-types"

/** Proporção do placeholder: a mesma das imagens da aba (16:9 é a padrão; a imagem pronta usa a própria). */
const PLACEHOLDER_ASPECT = "16 / 9"

/**
 * Imagem da cena (Maddox 10) dentro da bolha do Maddox ou abaixo do card de fim de combate: placeholder animado enquanto o
 * Maddox pinta, a imagem com a legenda (clique amplia) quando fica pronta e uma linha discreta quando falha.
 */
export function GameSceneImage({ image, color }: { image: MaddoxGameSceneImageDto; color: string }) {
    const reduceMotion = useReducedMotion() ?? false
    const [open, setOpen] = useState(false)
    const caption = image.caption.trim()
    if (image.status === "failed") {
        return (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/50" data-testid="scene-image" data-status="failed">
                <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden /> {image.error ?? "Não foi possível gerar a imagem desta cena."}
            </p>
        )
    }
    if (image.status !== "done" || !image.url) {
        return (
            <div
                className="relative mt-2 flex w-full items-center justify-center overflow-hidden rounded-lg border bg-white/[0.03]"
                style={{ aspectRatio: PLACEHOLDER_ASPECT, borderColor: `${color}40` }}
                role="status"
                data-testid="scene-image"
                data-status={image.status}
            >
                {!reduceMotion && (
                    <motion.span
                        aria-hidden
                        className="absolute inset-y-0 -left-1/2 w-1/2"
                        style={{ background: `linear-gradient(90deg, transparent, ${color}26, transparent)` }}
                        animate={{ x: ["0%", "400%"] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                )}
                <span className="relative flex items-center gap-1.5 text-xs text-white/70">
                    <Paintbrush className="h-3.5 w-3.5" style={{ color }} aria-hidden /> O Maddox está pintando a cena…
                </span>
            </div>
        )
    }
    const alt = caption || image.situationLabel || "Imagem da cena"
    return (
        <figure className="mt-2 space-y-1" data-testid="scene-image" data-status="done">
            <button type="button" className="block w-full overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ borderColor: `${color}40` }} onClick={() => setOpen(true)} aria-label={`Ampliar: ${alt}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem do storage pelo proxy do app */}
                <img src={image.url} alt={alt} className="h-auto w-full object-cover" loading="lazy" />
            </button>
            {(caption || image.situationLabel) && (
                <figcaption className="text-xs text-white/60">
                    {caption}
                    {image.situationLabel && <span className="text-white/40">{caption ? " · " : ""}{image.situationLabel}</span>}
                </figcaption>
            )}
            <GlassModal open={open} onOpenChange={setOpen}>
                <GlassModalContent size="full">
                    <GlassModalHeader>
                        <GlassModalTitle>{caption || "Cena"}</GlassModalTitle>
                        <GlassModalDescription>{image.situationLabel ?? "Imagem pedida pelo dono da mesa"}</GlassModalDescription>
                    </GlassModalHeader>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagem do storage pelo proxy do app */}
                    <img src={image.url} alt={alt} className="h-auto max-h-[75vh] w-full rounded-lg object-contain" data-testid="scene-image-full" />
                </GlassModalContent>
            </GlassModal>
        </figure>
    )
}
