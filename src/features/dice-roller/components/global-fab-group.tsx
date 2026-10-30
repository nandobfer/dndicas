"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/core/utils"
import { DiceRollerFab } from "./dice-roller-fab"
import { GlobalSearchFAB } from "@/components/ui/global-search-fab"
import { OpexFab, useOpexFabEnabled } from "@/features/opex-agent/components/OpexFab"
import { useIsOwlbearAvailable } from "@/features/owlbear/hooks/use-is-owlbear-available"
import { useIsOwlbearCatalogEmbed } from "@/features/owlbear/hooks/use-is-owlbear-catalog-embed"
import { FAB_MOUSE_ACTIVATION, FAB_TOUCH_ACTIVATION, createRowCollisionDetection, moveFab, useFabOrder, type FabId } from "./fab-order"

type DndListeners = Record<string, (event: React.SyntheticEvent) => void>

/**
 * Só deixa o arraste começar em eventos que nasceram dentro do próprio botão na DOM. Os eventos do
 * React borbulham pela árvore de componentes, então um toque no chat do Opex (aberto em portal)
 * chegaria ao wrapper e arrastaria o botão.
 */
export function onlyFromOwnDom(listeners: DndListeners | undefined): DndListeners {
    const guarded: DndListeners = {}
    for (const [name, handler] of Object.entries(listeners ?? {})) {
        guarded[name] = (event) => {
            const target = event.target
            if (target instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(target)) handler(event)
        }
    }
    return guarded
}

function SortableFab({ id, disabled, children, suppressClick }: { id: FabId; disabled: boolean; children: React.ReactNode; suppressClick: React.RefObject<boolean> }) {
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
    return (
        <div
            ref={setNodeRef}
            data-fab-id={id}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn("relative touch-manipulation", isDragging && "z-10 cursor-grabbing opacity-80")}
            // O clique que encerra um arraste não deve abrir o botão.
            onClickCapture={(event) => {
                if (!suppressClick.current) return
                event.preventDefault()
                event.stopPropagation()
                suppressClick.current = false
            }}
            {...onlyFromOwnDom(listeners as DndListeners | undefined)}
        >
            {children}
        </div>
    )
}

/**
 * Botões flutuantes do canto inferior direito (Dados, Agente Opex, Busca), numa linha (coluna no
 * celular) reordenável por arraste. A ordem fica salva no navegador; botões ocultos na tela não ocupam
 * espaço e os demais mantêm a ordem salva entre si.
 */
export function GlobalFabGroup() {
    const pathname = usePathname()
    const isOwlbearAvailable = useIsOwlbearAvailable()
    const isEmbeddedInOwlbearCatalog = useIsOwlbearCatalogEmbed()
    const opexEnabled = useOpexFabEnabled()
    const { order, saveOrder, ready } = useFabOrder()
    const [searchOpen, setSearchOpen] = React.useState(false)
    const suppressClick = React.useRef(false)
    const rowRef = React.useRef<HTMLDivElement>(null)
    const collisionDetection = React.useMemo(() => createRowCollisionDetection(() => rowRef.current?.getBoundingClientRect()), [])
    const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: FAB_MOUSE_ACTIVATION }), useSensor(TouchSensor, { activationConstraint: FAB_TOUCH_ACTIVATION }))

    const visibility: Record<FabId, boolean> = {
        // Dentro do Owlbear a rolagem é a da mesa.
        dice: !isOwlbearAvailable && !isEmbeddedInOwlbearCatalog,
        opex: opexEnabled,
        // O Início já tem busca própria.
        search: pathname !== "/",
    }
    const visible = order.filter((id) => visibility[id])

    const onDragEnd = (event: DragEndEvent) => {
        suppressClick.current = true
        // Limpa no próximo ciclo, caso o soltar não gere clique.
        setTimeout(() => {
            suppressClick.current = false
        }, 0)
        const overId = event.over ? (event.over.id as FabId) : null
        const next = moveFab(order, visible, event.active.id as FabId, overId)
        if (next.some((id, index) => id !== order[index])) saveOrder(next)
    }

    if (!ready) return null

    const render = (id: FabId) => {
        if (id === "dice") return <DiceRollerFab />
        if (id === "opex") return <OpexFab />
        return <GlobalSearchFAB embedded onOpenChange={setSearchOpen} />
    }

    return (
        <div ref={rowRef} className="fixed bottom-6 right-6 z-[99] flex flex-col items-end gap-3 sm:flex-row sm:items-center" data-testid="global-fab-group">
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd} onDragCancel={() => (suppressClick.current = false)}>
                <SortableContext items={visible} strategy={rectSortingStrategy}>
                    {visible.map((id) => (
                        <SortableFab key={id} id={id} disabled={searchOpen && visibility.search} suppressClick={suppressClick}>
                            {render(id)}
                        </SortableFab>
                    ))}
                </SortableContext>
            </DndContext>
        </div>
    )
}
