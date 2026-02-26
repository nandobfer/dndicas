"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Plus, MessageSquare } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useAuth } from "@/core/hooks/useAuth"
import { useFeedbackPage } from "@/features/feedback/hooks/useFeedbackPage"
import { FeedbackFilters } from "@/features/feedback/components/feedback-filters"
import { FeedbackTable } from "@/features/feedback/components/feedback-table"
import { FeedbackList } from "@/features/feedback/components/feedback-list"
import { FeedbackFormModal } from "@/features/feedback/components/feedback-form-modal"

/**
 * Central de Feedback Page.
 * Permite que usuários visualizem, filtrem e enviem sugestões ou reportem bugs.
 */
export default function FeedbackPage() {
  const { isSignedIn, isAdmin } = useAuth()
  
  const { isMobile, filters, pagination, data, actions, modals } = useFeedbackPage()

  const isSearching = data.desktop.isFetching || data.mobile.isFetchingNextPage

  return (
      <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                      <MessageSquare className="h-6 w-6 text-blue-400" />
                      Central de Feedback
                  </h1>
                  <p className="text-sm text-white/60 mt-1">Ajude-nos a melhorar. Reporte problemas ou sugira novas funcionalidades.</p>
              </div>

              {isSignedIn && (
                  <button
                      onClick={actions.handleCreateClick}
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 w-full sm:w-auto"
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
                      filters={filters as any}
                      onSearchChange={actions.handleSearchChange}
                      onStatusChange={actions.handleStatusChange}
                      onPriorityChange={actions.handlePriorityChange}
                      isSearching={isSearching}
                  />
              </GlassCardContent>
          </GlassCard>

          {/* Content: Table for Desktop, List for Mobile */}
          {isMobile ? (
              <FeedbackList
                  items={data.mobile.items}
                  isLoading={data.mobile.isLoading}
                  hasNextPage={data.mobile.hasNextPage}
                  isFetchingNextPage={data.mobile.isFetchingNextPage}
                  onLoadMore={data.mobile.fetchNextPage}
                  onEdit={actions.handleEditClick}
                  isAdmin={isAdmin}
              />
          ) : (
              <FeedbackTable
                  feedbacks={data.desktop.items}
                  total={pagination.total}
                  page={pagination.page}
                  limit={pagination.limit}
                  isLoading={data.desktop.isLoading}
                  onEdit={actions.handleEditClick}
                  onPageChange={pagination.setPage}
              />
          )}

          {/* Form Modal */}
          <FeedbackFormModal
              isOpen={modals.isFormOpen}
              onClose={() => {
                  modals.setIsFormOpen(false)
              }}
              onSubmit={actions.handleFormSubmit}
              feedback={modals.selectedFeedback}
              isSubmitting={modals.isSaving}
          />
      </motion.div>
  )
}
