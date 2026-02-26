"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Plus, MessageSquare } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useAuth } from "@/core/hooks/useAuth"
import { useFeedbackFilters } from "@/features/feedback/hooks/useFeedbackFilters"
import { useFeedbacks, useCreateFeedback, useUpdateFeedback } from "@/features/feedback/hooks/useFeedback"
import { FeedbackFilters } from "@/features/feedback/components/feedback-filters"
import { FeedbackTable } from "@/features/feedback/components/feedback-table"
import { FeedbackFormModal } from "@/features/feedback/components/feedback-form-modal"
import type { Feedback } from "@/features/feedback/types/feedback.types"

/**
 * Central de Feedback Page.
 * Permite que usuários visualizem, filtrem e enviem sugestões ou reportem bugs.
 */
export default function FeedbackPage() {
  const { isSignedIn } = useAuth()
  const { filters, setSearch, setStatus, setPriority, setPage } = useFeedbackFilters()
  const { data, isLoading, isFetching } = useFeedbacks(filters)
  
  const createMutation = useCreateFeedback()
  const updateMutation = useUpdateFeedback()

  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [selectedFeedback, setSelectedFeedback] = React.useState<Feedback | null>(null)

  const handleCreateClick = () => {
    setSelectedFeedback(null)
    setIsModalOpen(true)
  }

  const handleEditClick = (feedback: Feedback) => {
    setSelectedFeedback(feedback)
    setIsModalOpen(true)
  }

  const handleFormSubmit = async (formData: any) => {
    try {
      if (selectedFeedback) {
        await updateMutation.mutateAsync({
          id: selectedFeedback.id,
          data: formData
        })
      } else {
        await createMutation.mutateAsync(formData)
      }
      setIsModalOpen(false)
      setSelectedFeedback(null)
    } catch (error) {
      console.error("Erro ao salvar feedback:", error)
    }
  }

  const feedbacks = data?.items || []
  const total = data?.total || 0
  const isSearching = isFetching && !isLoading

  return (
    <motion.div 
      variants={motionConfig.variants.fadeInUp} 
      initial="initial" 
      animate="animate" 
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-blue-400" />
            Central de Feedback
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Ajude-nos a melhorar. Reporte problemas ou sugira novas funcionalidades.
          </p>
        </div>

        {isSignedIn && (
          <button
            onClick={handleCreateClick}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo Feedback
          </button>
        )}
      </div>

      {/* Filters */}
      <GlassCard>
        <GlassCardContent className="py-4">
          <FeedbackFilters
            filters={filters}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
            onPriorityChange={setPriority}
            isSearching={isSearching}
          />
        </GlassCardContent>
      </GlassCard>

      {/* Table */}
      <FeedbackTable
        feedbacks={feedbacks}
        total={total}
        page={filters.page || 1}
        limit={filters.limit || 10}
        isLoading={isLoading}
        onEdit={handleEditClick}
        onPageChange={setPage}
      />

      {/* Form Modal */}
      <FeedbackFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedFeedback(null)
        }}
        onSubmit={handleFormSubmit}
        feedback={selectedFeedback}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </motion.div>
  )
}
