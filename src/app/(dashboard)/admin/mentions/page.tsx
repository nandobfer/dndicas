"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AtSign, RefreshCw } from "lucide-react"
import { motionConfig, fade } from "@/lib/config/motion-configs"
import { cn } from "@/core/utils"
import { GlassSelector } from "@/components/ui/glass-selector"

// Import hooks and modals for editing
import { useMentionAuditPage } from "@/features/rules/hooks/useMentionAuditPage"
import { MentionAuditTable } from "./components/mention-audit-table"
import { RuleFormModal } from "@/features/rules/components/rule-form-modal"
import { EntityList } from "@/features/rules/components/entity-list"
import { SpellFormModal } from "@/features/spells/components/spell-form-modal"
import { TraitFormModal } from "@/features/traits/components/trait-form-modal"
import { FeatFormModal } from "@/features/feats/components/feat-form-modal"
import { LoadingState } from "@/components/ui/loading-state"
import type { UpdateReferenceInput } from "@/features/rules/types/rules.types"
import type { UpdateTraitInput } from "@/features/traits/types/traits.types"
import type { UpdateFeatInput } from "@/features/feats/types/feats.types"

function MentionAuditContent() {
    const { isMobile, isLoading, isRefreshing, errorAtFetch, data, actions, modals, viewMode, setViewMode, isDefault } = useMentionAuditPage()

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <motion.div {...fade}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <AtSign className="h-6 w-6 text-amber-400" />
                            Referências Pendentes
                            {!isMobile && (
                                <GlassSelector
                                    value={viewMode}
                                    onChange={(v) => setViewMode(v as any)}
                                    options={[
                                        { value: "default", label: "Padrão" },
                                        { value: "table", label: "Tabela" },
                                    ]}
                                    size="sm"
                                    layoutId="mentions-view-selector"
                                />
                            )}
                        </h1>
                        <p className="text-sm text-white/60 mt-1">Identifique e corrija pendências em referências dinâmicas nas descrições.</p>
                    </div>

                    <button
                        onClick={actions.handleRefresh}
                        disabled={isRefreshing || isLoading}
                        className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                            "bg-white/5 border border-white/10 text-white font-medium text-sm",
                            "hover:bg-white/10 disabled:opacity-50",
                        )}
                    >
                        <RefreshCw className={cn("h-4 w-4", isRefreshing && !isLoading && "animate-spin")} />
                        Atualizar
                    </button>
                </div>
            </motion.div>

            {isDefault ? (
                <EntityList
                    items={data.items}
                    entityType="Mixed"
                    isLoading={isLoading}
                    isAdmin={true}
                    hasNextPage={false}
                    isFetchingNextPage={false}
                    onLoadMore={() => {}}
                    onEdit={(item) => actions.handleEdit(item._id, item.type)}
                />
            ) : (
                <MentionAuditTable items={data.items} isLoading={isLoading} errorAtFetch={errorAtFetch} onRefresh={actions.handleRefresh} onEdit={actions.handleEdit} />
            )}

            <RuleFormModal
                isOpen={modals.editingEntity?.type === "Regra"}
                onClose={actions.closeModals}
                rule={modals.selectedRule}
                isSubmitting={actions.updateRule.isPending}
                onSubmit={async (formData) => {
                    if (modals.selectedRule?._id) {
                        await actions.updateRule.mutateAsync({
                            id: modals.selectedRule._id,
                            data: formData as UpdateReferenceInput,
                        })
                        actions.closeModals()
                        actions.fetchIssues(true)
                    }
                }}
            />

            <SpellFormModal
                isOpen={modals.editingEntity?.type === "Magia"}
                onClose={actions.closeModals}
                spell={data.spellData || null}
                onSuccess={() => {
                    actions.closeModals()
                    actions.fetchIssues(true)
                }}
            />

            <TraitFormModal
                isOpen={modals.editingEntity?.type === "Habilidade"}
                onClose={actions.closeModals}
                trait={data.traitData || null}
                isSubmitting={actions.updateTrait.isPending}
                onSubmit={async (formData) => {
                    if (modals.editingEntity?.id) {
                        await actions.updateTrait.mutateAsync({
                            id: modals.editingEntity.id,
                            data: formData as UpdateTraitInput,
                        })
                        actions.closeModals()
                        actions.fetchIssues(true)
                    }
                }}
            />

            <FeatFormModal
                isOpen={modals.editingEntity?.type === "Talento"}
                onClose={actions.closeModals}
                feat={data.featData || null}
                isSubmitting={actions.updateFeat.isPending}
                onSubmit={async (formData) => {
                    if (modals.editingEntity?.id) {
                        await actions.updateFeat.mutateAsync({
                            id: modals.editingEntity.id,
                            data: formData as UpdateFeatInput,
                        })
                        actions.closeModals()
                        actions.fetchIssues(true)
                    }
                }}
            />
        </div>
    )
}

export default function MentionAuditPage() {
    return (
        <React.Suspense fallback={<LoadingState variant="spinner" message="Carregando..." />}>
            <MentionAuditContent />
        </React.Suspense>
    )
}

