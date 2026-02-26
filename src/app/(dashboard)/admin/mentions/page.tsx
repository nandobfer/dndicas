"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AtSign, Edit2, RefreshCw, AlertCircle } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { motionConfig } from "@/lib/config/motion-configs"
import { cn } from "@/core/utils"

// Import hooks and modals for editing
import { useRuleMutations } from "@/features/rules/hooks/useRuleMutations"
import { RuleFormModal } from "@/features/rules/components/rule-form-modal"
import { useSpell, useUpdateSpell } from "@/features/spells/api/spells-queries"
import { SpellFormModal } from "@/features/spells/components/spell-form-modal"
import { useTrait } from "@/features/traits/hooks/useTraits"
import { useTraitMutations } from "@/features/traits/hooks/useTraitMutations"
import { TraitFormModal } from "@/features/traits/components/trait-form-modal"
import { useFeat } from "@/features/feats/hooks/useFeats"
import { useFeatMutations } from "@/features/feats/hooks/useFeatMutations"
import { FeatFormModal } from "@/features/feats/components/feat-form-modal"
import type { Reference, UpdateReferenceInput } from "@/features/rules/types/rules.types"
import type { UpdateTraitInput } from "@/features/traits/types/traits.types"
import type { UpdateFeatInput } from "@/features/feats/types/feats.types"

// Status variant mapping matching the emerald indicator
const statusVariantMap: Record<string, "uncommon" | "common"> = {
  active: "uncommon", // Green = Emerald (uncommon variant)
  inactive: "common",  // Grey = Common variant
}

interface MentionIssue {
  _id: string
  type: "Regra" | "Magia" | "Habilidade" | "Talento"
  name: string
  description: string
  source: string
  status: "active" | "inactive"
}

