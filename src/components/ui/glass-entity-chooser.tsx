import React, { useState, useEffect, useRef } from 'react'
import { cn } from '@/core/utils'
import { glassConfig } from '@/lib/config/glass-config'
import { entityColors } from "@/lib/config/colors"
import { performUnifiedSearch } from '@/core/utils/search-engine'
import { Search, X, Check, Scroll, Sparkles, Zap, Wand, Sword, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { DebounceProgress } from "@/components/ui/debounce-progress"
import { EntityProvider } from '@/lib/config/entities'

const entityIcons: Record<string, any> = {
    Regra: Scroll,
    Habilidade: Sparkles,
    Talento: Zap,
    Magia: Wand,
    Classe: Sword,
    Atores: User
}

export interface EntityOption {
    id: string
    _id?: string
    label: string
    name?: string
    entityType?: string
    type?: string
    [key: string]: any
}

interface GlassEntityChooserProps {
    value?: string | EntityOption
    onChange: (value: EntityOption | null) => void
    provider?: EntityProvider
    placeholder?: string
    disabled?: boolean
    className?: string
    allowClear?: boolean
}

export function GlassEntityChooser({
    value,
    onChange,
    provider,
    placeholder,
    disabled = false,
    className,
    allowClear = true
}: GlassEntityChooserProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<EntityOption[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    // Default placeholder based on provider if not provided
    const displayPlaceholder = placeholder || (provider ? `Buscar ${provider.label}...` : "Buscar entidade...")

    // Normalize value to an object if possible
    const selectedEntity = typeof value === 'object' ? value : null

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (!isOpen || query.length < 2) {
            setResults([])
            return
        }

        const timer = setTimeout(async () => {
            setLoading(true)
            try {
                let filtered: EntityOption[] = []

                if (provider) {
                    // Optimized path: use the provider's specific endpoint if it exists
                    const response = await fetch(`${provider.endpoint()}?q=${encodeURIComponent(query)}`)
                    if (response.ok) {
                        const data = await response.json()
                        const items = Array.isArray(data) ? data : (data.items || [])
                        filtered = items.map((item: any) => {
                            const unified = provider.map(item)
                            return {
                                ...unified,
                                id: unified.id || unified._id,
                                label: unified.name || unified.label || "Sem nome",
                                entityType: unified.type
                            }
                        })
                    }
                } else {
                    // Fallback to unified search
                    const searchResults = await performUnifiedSearch(query, 50)
                    filtered = searchResults.map(item => ({
                        ...item,
                        id: item._id || item.id,
                        entityType: item.type,
                        label: item.name || item.label || "Sem nome"
                    }))
                }

                setResults(filtered.slice(0, 10))
                setSelectedIndex(0)
            } catch (error) {
                console.error("Search failed:", error)
            } finally {
                setLoading(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [query, isOpen, provider])

    const handleSelect = (entity: EntityOption) => {
        onChange(entity)
        setIsOpen(false)
        setQuery("")
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return

        if (e.key === "ArrowDown") {
            e.preventDefault()
            setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0))
        } else if (e.key === "Enter" && isOpen) {
            e.preventDefault()
            if (results[selectedIndex]) {
                handleSelect(results[selectedIndex])
            }
        } else if (e.key === "Escape") {
            setIsOpen(false)
        }
    }

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 transition-all focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50",
                    disabled && "opacity-50 cursor-not-allowed",
                    !disabled && "cursor-pointer"
                )}
                onClick={() => !disabled && setIsOpen(true)}
            >
                {selectedEntity ? (
                    <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                             {(() => {
                                const Icon = entityIcons[selectedEntity.entityType || ""] || Scroll
                                return <Icon className="w-3.5 h-3.5 text-white/40" />
                            })()}
                            <span className="text-sm text-white font-medium">{selectedEntity.label}</span>
                        </div>
                        {allowClear && !disabled && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onChange(null)
                                }}
                                className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-rose-400 transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-white/20" />
                        <span className="text-sm text-white/20">{displayPlaceholder}</span>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        className={cn(
                            "absolute top-full left-0 right-0 mt-2 z-[100] p-1 rounded-xl overflow-hidden shadow-2xl border border-white/10",
                            glassConfig.sidebar.background,
                            glassConfig.sidebar.blur
                        )}
                    >
                        <div className="p-2">
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Digite para buscar..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-blue-500/30 transition-all"
                            />
                        </div>

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {results.length > 0 ? (
                                results.map((item, index) => {
                                    const Icon = entityIcons[item.entityType || ""] || Scroll
                                    const isSelected = selectedIndex === index
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            onClick={() => handleSelect(item)}
                                            className={cn(
                                                "flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg transition-colors group",
                                                isSelected ? "bg-white/15" : "hover:bg-white/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon className={cn("w-4 h-4 transition-colors", isSelected ? "text-blue-400" : "text-white/30")} />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-white">{item.label}</span>
                                                    {item.description && (
                                                        <span className="text-[10px] text-white/40 line-clamp-1">{item.description.replace(/<[^>]*>/g, '')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {item.entityType && (
                                                    <span className={cn(
                                                        "text-[9px] uppercase font-black tracking-tighter px-1.5 py-0.5 rounded",
                                                        entityColors[item.entityType as keyof typeof entityColors]?.badge || "bg-white/10 text-white/40"
                                                    )}>
                                                        {item.entityType}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="h-3.5 w-3.5 text-blue-400" />}
                                            </div>
                                        </button>
                                    )
                                })
                            ) : query.length >= 2 ? (
                                <div className="px-4 py-8 text-center">
                                    {loading ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                            <span className="text-xs text-white/40">Buscando...</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-sm text-white/20 font-medium">Nenhum resultado</span>
                                            <span className="text-[10px] text-white/10 uppercase tracking-widest">Tente outro termo</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="px-4 py-6 text-center">
                                    <span className="text-[11px] text-white/20 italic">Digite pelo menos 2 caracteres para buscar</span>
                                </div>
                            )}
                        </div>
                        <DebounceProgress isAnimating={loading} duration={500} animationKey={query} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
