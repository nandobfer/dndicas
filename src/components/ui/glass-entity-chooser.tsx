import React, { useState, useEffect, useRef } from 'react'
import { cn } from '@/core/utils'
import { glassConfig } from '@/lib/config/glass-config'
import { entityColors } from "@/lib/config/colors"
import { performUnifiedSearch } from '@/core/utils/search-engine'
import { Search, X, Check, Scroll, Sparkles, Zap, Wand, Sword, User, Plus, ShieldCheck } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { DebounceProgress } from "@/components/ui/debounce-progress"
import { EntityProvider } from "@/lib/config/entities"
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "./glass-popover"
import dynamic from "next/dynamic"

// Hooks and dynamic forms for creation
import { useRuleMutations } from "@/features/rules/hooks/useRuleMutations"
import { useTraitMutations } from "@/features/traits/hooks/useTraitMutations"
import { useFeatMutations } from "@/features/feats/hooks/useFeatMutations"

const RuleFormModal = dynamic(() => import("@/features/rules/components/rule-form-modal").then((mod) => mod.RuleFormModal))
const TraitFormModal = dynamic(() => import("@/features/traits/components/trait-form-modal").then((mod) => mod.TraitFormModal))
const FeatFormModal = dynamic(() => import("@/features/feats/components/feat-form-modal").then((mod) => mod.FeatFormModal))
const SpellFormModal = dynamic(() => import("@/features/spells/components/spell-form-modal").then((mod) => mod.SpellFormModal))

import { createPortal } from "react-dom"

function EntityCreatorModal({ provider, isOpen, onClose, onSuccess }: { provider: EntityProvider; isOpen: boolean; onClose: () => void; onSuccess: (entity: any) => void }) {
    const [mounted, setMounted] = useState(false)
    const ruleMutations = useRuleMutations()
    const traitMutations = useTraitMutations()
    const featMutations = useFeatMutations()

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    const handleSuccess = (createdItem: any) => {
        // Mapeamos para o formato unificado antes de devolver
        if (createdItem) {
            const mapped = provider.map(createdItem)
            onSuccess({
                ...mapped,
                id: mapped.id || mapped._id,
                label: mapped.name || mapped.label || "Sem nome",
                entityType: mapped.type,
            })
        }
        // Não chamamos onClose aqui se o onSuccess já for fechar ou se quisermos evitar propagação
    }

    if (!isOpen || !mounted) return null

    const modalContent = (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            onClick={(e) => {
                e.stopPropagation()
                onClose()
            }}
        >
            <div
                className="w-full max-w-4xl max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onSubmit={(e) => e.stopPropagation()} // Extra guard against submit bubbling
            >
                {(() => {
                    switch (provider.name) {
                        case "Regra":
                            return (
                                <RuleFormModal
                                    isOpen={isOpen}
                                    onClose={onClose}
                                    onSubmit={async (data) => {
                                        const res = await ruleMutations.createRule.mutateAsync(data as any)
                                        handleSuccess(res)
                                        onClose()
                                    }}
                                    isSubmitting={ruleMutations.createRule.isPending}
                                />
                            )
                        case "Habilidade":
                            return (
                                <TraitFormModal
                                    isOpen={isOpen}
                                    onClose={onClose}
                                    onSubmit={async (data) => {
                                        const res = await traitMutations.create.mutateAsync(data as any)
                                        handleSuccess(res)
                                        onClose()
                                    }}
                                    isSubmitting={traitMutations.create.isPending}
                                />
                            )
                        case "Talento":
                            return (
                                <FeatFormModal
                                    isOpen={isOpen}
                                    onClose={onClose}
                                    onSubmit={async (data) => {
                                        const res = await featMutations.createFeat.mutateAsync(data as any)
                                        handleSuccess(res)
                                        onClose()
                                    }}
                                    isSubmitting={featMutations.createFeat.isPending}
                                />
                            )
                        case "Magia":
                            return (
                                <SpellFormModal
                                    isOpen={isOpen}
                                    onClose={onClose}
                                    spell={null}
                                    onSuccess={(res) => {
                                        handleSuccess(res)
                                        onClose()
                                    }}
                                />
                            )
                        default:
                            return null
                    }
                })()}
            </div>
        </div>
    )

    return createPortal(modalContent, document.body)
}