export default function MentionAuditPage() {
  const [issues, setIssues] = React.useState<MentionIssue[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [errorAtFetch, setErrorAtFetch] = React.useState<string | null>(null)
  
  // Modal states
  const [editingEntity, setEditingEntity] = React.useState<{ id: string; type: string } | null>(null)

  // Fetch individual entities for editing
  const { data: spellData } = useSpell(editingEntity?.type === "Magia" ? editingEntity.id : null)
  const { data: traitData } = useTrait(editingEntity?.type === "Habilidade" ? editingEntity.id : null)
  const { data: featData } = useFeat(editingEntity?.type === "Talento" ? editingEntity.id : null)
  
  // Mutations hooks
  const { updateRule } = useRuleMutations();
  const updateSpellMutation = useUpdateSpell();
  const { update: updateTrait } = useTraitMutations();
  const { updateFeat } = useFeatMutations();
  
  const [selectedRule, setSelectedRule] = React.useState<Reference | null>(null)

  const fetchIssues = React.useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)
    setErrorAtFetch(null)
    
    try {
      const resp = await fetch("/api/admin/mention-audit")
      if (resp.ok) {
        const data = await resp.json()
        setIssues(data)
      } else {
        const errorData = await resp.json().catch(() => ({}))
        setErrorAtFetch(errorData.error || `Erro ${resp.status}: Falha ao buscar dados`)
      }
    } catch (err) {
      console.error("Failed to fetch issues", err)
      setErrorAtFetch("Erro de conexão com o servidor")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  const handleEdit = (id: string, type: string) => {
    if (type === "Regra") {
      const rule = issues.find(i => i._id === id)
      if (rule) setSelectedRule(rule as unknown as Reference)
    }
    setEditingEntity({ id, type })
  }

  const handleRefresh = () => fetchIssues(true)

  return (
    <motion.div 
      variants={motionConfig.variants.fadeInUp} 
      initial="initial" 
      animate="animate" 
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AtSign className="h-6 w-6 text-amber-400" />
            Referências Pendentes
          </h1>
          <p className="text-sm text-white/60 mt-1">Identifique e corrija pendências em referências dinâmicas nas descrições.</p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
            "bg-white/5 border border-white/10 text-white font-medium text-sm",
            "hover:bg-white/10 disabled:opacity-50"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", (isRefreshing && !isLoading) && "animate-spin")} />
          Atualizar
        </button>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Status</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[120px]">Entidade</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[200px]">Nome</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Descrição</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[150px]">Fonte</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout" initial={false}>
                {isLoading ? (
                  <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={6} className="px-6 py-12 text-center text-white/40">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin" />
                        <span>Buscando pendências...</span>
                      </div>
                    </td>
                  </motion.tr>
                ) : errorAtFetch ? (
                  <motion.tr key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={6} className="px-6 py-12 text-center text-rose-400">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="h-8 w-8" />
                        <span>{errorAtFetch}</span>
                        <button onClick={handleRefresh} className="text-xs underline hover:text-rose-300">Tentar novamente</button>
                      </div>
                    </td>
                  </motion.tr>
                ) : issues.length === 0 ? (
                  <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={6} className="px-6 py-12 text-center text-white/40 italic">
                      Tudo limpo! Nenhuma pendência encontrada.
                    </td>
                  </motion.tr>
                ) : (
                  issues.map((issue) => (
                    <motion.tr
                      key={`${issue.type}-${issue._id}`}
                      variants={motionConfig.variants.tableRow}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      className="group hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Chip variant={statusVariantMap[issue.status] || "common"}>
                          {issue.status === "active" ? "Ativo" : "Inativo"}
                        </Chip>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                          issue.type === "Regra" && "bg-blue-400/10 text-blue-400 border-blue-400/20",
                          issue.type === "Magia" && "bg-purple-400/10 text-purple-400 border-purple-400/20",
                          issue.type === "Habilidade" && "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
                          issue.type === "Talento" && "bg-amber-400/10 text-amber-400 border-amber-400/20",
                        )}>
                          {issue.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{issue.name}</td>
                      <td className="px-6 py-4">
                        <div className="max-w-[400px] truncate text-white/40 text-sm">
                           {issue.description.replace(/<[^>]*>/g, "").substring(0, 100)}...
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-white/40 text-xs">{issue.source || <GlassEmptyValue />}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <SimpleGlassTooltip content="Editar Entidade" side="left">
                          <button
                            onClick={() => handleEdit(issue._id, issue.type)}
                            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </SimpleGlassTooltip>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </GlassCard>

      <RuleFormModal
        isOpen={editingEntity?.type === "Regra"}
        onClose={() => {
          setEditingEntity(null)
          setSelectedRule(null)
        }}
        rule={selectedRule}
        isSubmitting={updateRule.isPending}
        onSubmit={async (data) => {
          if (selectedRule?._id) {
            await updateRule.mutateAsync({
              id: selectedRule._id,
              data: data as UpdateReferenceInput
            });
            setEditingEntity(null)
            setSelectedRule(null)
            fetchIssues(true)
          }
        }}
      />
      
      <SpellFormModal
        isOpen={editingEntity?.type === "Magia"}
        onClose={() => setEditingEntity(null)}
        spell={spellData || null}
        onSuccess={() => {
            setEditingEntity(null)
            fetchIssues(true)
        }}
      />

      <TraitFormModal
        isOpen={editingEntity?.type === "Habilidade"}
        onClose={() => setEditingEntity(null)}
        trait={traitData || null}
        isSubmitting={updateTrait.isPending}
        onSubmit={async (data) => {
          if (editingEntity?.id) {
            await updateTrait.mutateAsync({
              id: editingEntity.id,
              data: data as UpdateTraitInput
            });
            setEditingEntity(null)
            fetchIssues(true)
          }
        }}
      />

      <FeatFormModal
        isOpen={editingEntity?.type === "Talento"}
        onClose={() => setEditingEntity(null)}
        feat={featData || null}
        isSubmitting={updateFeat.isPending}
        onSubmit={async (data) => {
          if (editingEntity?.id) {
            await updateFeat.mutateAsync({
              id: editingEntity.id,
              data: data as UpdateFeatInput
            });
            setEditingEntity(null)
            fetchIssues(true)
          }
        }}
      />
    </motion.div>
  )
}
