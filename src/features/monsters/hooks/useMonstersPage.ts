"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useViewMode } from "@/core/hooks/useViewMode"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { invalidateSearchCache } from "@/core/utils/search-engine"
import { monstersKeys, useInfiniteMonsters } from "../api/monsters-queries"
import type { Monster, MonsterFilterParams, MonsterSize, MonsterType } from "../types/monsters.types"

export function useMonstersPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()
    const queryClient = useQueryClient()
    const [search, setSearch] = React.useState("")
    const [type, setType] = React.useState<MonsterType[]>([])
    const [size, setSize] = React.useState<MonsterSize[]>([])
    const [challengeRating, setChallengeRating] = React.useState("")
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")
    const [sources, setSources] = React.useState<string[]>([])

    const filters: MonsterFilterParams = { search, type: type.length > 0 ? type : undefined, size: size.length > 0 ? size : undefined, challengeRating: challengeRating || undefined, status, sources: sources.length > 0 ? sources : undefined }
    const infiniteData = useInfiniteMonsters(filters)

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [isGenerationOpen, setIsGenerationOpen] = React.useState(false)
    const [selectedMonster, setSelectedMonster] = React.useState<Monster | null>(null)

    const handleCreateClick = () => {
        setSelectedMonster(null)
        setIsFormOpen(true)
    }
    const handleEditClick = (monster: Monster) => {
        setSelectedMonster(monster)
        setIsFormOpen(true)
    }
    const handleDeleteClick = (monster: Monster) => {
        setSelectedMonster(monster)
        setIsDeleteOpen(true)
    }
    const handleGenerateAIClick = (monster: Monster) => {
        setSelectedMonster(monster)
        setIsGenerationOpen(true)
    }
    const handleGenerationApplied = () => {
        queryClient.invalidateQueries({ queryKey: monstersKeys.all })
        queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        invalidateSearchCache()
    }
    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteOpen(false)
        setIsGenerationOpen(false)
        setSelectedMonster(null)
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        filters: { search, type, size, challengeRating, status, sources },
        data: {
            items: infiniteData.data?.pages.flatMap((page) => page.items) || [],
            isLoading: infiniteData.isLoading,
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: infiniteData.data?.pages[0]?.total || 0,
        },
        actions: {
            handleSearchChange: setSearch,
            handleTypeChange: setType,
            handleSizeChange: setSize,
            handleChallengeRatingChange: setChallengeRating,
            handleStatusChange: setStatus,
            handleSourcesChange: setSources,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleGenerateAIClick,
            handleGenerationApplied,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            isGenerationOpen,
            setIsGenerationOpen,
            selectedMonster,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleGenerateAIClick,
            closeAll,
        },
    }
}
