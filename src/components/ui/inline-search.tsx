"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, RefreshCw } from "lucide-react"
import { cn } from "@/core/utils"
import { useGlobalSearch } from "@/core/hooks/useGlobalSearch"
import { SearchInput } from "./search-input"
import { EntityList } from "@/features/rules/components/entity-list"
import { GlassCard } from "./glass-card"
import { useIsMobile } from "@/core/hooks/useMediaQuery"

const GLASS_STYLE = "bg-black/40 backdrop-blur-[4px]"

export function InlineSearch() {
    const isMobile = useIsMobile()
    const { query, setQuery, results, isLoading, isSearching, isFetchingNextPage, hasNextPage, loadMore } = useGlobalSearch()
    const [isFocused, setIsFocused] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const isExpanded = query.trim().length > 0 || isFocused

    // Keyboard shortcut to focus (Cmd/Ctrl + K)
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [])

    return (
        <div className="w-full space-y-4">
            <motion.div
                className={cn(
                    "relative p-[1.5px] rounded-2xl overflow-hidden shadow-2xl ",
                    "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 bg-[length:200%_auto] animate-gradient"
                )}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                <GlassCard className={cn("border-none rounded-2xl flex flex-col animate-none", GLASS_STYLE)}>
                    <div className="p-4 border-b border-white/5 flex items-center gap-3">
                        <SearchInput
                            ref={inputRef}
                            autoFocus={false}
                            value={query}
                            onChange={setQuery}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => {
                                // Delay blur to allow clicking results
                                setTimeout(() => setIsFocused(false), 200)
                            }}
                            isLoading={isLoading}
                            placeholder="Pesquisar em todo o sistema..."
                            className="focus-visible:ring-1 focus-visible:ring-blue-500/50 h-10"
                        />
                    </div>

                    <AnimatePresence mode="wait">
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="overflow-y-visible p-2 min-h-[100px]">
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        {isLoading || isSearching ? (
                                            <motion.div
                                                key="loading"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="h-48 flex flex-col items-center justify-center space-y-4"
                                            >
                                                <div className="relative">
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                        className="relative z-10"
                                                    >
                                                        <RefreshCw className="h-10 w-10 text-blue-400" />
                                                    </motion.div>
                                                    {/* Glow effect */}
                                                    <div className="absolute inset-0 blur-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 animate-pulse rounded-full" />
                                                </div>
                                                <p className="text-white/40 text-sm animate-pulse">Buscando conhecimento...</p>
                                            </motion.div>
                                        ) : results.length > 0 ? (
                                            <motion.div
                                                key="results"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                            >
                                                <EntityList
                                                    items={results}
                                                    entityType="Mixed"
                                                    isLoading={false}
                                                    hasNextPage={hasNextPage}
                                                    isFetchingNextPage={isFetchingNextPage}
                                                    onLoadMore={loadMore}
                                                />
                                            </motion.div>
                                        ) : query.trim().length > 0 ? (
                                            <motion.div
                                                key="no-results"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="h-48 flex items-center justify-center"
                                            >
                                                <p className="text-white/40 text-sm">Nenhum resultado para "{query}"</p>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="empty"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="h-48 flex flex-col items-center justify-center space-y-3"
                                            >
                                                <Search className="h-10 w-10 text-blue-500/20 mx-auto" />
                                                <div className="space-y-1 text-center">
                                                    <p className="text-white/60 text-sm font-medium">O que você procura?</p>
                                                    <p className="text-white/30 text-xs px-8">Procure por regras, magias, talentos ou habilidades do sistema.</p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </GlassCard>
            </motion.div>
            
            {!isExpanded && (
                <p className="text-white/20 text-xs text-center px-8">
                    Dica: Pressione <kbd className="font-mono bg-white/5 px-1 rounded border border-white/10 text-white/40">Ctrl + K</kbd> para buscar de qualquer lugar.
                </p>
            )}
        </div>
    )
}
