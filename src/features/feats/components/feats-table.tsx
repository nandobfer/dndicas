"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Pencil, Trash2, Zap, Eye } from "lucide-react";
import { useAuth } from "@/core/hooks/useAuth"
import { GlassCard } from "@/components/ui/glass-card";
import { Chip } from "@/components/ui/chip";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  GlassDropdownMenu,
  GlassDropdownMenuContent,
  GlassDropdownMenuItem,
  GlassDropdownMenuTrigger,
} from "@/components/ui/glass-dropdown-menu";
import { motionConfig } from "@/lib/config/motion-configs";
import { Feat } from "../types/feats.types";
import { EntityDescription } from "@/features/rules/components/entity-description";
import { EntityPreviewTooltip } from "@/features/rules/components/entity-preview-tooltip";

const featStatusVariantMap: Record<string, "uncommon" | "common"> = {
  active: "uncommon",
  inactive: "common",
};

/**
 * Maps feat level (1-20) to D&D rarity color.
 * Used for level chip color display.
 */
export function getLevelRarityVariant(level: number) {
  if (level >= 1 && level <= 3) return "common"; // Gray
  if (level >= 4 && level <= 8) return "uncommon"; // Green
  if (level >= 9 && level <= 13) return "rare"; // Blue
  if (level >= 14 && level <= 17) return "veryRare"; // Purple
  if (level >= 18 && level <= 19) return "legendary"; // Amber/Gold
  if (level === 20) return "artifact"; // Red
  return "common"; // Fallback
}

interface FeatsTableProps {
  feats: Feat[];
  total: number;
  page: number;
  limit: number;
  isLoading?: boolean;
  onEdit: (feat: Feat) => void;
  onDelete: (feat: Feat) => void;
  onPageChange: (page: number) => void;
}

export function FeatsTable({
  feats,
  total,
  page,
  limit,
  isLoading = false,
  onEdit,
  onDelete,
  onPageChange,
}: FeatsTableProps) {
  const { isAdmin } = useAuth()
  const totalPages = Math.ceil(total / limit);

  if (isLoading && feats.length === 0) {
    return (
      <GlassCard className="p-12 flex justify-center">
        <LoadingState variant="spinner" message="Carregando talentos..." />
      </GlassCard>
    );
  }

  if (!isLoading && feats.length === 0) {
    return (
      <GlassCard className="p-12">
        <EmptyState
          title="Nenhum talento encontrado"
          description="Tente ajustar os filtros ou criar um novo talento"
          icon={Zap}
        />
      </GlassCard>
    );
  }

  return (
      <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full">
                  <thead>
                      <tr className="border-b border-white/5 bg-white/5">
                          {isAdmin && (
                              <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Status</th>
                          )}
                          <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Nome</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[90px]">Nível</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Requisitos</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-full">Descrição</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Fonte</th>
                          <th className="px-6 py-4 text-center text-xs font-semibold text-white/50 uppercase tracking-wider w-[80px]">Preview</th>
                          {isAdmin && (
                              <th className="px-6 py-4 text-right text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Ações</th>
                          )}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                          {feats.map((feat, index) => (
                              <motion.tr
                                  key={feat._id}
                                  variants={motionConfig.variants.tableRow}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                                  transition={{ delay: index * 0.05 }}
                                  className="group hover:bg-white/5 transition-colors"
                              >
                                  {isAdmin && (
                                      <td className="px-6 py-4 whitespace-nowrap">
                                          <Chip variant={featStatusVariantMap[feat.status] || "common"}>
                                              {feat.status === "active" ? "Ativo" : "Inativo"}
                                          </Chip>
                                      </td>
                                  )}
                                  <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{feat.name}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <Chip variant={getLevelRarityVariant(feat.level)}>Nv. {feat.level}</Chip>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 max-w-[200px]">
                                          {feat.prerequisites.length > 0 ? (
                                              <>
                                                  <Chip
                                                      variant="common"
                                                      size="sm"
                                                      className="bg-white/5 border-white/5 text-[10px] py-0.5 px-2 h-auto max-w-[150px] truncate block"
                                                  >
                                                      {feat.prerequisites[0].replace(/<[^>]*>/g, "")}
                                                  </Chip>
                                                  {feat.prerequisites.length > 1 && (
                                                      <span className="text-[10px] text-white/40 font-medium shrink-0">
                                                          +{feat.prerequisites.length - 1}
                                                      </span>
                                                  )}
                                              </>
                                          ) : (
                                              <span className="text-xs text-white/30 italic">Nenhum</span>
                                          )}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-white/40 text-sm max-w-0">
                                      <div className="min-h-[32px] flex items-center overflow-hidden">
                                          <EntityDescription html={feat.description} className="w-full" />
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-white/70">{feat.source}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <EntityPreviewTooltip entityId={feat._id} entityType="Talento">
                                          <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                              <Eye className="h-4 w-4" />
                                          </button>
                                      </EntityPreviewTooltip>
                                  </td>
                                  {isAdmin && (
                                      <td className="px-6 py-4 whitespace-nowrap text-right">
                                          <GlassDropdownMenu>
                                              <GlassDropdownMenuTrigger asChild>
                                                  <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                      <MoreHorizontal className="h-4 w-4" />
                                                  </button>
                                              </GlassDropdownMenuTrigger>
                                              <GlassDropdownMenuContent align="end">
                                                  <GlassDropdownMenuItem onClick={() => onEdit(feat)}>
                                                      <Pencil className="mr-2 h-4 w-4" />
                                                      Editar
                                                  </GlassDropdownMenuItem>
                                                  <GlassDropdownMenuItem
                                                      onClick={() => onDelete(feat)}
                                                      className="text-red-400 hover:text-red-300 focus:text-red-300"
                                                  >
                                                      <Trash2 className="mr-2 h-4 w-4" />
                                                      Excluir
                                                  </GlassDropdownMenuItem>
                                              </GlassDropdownMenuContent>
                                          </GlassDropdownMenu>
                                      </td>
                                  )}
                              </motion.tr>
                          ))}
                      </AnimatePresence>
                  </tbody>
              </table>
          </div>

          <div className="p-4 border-t border-white/5">
              <DataTablePagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={onPageChange} itemLabel="talentos" />
          </div>
      </GlassCard>
  )
}
