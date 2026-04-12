"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ScrollText } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { UserMini } from "@/components/ui/user-mini"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { motionConfig } from "@/lib/config/motion-configs"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { AdminSheetCharacterMini } from "./admin-sheet-character-mini"
import type { AdminSheetListItem } from "../types/character-sheet.types"

export interface AdminSheetsTableProps {
    items: AdminSheetListItem[]
    total: number
    page: number
    limit: number
    isLoading?: boolean
    error?: Error | null
    onPageChange: (page: number) => void
    onRetry: () => void
}

const columns = [
    { key: "character", label: "Personagem", className: "w-[24%]" },
    { key: "class", label: "Classe", className: "w-[10%]" },
    { key: "subclass", label: "Subclasse", className: "w-[11%]" },
    { key: "race", label: "Raça", className: "w-[10%]" },
    { key: "origin", label: "Origem", className: "w-[10%]" },
    { key: "owner", label: "Usuário", className: "w-[21%]" },
    { key: "createdAt", label: "Data de criação", className: "w-[7%]" },
    { key: "updatedAt", label: "Última edição", className: "w-[7%]" },
]

function formatDate(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value))
}

function RichSheetCell({ html }: { html: string }) {
    const isEmpty = !html || html === "—" || html.trim() === ""

    if (isEmpty) {
        return <span className="text-sm text-white/35">—</span>
    }

    return (
        <span className="block text-sm text-white/75 leading-relaxed [&_.mention]:max-w-full [&_.mention]:align-middle">
            <MentionContent
                html={html}
                mode="inline"
                className="[&_.mention]:max-w-full [&_.mention_span:last-child]:truncate"
            />
        </span>
    )
}

export function AdminSheetsTable({ items, total, page, limit, isLoading = false, error, onPageChange, onRetry }: AdminSheetsTableProps) {
    const router = useRouter()
    const totalPages = Math.ceil(total / limit)

    if (isLoading && items.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <LoadingState variant="skeleton" message="Carregando fichas..." lines={6} />
                </GlassCardContent>
            </GlassCard>
        )
    }

    if (error && items.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-8">
                    <ErrorState
                        title="Erro ao carregar fichas"
                        error={error}
                        onRetry={onRetry}
                        isRetrying={isLoading}
                    />
                </GlassCardContent>
            </GlassCard>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <EmptyState
                        title="Nenhuma ficha encontrada"
                        description="Tente ajustar a busca para encontrar outras fichas."
                        icon={ScrollText}
                    />
                </GlassCardContent>
            </GlassCard>
        )
    }

    return (
        <GlassCard>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={cn("px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider", column.className)}
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {items.map((item, index) => (
                                <motion.tr
                                    key={item.id}
                                    layout
                                    variants={motionConfig.variants.tableRow}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: index * 0.04 }}
                                    className={cn(
                                        "group cursor-pointer transition-colors hover:bg-white/5 focus-within:bg-white/5",
                                        isLoading && "opacity-60",
                                    )}
                                    onClick={() => router.push(`/sheets/${item.slug}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault()
                                            router.push(`/sheets/${item.slug}`)
                                        }
                                    }}
                                    tabIndex={0}
                                >
                                    <td className="px-4 py-4 min-w-[260px]">
                                        <AdminSheetCharacterMini name={item.name} photo={item.photo} />
                                    </td>
                                    <td className="px-4 py-4 align-middle"><RichSheetCell html={item.class} /></td>
                                    <td className="px-4 py-4 align-middle"><RichSheetCell html={item.subclass} /></td>
                                    <td className="px-4 py-4 align-middle"><RichSheetCell html={item.race} /></td>
                                    <td className="px-4 py-4 align-middle"><RichSheetCell html={item.origin} /></td>
                                    <td className="px-4 py-4 min-w-[240px]">
                                        <UserMini
                                            name={item.owner.name}
                                            username={item.owner.username}
                                            avatarUrl={item.owner.avatarUrl ?? undefined}
                                            size="sm"
                                        />
                                    </td>
                                    <td className="px-4 py-4 text-xs text-white/50 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                                    <td className="px-4 py-4 text-xs text-white/50 whitespace-nowrap">{formatDate(item.updatedAt)}</td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            <DataTablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={onPageChange}
                itemLabel="fichas"
            />
        </GlassCard>
    )
}
