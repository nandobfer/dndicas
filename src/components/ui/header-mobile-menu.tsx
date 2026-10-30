"use client"

/**
 * @fileoverview Navegação do header mobile: o hambúrguer abre um painel glass por cima da tela com
 * "Início" e as categorias em seções expansíveis (mesmos itens, visibilidade e destaque do desktop).
 */

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Home, Menu, X } from "lucide-react"
import { cn } from "@/core/utils"
import { VisuallyHidden } from "@/components/ui/opex/visually-hidden"
import { HOME_HREF, type ActiveNav, type NavCategory, type NavCategoryId } from "@/lib/config/navigation"

interface HeaderMobileMenuProps {
    categories: NavCategory[]
    active: ActiveNav
    pathname: string
}

const rowClass = (active: boolean) =>
    cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
    )

export function HeaderMobileMenu({ categories, active, pathname }: HeaderMobileMenuProps) {
    const [open, setOpen] = React.useState(false)
    const activeCategoryId = active?.kind === "item" ? active.categoryId : null
    const [expanded, setExpanded] = React.useState<Set<NavCategoryId>>(() => new Set(activeCategoryId ? [activeCategoryId] : []))

    React.useEffect(() => setOpen(false), [pathname])

    const onOpenChange = (next: boolean) => {
        // Ao abrir, a seção da tela atual já vem expandida.
        if (next) setExpanded(new Set(activeCategoryId ? [activeCategoryId] : []))
        setOpen(next)
    }

    const toggle = (id: NavCategoryId) =>
        setExpanded((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Trigger asChild>
                <button
                    type="button"
                    aria-label="Abrir menu"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                    <Menu className="h-5 w-5" aria-hidden />
                </button>
            </DialogPrimitive.Trigger>
            <AnimatePresence>
                {open && (
                    <DialogPrimitive.Portal forceMount>
                        <DialogPrimitive.Overlay asChild forceMount>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
                                data-testid="header-mobile-menu-backdrop"
                            />
                        </DialogPrimitive.Overlay>
                        <DialogPrimitive.Content forceMount asChild aria-describedby={undefined}>
                            <motion.div
                                initial={{ opacity: 0, y: -16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="fixed inset-x-2 top-2 z-[61] flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-2xl shadow-black/50 backdrop-blur-xl"
                            >
                                <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
                                    <VisuallyHidden>
                                        <DialogPrimitive.Title>Menu</DialogPrimitive.Title>
                                    </VisuallyHidden>
                                    <Link href={HOME_HREF} onClick={() => setOpen(false)} className="flex items-center">
                                        <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" width={40} height={40} className="h-10 w-10 object-contain" />
                                    </Link>
                                    <DialogPrimitive.Close asChild>
                                        <button
                                            type="button"
                                            aria-label="Fechar menu"
                                            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                                        >
                                            <X className="h-5 w-5" aria-hidden />
                                        </button>
                                    </DialogPrimitive.Close>
                                </div>
                                <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto p-2">
                                    <Link href={HOME_HREF} onClick={() => setOpen(false)} className={rowClass(active?.kind === "home")} aria-current={active?.kind === "home" ? "page" : undefined}>
                                        <Home className="h-5 w-5 shrink-0" aria-hidden />
                                        Início
                                    </Link>
                                    {categories.map((category) => {
                                        const isExpanded = expanded.has(category.id)
                                        const isActive = activeCategoryId === category.id
                                        const sectionId = `header-mobile-section-${category.id}`
                                        const CategoryIcon = category.icon
                                        return (
                                            <div key={category.id}>
                                                <button
                                                    type="button"
                                                    aria-expanded={isExpanded}
                                                    aria-controls={sectionId}
                                                    data-active={isActive ? "true" : undefined}
                                                    onClick={() => toggle(category.id)}
                                                    className={cn(rowClass(false), isActive && "text-white")}
                                                >
                                                    <CategoryIcon className="h-5 w-5 shrink-0" aria-hidden />
                                                    <span className="flex-1 text-left">{category.label}</span>
                                                    <ChevronDown className={cn("h-4 w-4 opacity-60 transition-transform", isExpanded && "rotate-180")} aria-hidden />
                                                </button>
                                                {isExpanded && (
                                                    <ul id={sectionId} className="ml-4 space-y-1 border-l border-white/10 py-1 pl-2">
                                                        {category.items.map((item) => {
                                                            const isItemActive = active?.kind === "item" && active.href === item.href
                                                            const Icon = item.icon
                                                            return (
                                                                <li key={item.href}>
                                                                    <Link href={item.href} onClick={() => setOpen(false)} className={rowClass(isItemActive)} aria-current={isItemActive ? "page" : undefined}>
                                                                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                                                                        {item.label}
                                                                    </Link>
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        )
                                    })}
                                </nav>
                            </motion.div>
                        </DialogPrimitive.Content>
                    </DialogPrimitive.Portal>
                )}
            </AnimatePresence>
        </DialogPrimitive.Root>
    )
}
