"use client"

import { motion } from "framer-motion"
import { Bot, Sparkles } from "lucide-react"
import { listContainer, listItem } from "@/components/motion/presets"
import { OPEX_SUGGESTIONS } from "../../constants"
import { useOpexScope } from "../OpexScopeProvider"

/** Estado vazio do chat: o robô, o que o agente faz e sugestões para começar. */
export function OpexEmptyChat({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
    const { role } = useOpexScope()
    // Visitantes não têm fichas: a sugestão das fichas fica para quem está logado.
    const suggestions = role === "anonymous" ? OPEX_SUGGESTIONS.filter((item) => !item.includes("fichas")) : OPEX_SUGGESTIONS
    const description =
        role === "anonymous"
            ? "Respondo dúvidas sobre magias, classes, raças, itens, monstros e regras de D&D 5e e explico como usar o DnDicas. Entre na sua conta para eu também cuidar das suas fichas e NPCs."
            : role === "admin"
              ? "Consulto o catálogo e a documentação, cuido das suas fichas e NPCs, agendo jobs e configuro integrações, agentes de IA e memórias. Peça em linguagem natural."
              : "Respondo dúvidas sobre o catálogo de D&D 5e e o DnDicas, cuido das suas fichas e NPCs e agendo lembretes. Peça em linguagem natural."
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
            <motion.span
                initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_28px_-6px_hsl(var(--primary))] ring-1 ring-primary/40"
                aria-hidden
            >
                <Bot className="h-7 w-7" />
            </motion.span>
            <div className="max-w-sm space-y-1">
                <p className="text-sm font-semibold">Como posso ajudar?</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <motion.ul variants={listContainer} initial="hidden" animate="visible" className="flex w-full max-w-md flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                    <motion.li key={suggestion} variants={listItem}>
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onPick(suggestion)}
                            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                        >
                            <Sparkles className="h-3 w-3 text-primary" aria-hidden />
                            {suggestion}
                        </button>
                    </motion.li>
                ))}
            </motion.ul>
        </div>
    )
}
