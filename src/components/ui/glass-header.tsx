"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/core/hooks/useAuth"
import { HOME_HREF, getVisibleNavigation, resolveActiveNav } from "@/lib/config/navigation"
import { HeaderCategoryMenu } from "./header-category-menu"
import { HeaderMobileMenu } from "./header-mobile-menu"
import { HeaderUserMenu } from "./header-user-menu"

/** Altura do header fixo (o conteúdo do layout compensa com `pt-16`). */
export const GLASS_HEADER_HEIGHT = 64

/**
 * Header translúcido fixo do app (desktop e mobile), no lugar do antigo sidebar.
 * Desktop (a partir de `lg`): logo, "Início" + categorias ao centro e o usuário à direita.
 * Mobile: logo, avatar e o hambúrguer com o painel de categorias.
 */
export function GlassHeader() {
    const pathname = usePathname() ?? HOME_HREF
    const { isSignedIn, can } = useAuth()
    const categories = getVisibleNavigation({ isSignedIn, can })
    const active = resolveActiveNav(pathname, categories)

    return (
        <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/10 bg-black/40 backdrop-blur-sm">
            <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-6">
                <Link href={HOME_HREF} className="flex flex-shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30" aria-label="Dungeons & Dicas: Início">
                    <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" width={44} height={44} className="h-11 w-11 object-contain" priority />
                </Link>

                <nav aria-label="Navegação principal" className="hidden flex-1 justify-center lg:flex" data-testid="header-desktop-nav">
                    <HeaderCategoryMenu categories={categories} active={active} pathname={pathname} />
                </nav>

                <div className="flex flex-shrink-0 items-center gap-1">
                    <HeaderUserMenu />
                    <div className="lg:hidden" data-testid="header-mobile-nav">
                        <HeaderMobileMenu categories={categories} active={active} pathname={pathname} />
                    </div>
                </div>
            </div>
        </header>
    )
}
