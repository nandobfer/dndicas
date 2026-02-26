"use client";

import { useState, useCallback } from "react"
import { FeedbackFilters } from "../types/feedback.types"

export function useFeedbackFilters() {
    const [filters, setFilters] = useState<FeedbackFilters>({
        page: 1,
        limit: 10,
        status: "all",
        priority: "all",
        type: "all",
        search: "",
    })

    const setPage = useCallback((page: number) => setFilters(f => ({ ...f, page })), [])
    
    // Status can be string "all" or FeedbackStatus
    const setStatus = useCallback((status: any) => 
        setFilters(f => ({ ...f, status: status as FeedbackFilters["status"], page: 1 })), [])
    
    const setPriority = useCallback((priority: any) => 
        setFilters(f => ({ ...f, priority: priority as FeedbackFilters["priority"], page: 1 })), [])
    
    const setType = useCallback((type: any) => 
        setFilters(f => ({ ...f, type: type as FeedbackFilters["type"], page: 1 })), [])
    
    const setSearch = useCallback((search: string) => 
        setFilters(f => ({ ...f, search, page: 1 })), [])

    return {
        filters,
        setPage,
        setStatus,
        setPriority,
        setType,
        setSearch,
    }
}
