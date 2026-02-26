"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Edit2, RefreshCw, AlertCircle, Scroll, Wand, Sparkles, Zap } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { motionConfig } from "@/lib/config/motion-configs"
import { cn } from "@/core/utils"
import { entityConfig } from "@/lib/config/colors"
import type { MentionIssue } from "@/features/rules/hooks/useMentionAuditPage"

interface MentionAuditTableProps {
  items: MentionIssue[]
  isLoading: boolean
  errorAtFetch: string | null
  onRefresh: () => void
  onEdit: (id: string, type: string) => void
}

// Map status for chip variant
const statusVariantMap: Record<string, "uncommon" | "common"> = {
  active: "uncommon",
  inactive: "common",
}

// Map icons for entity types
const ENTITY_ICONS: Record<string, any> = {
  Regra: Scroll,
  Magia: Wand,
  Habilidade: Sparkles,
  Talento: Zap,
}

/**
 * Table component for Mention Audit.
 * Extracted from page.tsx to keep code clean and modular.
 */
export function MentionAuditTable({ items, isLoading, errorAtFetch, onRefresh, onEdit }: MentionAuditTableProps) {
  return (
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
                      <button onClick={onRefresh} className="text-xs underline hover:text-rose-300">Tentar novamente</button>
                    </div>
                  </td>
                </motion.tr>
              ) : items.length === 0 ? (
                <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <td colSpan={6} className="px-6 py-12 text-center text-white/40 italic">
                    Tudo limpo! Nenhuma pendência encontrada.
                  </td>
                </motion.tr>
              ) : (
                items.map((issue) => {
                  const config = entityConfig[issue.type] || entityConfig.Regra;
                  const EntityIcon = ENTITY_ICONS[issue.type] || Scroll;

                  return (
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
                          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                          config.badge,
                          config.border
                        )}>
                          <EntityIcon className="h-3 w-3" />
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
                            onClick={() => onEdit(issue._id, issue.type)}
                            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </SimpleGlassTooltip>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