const entityIcons: Record<string, any> = {
    Regra: Scroll,
    Habilidade: Sparkles,
    Talento: Zap,
    Magia: Wand,
    Classe: Sword,
    Origem: ShieldCheck,
    Atores: User,
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

export function GlassEntityChooser({ value, onChange, provider, placeholder, disabled = false, className, allowClear = true }: GlassEntityChooserProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<EntityOption[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Default placeholder based on provider if not provided
    const displayPlaceholder = placeholder || (provider ? `Buscar ${provider.label}...` : "Buscar entidade...")

    // Normalize value to an object if possible
    const selectedEntity = typeof value === "object" ? value : null

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
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
                        const items = Array.isArray(data) ? data : data.items || []
                        filtered = items.map((item: any) => {
                            const unified = provider.map(item)
                            return {
                                ...unified,
                                id: unified.id || unified._id,
                                label: unified.name || unified.label || "Sem nome",
                                entityType: unified.type,
                            }
                        })
                    }
                } else {
                    // Fallback to unified search
                    const searchResults = await performUnifiedSearch(query, 50)
                    filtered = searchResults.map((item) => ({
                        ...item,
                        id: item._id || item.id,
                        entityType: item.type,
                        label: item.name || item.label || "Sem nome",
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
            setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0))
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
        <div className={cn("relative w-full", className)}>
            <GlassPopover open={isOpen} onOpenChange={setIsOpen}>
                <GlassPopoverTrigger asChild>
                    <div
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 transition-all focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50",
                            disabled && "opacity-50 cursor-not-allowed",
                            !disabled && "cursor-pointer",
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
                </GlassPopoverTrigger>

                <GlassPopoverContent align="start" side="bottom" sideOffset={8} className="p-0 w-[400px] overflow-visible">
                    <div className="flex flex-col h-[200px]" onWheel={(e) => e.stopPropagation()}>
                        <div className="p-0 border-b border-white/10 shrink-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Digite para buscar..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-500/50 transition-all focus:ring-1 focus:ring-blue-500/50"
                                />
                                {loading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30 p-1 -mb-4 pb-4">
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
                                                isSelected ? "bg-white/15" : "hover:bg-white/10",
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon className={cn("w-4 h-4 transition-colors", isSelected ? "text-blue-400" : "text-white/30")} />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-white">{item.label}</span>
                                                    {item.description && <span className="text-[10px] text-white/40 line-clamp-1">{item.description.replace(/<[^>]*>/g, "")}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {item.entityType && (
                                                    <span
                                                        className={cn(
                                                            "text-[9px] uppercase font-black tracking-tighter px-1.5 py-0.5 rounded",
                                                            entityColors[item.entityType as keyof typeof entityColors]?.badge || "bg-white/10 text-white/40",
                                                        )}
                                                    >
                                                        {item.entityType}
                                                    </span>
                                                )}
                                                {isSelected && <Check className="h-3.5 w-3.5 text-blue-400" />}
                                            </div>
                                        </button>
                                    )
                                })
                            ) : query.length >= 2 ? (
                                <div className="px-4 py-8 text-center text-white/20">
                                    {loading ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                            <span className="text-xs text-white/40 italic">Buscando...</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="text-sm font-medium">Nenhum resultado</span>
                                                <span className="text-[10px] uppercase tracking-widest opacity-50">Tente outro termo</span>
                                            </div>
                                            {provider && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setIsCreateOpen(true)
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 mt-2 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all hover:scale-105"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Criar {provider.name}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="px-4 py-12 text-center text-white/20 flex flex-col items-center">
                                    <Search className="w-8 h-8 mx-auto mb-2 opacity-10" />
                                    <p className="text-xs uppercase tracking-widest font-bold italic opacity-40 mb-6">Mínimo 2 caracteres para buscar</p>

                                    {provider && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                setIsCreateOpen(true)
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 border border-white/10 transition-all hover:scale-105"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Criar {provider.name}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <DebounceProgress isAnimating={loading} duration={500} animationKey={query} />
                    </div>
                </GlassPopoverContent>
            </GlassPopover>

            {provider && isCreateOpen && (
                <EntityCreatorModal
                    provider={provider}
                    isOpen={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    onSuccess={(newEntity) => {
                        onChange(newEntity)
                        setIsOpen(false)
                        setQuery("")
                    }}
                />
            )}
        </div>
    )
}

