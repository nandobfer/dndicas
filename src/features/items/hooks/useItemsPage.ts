/**
 * @fileoverview Hook for managing items list state.
 */

"use client";

import * as React from "react"
import { useItems, useInfiniteItems } from "../api/items-queries"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Item, ItemType, ItemRarity } from "../types/items.types"

export function useItemsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()

    const [search, setSearch] = React.useState("")
    const [type, setType] = React.useState<ItemType | "all">("all")
    const [rarity, setRarity] = React.useState<ItemRarity | "all">("all")
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")

    const filters = { search, type, rarity, status }

    const tableData = useItems(filters, 1, 100)
    const infiniteData = useInfiniteItems(filters)

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedItem, setSelectedItem] = React.useState<Item | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleTypeChange = (value: ItemType | "all") => setType(value)
    const handleRarityChange = (value: ItemRarity | "all") => setRarity(value)
    const handleStatusChange = (value: "active" | "inactive" | "all") => setStatus(value)

    const handleCreateClick = () => {
        setSelectedItem(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (item: Item) => {
        setSelectedItem(item)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (item: Item) => {
        setSelectedItem(item)
        setIsDeleteOpen(true)
    }

    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteOpen(false)
        setSelectedItem(null)
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        filters: {
            search,
            setSearch,
            type,
            setType,
            rarity,
            setRarity,
            status,
            setStatus
        },
        data: {
            items: viewMode === "table" ? (tableData.data?.items || []) : (infiniteData.data?.pages.flatMap(p => p.items) || []),
            isLoading: viewMode === "table" ? tableData.isLoading : (infiniteData.isLoading || infiniteData.isFetching),
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: tableData.data?.total || 0,
        },
        actions: {
            handleSearchChange,
            handleTypeChange,
            handleRarityChange,
            handleStatusChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedItem,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            closeAll
        }
    }
}
