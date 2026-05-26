"use client"

import * as React from "react"
import { LoadingState } from "@/components/ui/loading-state"

interface InfiniteScrollSentinelProps {
    isLoading?: boolean
    isFetchingNextPage?: boolean
    hasNextPage?: boolean
    onLoadMore?: () => void
    endLabel?: string
    className?: string
}

export function InfiniteScrollSentinel({
    isLoading = false,
    isFetchingNextPage = false,
    hasNextPage = false,
    onLoadMore,
    endLabel = "Fim da lista",
    className = "py-8 flex justify-center w-full",
}: InfiniteScrollSentinelProps) {
    const observer = React.useRef<IntersectionObserver | null>(null)

    const sentinelRef = React.useCallback(
        (node: HTMLDivElement | null) => {
            if (isLoading || isFetchingNextPage) return
            if (observer.current) observer.current.disconnect()

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0]?.isIntersecting && hasNextPage) {
                    onLoadMore?.()
                }
            })

            if (node) observer.current.observe(node)
        },
        [hasNextPage, isFetchingNextPage, isLoading, onLoadMore],
    )

    React.useEffect(() => {
        return () => observer.current?.disconnect()
    }, [])

    return (
        <div ref={sentinelRef} className={className}>
            {isFetchingNextPage && <LoadingState variant="spinner" size="sm" />}
            {!hasNextPage && !isFetchingNextPage && <span className="text-xs text-white/20 uppercase tracking-widest font-bold">{endLabel}</span>}
        </div>
    )
}
