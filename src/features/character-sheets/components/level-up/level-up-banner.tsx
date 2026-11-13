"use client"

import { useEffect, useRef } from "react"
import { TrendingUp } from "lucide-react"

/**
 * Aviso persistente "Subir de nível" (DND-56), na ficha e na mesa do Maddox: fica até o jogador concluir a subida.
 * Fechar o wizard não remove o aviso nem segura o jogo.
 */
export function LevelUpBanner({ toLevel, text, onOpen, actionLabel = "Subir de nível" }: { toLevel: number; text?: string; onOpen: () => void; actionLabel?: string }) {
    return (
        <div role="status" data-testid="level-up-banner" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-300" aria-hidden />
                {text ?? `Você pode subir para o nível ${toLevel}.`}
            </p>
            <button type="button" onClick={onOpen} className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-emerald-50 transition-colors hover:bg-emerald-500/30">
                {actionLabel}
            </button>
        </div>
    )
}

const SEEN_PREFIX = "dndicas:level-up-opened:"

/**
 * O wizard abre sozinho uma vez por subida pendente em cada lugar (`scope`: a ficha ou a mesa), nesta sessão do
 * navegador; depois, só pelo aviso.
 */
export function useAutoOpenLevelUp(stepId: string | null, open: () => void, scope = "sheet") {
    const openRef = useRef(open)
    useEffect(() => {
        openRef.current = open
    })
    useEffect(() => {
        if (!stepId || typeof window === "undefined") return
        const key = `${SEEN_PREFIX}${scope}:${stepId}`
        try {
            if (window.sessionStorage.getItem(key)) return
            window.sessionStorage.setItem(key, "1")
        } catch {
            // sessionStorage indisponível: abre mesmo assim
        }
        openRef.current()
    }, [stepId, scope])
}
