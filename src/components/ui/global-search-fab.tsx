"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, X, Command, RefreshCw } from "lucide-react"
import { cn } from "@/core/utils"
import { useGlobalSearch } from "@/core/hooks/useGlobalSearch"
import { SearchInput } from "./search-input"
import { EntityList } from "@/features/rules/components/entity-list"
import { GlassCard } from "./glass-card"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useClickAway } from "@/core/hooks/useClickAway"

const GLASS_STYLE = "bg-black/40 backdrop-blur-[4px]"

export function GlobalSearchFAB() {
  const [isOpen, setIsOpen] = React.useState(false)
  const isMobile = useIsMobile()
  const { query, setQuery, results, isLoading, isSearching } = useGlobalSearch()
  const containerRef = React.useRef<HTMLDivElement>(null)

  useClickAway(containerRef, () => {
    if (isOpen) setIsOpen(false)
  })

  React.useEffect(() => {
    if (!isOpen) {
      setQuery("")
      }
  }, [isOpen])

  // Keyboard shortcut to open (Cmd/Ctrl + K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === "Escape") {
        setIsOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
      <div className="fixed bottom-6 right-6 z-[99]" ref={containerRef}>
          <AnimatePresence mode="popLayout" initial={false}>
              {!isOpen ? (
                  <motion.button
                      key="fab-button"
                      layoutId="search-portal"
                      onClick={() => setIsOpen(true)}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                          "relative p-[1.5px] rounded-full overflow-hidden group shadow-2xl ",
                          "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 bg-[length:200%_auto] animate-gradient",
                      )}
                  >
                      <div className={cn("rounded-full px-5 py-3.5 flex items-center gap-3 transition-colors group-hover:bg-slate-900/40", GLASS_STYLE)}>
                          <Search className="h-5 w-5 text-blue-400 group-hover:text-white transition-colors" />
                          <span className="text-white/90 font-medium text-sm hidden sm:inline">Pesquisar</span>
                          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-white/40 group-hover:text-white/60 transition-colors">
                              <Command className="h-2.5 w-2.5" /> K
                          </kbd>
                      </div>
                  </motion.button>
              ) : (
                  <motion.div
                      key="search-container"
                      layoutId="search-portal"
                      className={cn(
                          "relative p-[1.5px] rounded-2xl overflow-hidden shadow-2xl ",
                          "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 bg-[length:200%_auto] animate-gradient",
                          isMobile ? "w-[calc(100vw-3rem)]" : "w-[450px]",
                      )}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                  >
                      <GlassCard className={cn("border-none rounded-2xl flex flex-col max-h-[70vh] animate-none", GLASS_STYLE)}>
                          <div className="p-4 border-b border-white/5 flex items-center gap-3">
                              <SearchInput
                                  autoFocus
                                  value={query}
                                  onChange={setQuery}
                                  isLoading={isLoading}
                                  placeholder="Pesquisar em todo o sistema..."
                                  className="focus-visible:ring-1 focus-visible:ring-blue-500/50 h-10"
                              />
                          </div>

                          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-[100px]">
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
                                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="relative z-10">
                                                  <RefreshCw className="h-10 w-10 text-blue-400" />
                                              </motion.div>
                                              {/* Glow effect */}
                                              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 animate-pulse rounded-full" />
                                          </div>
                                          <p className="text-white/40 text-sm animate-pulse">Buscando conhecimento...</p>
                                      </motion.div>
                                  ) : results.length > 0 ? (
                                      <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                          <EntityList items={results} entityType="Mixed" isLoading={false} hasNextPage={false} isFetchingNextPage={false} onLoadMore={() => {}} />
                                      </motion.div>
                                  ) : query.trim().length > 0 && !isLoading && !isSearching ? (
                                      <motion.div key="no-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-48 flex items-center justify-center">
                                          <p className="text-white/40 text-sm">Nenhum resultado para "{query}"</p>
                                      </motion.div>
                                  ) : query.trim().length === 0 ? (
                                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-48 flex flex-col items-center justify-center space-y-3">
                                          <Search className="h-10 w-10 text-blue-500/20 mx-auto" />
                                          <div className="space-y-1 text-center">
                                              <p className="text-white/60 text-sm font-medium">O que você procura?</p>
                                              <p className="text-white/30 text-xs px-8">Procure por regras, magias, talentos ou habilidades do sistema.</p>
                                          </div>
                                      </motion.div>
                                  ) : null}
                              </AnimatePresence>
                          </div>
                      </GlassCard>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
  )
}
