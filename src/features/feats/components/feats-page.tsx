"use client";

import { useState, useCallback, useMemo } from 'react';
import { Plus, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/core/utils';
import { useFeats } from '../hooks/useFeats';
import { useFeatMutations } from '../hooks/useFeatMutations';
import { useAuth } from "@/core/hooks/useAuth"
import { FeatsTable } from './feats-table';
import { FeatsFilters } from './feats-filters';
import { FeatFormModal } from './feat-form-modal';
import { DeleteFeatDialog } from './delete-feat-dialog';
import type { FeatsFilters as FeatsFiltersType, Feat, CreateFeatInput, UpdateFeatInput } from '../types/feats.types';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { motionConfig } from '@/lib/config/motion-configs';
import { useDebounce } from '@/core/hooks/useDebounce';

export function FeatsPage() {
  const { isAdmin } = useAuth()
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FeatsFiltersType['status']>('all');
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [levelMax, setLevelMax] = useState<number | undefined>(undefined);
  const [attributes, setAttributes] = useState<string[]>([])

  // Debounced search
  const debouncedSearch = useDebounce(search, 500)

  // Filters object for query
  const filters: FeatsFiltersType = useMemo(
      () => ({
          page,
          limit: 10,
          search: debouncedSearch,
          status,
          level,
          levelMax,
          attributes,
      }),
      [page, debouncedSearch, status, level, levelMax, attributes],
  )

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedFeat, setSelectedFeat] = useState<Feat | null>(null)

  const { data, isLoading, isFetching } = useFeats(filters)
  const { createFeat, updateFeat, deleteFeat } = useFeatMutations()

  const handleSearchChange = (value: string) => {
      setSearch(value)
      setPage(1)
  }

  const handleStatusChange = (value: FeatsFiltersType["status"]) => {
      setStatus(value)
      setPage(1)
  }

  const handleLevelChange = (value: number | undefined, mode: "exact" | "upto") => {
      if (value === undefined) {
          setLevel(undefined)
          setLevelMax(undefined)
      } else if (mode === "exact") {
          setLevel(value)
          setLevelMax(undefined)
      } else {
          setLevelMax(value)
          setLevel(undefined)
      }
      setPage(1)
  }

  const handleEdit = (feat: Feat) => {
      setSelectedFeat(feat)
      setIsModalOpen(true)
  }

  const handleDelete = (feat: Feat) => {
      setSelectedFeat(feat)
      setIsDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
      if (selectedFeat) {
          try {
              await deleteFeat.mutateAsync(selectedFeat._id)
              setIsDeleteOpen(false)
              setSelectedFeat(null)
              toast.success("Talento deletado com sucesso!")
          } catch (error: any) {
              toast.error(error.message || "Erro ao deletar talento")
          }
      }
  }

  const handleNewFeat = () => {
      setSelectedFeat(null)
      setIsModalOpen(true)
  }

  const handleModalClose = () => {
      setIsModalOpen(false)
      setSelectedFeat(null)
  }

  const handleFormSubmit = async (formData: CreateFeatInput | UpdateFeatInput) => {
      try {
          if (selectedFeat) {
              // Update existing feat
              await updateFeat.mutateAsync({
                  id: selectedFeat._id,
                  data: formData as UpdateFeatInput,
              })
              toast.success("Talento atualizado com sucesso!")
          } else {
              // Create new feat
              await createFeat.mutateAsync(formData as CreateFeatInput)
              toast.success("Talento criado com sucesso!")
          }
          handleModalClose()
      } catch (error: any) {
          toast.error(error.message || "Erro ao salvar talento")
      }
  }

  return (
      <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                      <Zap className="h-6 w-6 text-amber-400" />
                      Catálogo de Talentos
                  </h1>
                  <p className="text-sm text-white/60 mt-1">Gerencie os talentos disponíveis para personagens (D&D 5e)</p>
              </div>

              {isAdmin && (
                  <button
                      onClick={handleNewFeat}
                      className={cn(
                          "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                          "bg-blue-500 text-white font-medium text-sm",
                          "hover:bg-blue-600 transition-colors",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                          "shadow-lg shadow-blue-500/20",
                      )}
                  >
                      <Plus className="h-4 w-4" />
                      Novo Talento
                  </button>
              )}
          </div>

          {/* Filters */}
          <GlassCard>
              <GlassCardContent className="py-4">
                  <FeatsFilters
                      filters={{ ...filters, search, status, level, levelMax }}
                      onSearchChange={handleSearchChange}
                      onStatusChange={handleStatusChange}
                      onLevelChange={handleLevelChange}
                      onAttributesChange={(val) => {
                          setAttributes(val)
                          setPage(1)
                      }}
                      isSearching={isFetching && !isLoading}
                  />
              </GlassCardContent>
          </GlassCard>

          {/* Table */}
          <FeatsTable
              feats={data?.items || []}
              isLoading={isLoading}
              total={data?.total || 0}
              page={filters.page || 1}
              limit={filters.limit || 10}
              onPageChange={setPage}
              onEdit={handleEdit}
              onDelete={handleDelete}
          />

          {/* Form Modal */}
          <FeatFormModal isOpen={isModalOpen} onClose={handleModalClose} onSubmit={handleFormSubmit} feat={selectedFeat} isSubmitting={createFeat.isPending || updateFeat.isPending} />

          {/* Delete Confirmation Dialog */}
          <DeleteFeatDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={handleDeleteConfirm} feat={selectedFeat} isDeleting={deleteFeat.isPending} />
      </motion.div>
  )
}
