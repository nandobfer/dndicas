"use client"

import { useCallback, useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Eye, X } from "lucide-react"
import { useViewAs } from "@nandobfer/perfix/react"

/** Altura atual da faixa, publicada no `<html>` para telas de altura fixa (ex.: chat em tela inteira) descontarem. */
export const VIEW_AS_BANNER_HEIGHT_VAR = "--view-as-banner-height"

/**
 * Publica a altura real da faixa em `VIEW_AS_BANNER_HEIGHT_VAR` enquanto ela existe (inclusive animando a entrada e a
 * saída); sem faixa, a variável sai e quem a usa cai no padrão `0px`.
 */
function useBannerHeightVar() {
    const observer = useRef<ResizeObserver | null>(null)
    const clear = useCallback(() => {
        observer.current?.disconnect()
        observer.current = null
        document.documentElement.style.removeProperty(VIEW_AS_BANNER_HEIGHT_VAR)
    }, [])
    useEffect(() => clear, [clear])
    return useCallback(
        (element: HTMLDivElement | null) => {
            clear()
            if (!element) return
            const publish = () => document.documentElement.style.setProperty(VIEW_AS_BANNER_HEIGHT_VAR, `${Math.round(element.getBoundingClientRect().height)}px`)
            publish()
            if (typeof ResizeObserver === "undefined") return
            observer.current = new ResizeObserver(publish)
            observer.current.observe(element)
        },
        [clear],
    )
}

/**
 * Faixa fixa enquanto a aba simula outro perfil/usuário: sem ela, telas em leitura e botões
 * ocultos pareceriam perda de acesso. É também a saída sempre visível.
 */
export function ViewAsBanner() {
    const reduceMotion = useReducedMotion()
    const { state, stop } = useViewAs()
    const bannerRef = useBannerHeightVar()

    return (
        <AnimatePresence initial={false}>
            {state && (
                <motion.div
                    key="view-as-banner"
                    ref={bannerRef}
                    role="status"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                    className="shrink-0 overflow-hidden border-b border-amber-300 bg-amber-50 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5">
                        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">
                            Visualizando como <strong className="font-semibold">{state.label.alvo}</strong>.{" "}
                            {state.viewAs.tipo === "usuario"
                                ? "Você está agindo como este usuário; a auditoria registra você como responsável real."
                                : "As permissões são as do perfil; suas ações continuam registradas no seu nome."}
                        </span>
                        <button
                            type="button"
                            onClick={stop}
                            className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400 px-2 py-0.5 font-semibold transition-colors hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
                        >
                            <X className="h-3 w-3" aria-hidden />
                            Sair da simulação
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
