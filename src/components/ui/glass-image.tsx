/**
 * @fileoverview Glass-style image component with paper texture and hover effects.
 * Used across various entity previews (Classes, Spells, Races, Items, Backgrounds).
 */

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { Expand, X } from "lucide-react";
import { cn } from "@/core/utils";

type ClosableInteractionEvent = {
    preventDefault: () => void
    stopPropagation: () => void
}

interface GlassImageProps {
    /** Image source URL */
    src: string;
    /** Image alt text */
    alt: string;
    /** Container class name */
    className?: string;
    /** Image class name */
    imageClassName?: string;
    /** Optional overlay gradient */
    showOverlay?: boolean;
    /** Enables click-to-expand lightbox behavior */
    enableExpand?: boolean;
    /** Accessible label for the expanded view trigger */
    expandLabel?: string;
    /** Additional classes for the expanded dialog frame */
    dialogClassName?: string;
    /** Optional custom trigger renderer for the lightbox */
    renderTrigger?: (props: { open: () => void; label: string; isOpen: boolean }) => React.ReactNode;
    /** Optional classes for the default expandable trigger wrapper */
    triggerClassName?: string;
}

const imageTransition: Transition = {
    type: "spring",
    stiffness: 220,
    damping: 24,
    mass: 0.9,
};

/**
 * GlassImage Component
 * 
 * Standardized image container for entity previews with a paper texture background,
 * hover zoom effect, and optional gradient overlay.
 */
export function GlassImage({ 
    src, 
    alt, 
    className, 
    imageClassName,
    showOverlay = true,
    enableExpand = true,
    expandLabel,
    dialogClassName,
    renderTrigger,
    triggerClassName,
}: GlassImageProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const reactId = React.useId();
    const layoutId = React.useMemo(() => `glass-image-${reactId.replace(/:/g, "")}`, [reactId]);

    if (!src) return null;

    const triggerLabel = expandLabel || `Abrir imagem ampliada de ${alt}`;
    const openDialog = () => {
        setIsOpen(true);
    };
    const closeDialog = (event?: ClosableInteractionEvent) => {
        event?.preventDefault();
        event?.stopPropagation();
        setIsOpen(false);
    };

    const triggerFrame = (
        <motion.div
            layoutId={`${layoutId}-frame`}
            transition={imageTransition}
            className={cn(
                "aspect-square rounded-xl bg-white/5 overflow-hidden shadow-2xl group/image relative bg-[image:var(--background-image-paper-texture)] bg-cover bg-center",
                enableExpand && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                className
            )}
        >
            <motion.img
                layoutId={`${layoutId}-image`}
                transition={imageTransition}
                src={src}
                alt={alt}
                className={cn(
                    "w-full h-full object-contain transition-transform duration-500 group-hover/image:scale-110 mix-blend-multiply",
                    imageClassName
                )}
            />
            {showOverlay && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
            )}
            {enableExpand && (
                <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/80 opacity-0 translate-y-1 transition-all duration-300 group-hover/image:translate-y-0 group-hover/image:opacity-100 group-focus-visible/image:translate-y-0 group-focus-visible/image:opacity-100">
                    <Expand className="h-3 w-3" />
                    <span className="hidden sm:inline">Ampliar</span>
                </div>
            )}
        </motion.div>
    );

    if (!enableExpand) {
        return triggerFrame;
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            openDialog();
        }
    };

    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
            {renderTrigger ? (
                renderTrigger({ open: openDialog, label: triggerLabel, isOpen })
            ) : (
                <motion.div
                    role="button"
                    tabIndex={0}
                    aria-label={triggerLabel}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    className={cn("group/image block", triggerClassName)}
                    onClick={(event) => {
                        event.stopPropagation();
                        openDialog();
                    }}
                    onKeyDown={handleKeyDown}
                >
                    {triggerFrame}
                </motion.div>
            )}

            <AnimatePresence>
                {isOpen && (
                    <DialogPrimitive.Portal forceMount>
                        <DialogPrimitive.Overlay asChild>
                            <motion.div
                                className="fixed inset-0 z-50 bg-black/82 backdrop-blur-xl"
                                onClick={closeDialog}
                                onPointerDown={(event) => event.stopPropagation()}
                                onPointerUp={(event) => event.stopPropagation()}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                            />
                        </DialogPrimitive.Overlay>
                        <DialogPrimitive.Content
                            className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8 focus:outline-none"
                            onEscapeKeyDown={closeDialog}
                            onPointerDownOutside={(event) => event.preventDefault()}
                        >
                            <motion.div
                                className="flex h-full w-full items-center justify-center"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                                onPointerUp={(event) => event.stopPropagation()}
                                onMouseUp={(event) => event.stopPropagation()}
                                onTouchEnd={(event) => event.stopPropagation()}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                            >
                                <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
                                <DialogPrimitive.Description className="sr-only">
                                    Visualização ampliada da imagem.
                                </DialogPrimitive.Description>

                                <div className="relative flex w-full max-w-6xl items-center justify-center">
                                    <motion.div
                                        layoutId={`${layoutId}-frame`}
                                        transition={imageTransition}
                                        className={cn(
                                            "relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(0,0,0,0.55)] bg-[image:var(--background-image-paper-texture)] bg-cover bg-center",
                                            dialogClassName
                                        )}
                                    >
                                        <motion.img
                                            layoutId={`${layoutId}-image`}
                                            transition={imageTransition}
                                            src={src}
                                            alt={alt}
                                            className="max-h-[82vh] w-full object-contain mix-blend-normal"
                                        />
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-5 pb-5 pt-12">
                                            <p className="text-sm font-medium text-white/90 truncate">{alt}</p>
                                        </div>
                                    </motion.div>

                                    <button
                                        type="button"
                                        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 transition hover:bg-black/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                                        aria-label="Fechar visualização ampliada"
                                        onClick={closeDialog}
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onPointerUp={(event) => event.stopPropagation()}
                                        onMouseUp={(event) => event.stopPropagation()}
                                        onTouchEnd={(event) => event.stopPropagation()}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </motion.div>
                        </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                )}
            </AnimatePresence>
        </DialogPrimitive.Root>
    );
}
