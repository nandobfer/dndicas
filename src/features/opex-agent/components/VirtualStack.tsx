"use client"

import type { ReactNode, RefObject } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

/** Acima disso a lista é virtualizada (TanStack Virtual). */
export const VIRTUALIZE_AFTER = 50

interface VirtualStackProps {
    count: number
    scrollRef: RefObject<HTMLElement | null>
    getKey: (index: number) => string
    renderItem: (index: number) => ReactNode
    estimateSize: number
    className?: string
}

/** Lista vertical de itens com alturas variáveis: inteira até 50 itens, virtualizada acima. */
export function VirtualStack(props: VirtualStackProps) {
    if (props.count <= VIRTUALIZE_AFTER) {
        return (
            <div className={props.className}>
                {Array.from({ length: props.count }, (_, index) => (
                    <div key={props.getKey(index)}>{props.renderItem(index)}</div>
                ))}
            </div>
        )
    }
    return <VirtualizedStack {...props} />
}

function VirtualizedStack({ count, scrollRef, getKey, renderItem, estimateSize, className }: VirtualStackProps) {
    // eslint-disable-next-line react-hooks/incompatible-library -- padrão do TanStack Virtual
    const virtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => estimateSize,
        getItemKey: getKey,
        overscan: 8,
        initialRect: { width: 0, height: 600 },
    })
    const items = virtualizer.getVirtualItems()
    return (
        <div className={className} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((item) => (
                <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}>
                    {renderItem(item.index)}
                </div>
            ))}
        </div>
    )
}
