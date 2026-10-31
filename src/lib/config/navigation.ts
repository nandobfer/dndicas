/**
 * @fileoverview Navegação principal do app (header desktop e painel mobile).
 * Regras puras: quais categorias/itens a pessoa vê e qual item corresponde à rota atual.
 * A autorização final continua no servidor; aqui só se decide o que mostrar.
 */

import {
    AtSign,
    Backpack,
    BookOpen,
    FileText,
    Fingerprint,
    PlugZap,
    Scroll,
    ScrollText,
    Shield,
    ShieldCheck,
    Skull,
    Sparkles,
    Sword,
    Swords,
    Users,
    Wand,
    Zap,
    type LucideIcon,
} from "lucide-react"
import { canNavigate } from "@/features/perfix/navigation"

export interface NavItem {
    label: string
    href: string
    icon: LucideIcon
    /** Só para quem está logado. */
    authenticated?: boolean
    /** Casa a rota atual com o item; padrão: a própria rota e suas subrotas. */
    match?: (pathname: string) => boolean
}

export type NavCategoryId = "fichas" | "campanhas" | "catalogo" | "administracao"

export interface NavCategory {
    id: NavCategoryId
    label: string
    icon: LucideIcon
    items: NavItem[]
}

export const HOME_HREF = "/"

/** Casa a rota e as subrotas por segmento (`/spells` casa `/spells/x`, não `/spellsx`). */
export function matchesRoute(pathname: string, href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
}

export const NAV_CATEGORIES: NavCategory[] = [
    {
        id: "fichas",
        label: "Fichas",
        icon: ScrollText,
        items: [
            {
                label: "Minhas Fichas",
                href: "/my-sheets",
                icon: ScrollText,
                // A ficha aberta (`/sheets/[...slug]`) pertence a "Minhas Fichas", mesmo aberta pelo admin.
                match: (pathname) => matchesRoute(pathname, "/my-sheets") || pathname.startsWith("/sheets/"),
            },
            { label: "Meus NPCs", href: "/my-npcs", icon: Users, authenticated: true },
        ],
    },
    {
        id: "campanhas",
        label: "Campanhas",
        icon: Swords,
        items: [{ label: "Campanhas Maddox", href: "/campanhas", icon: Swords, authenticated: true }],
    },
    {
        id: "catalogo",
        label: "Catálogo",
        icon: BookOpen,
        items: [
            { label: "Classes", href: "/classes", icon: Sword },
            { label: "Raças", href: "/races", icon: Fingerprint },
            { label: "Origens", href: "/backgrounds", icon: ShieldCheck },
            { label: "Regras", href: "/rules", icon: Scroll },
            { label: "Habilidades", href: "/traits", icon: Sparkles },
            { label: "Talentos", href: "/feats", icon: Zap },
            { label: "Magias", href: "/spells", icon: Wand },
            { label: "Itens", href: "/items", icon: Backpack },
            { label: "Monstros", href: "/monsters", icon: Skull },
        ],
    },
    {
        id: "administracao",
        label: "Administração",
        icon: Shield,
        items: [
            { label: "Usuários", href: "/users", icon: Users, authenticated: true },
            // Só a lista exata: a ficha aberta (`/sheets/x`) destaca "Minhas Fichas".
            { label: "Todas as fichas", href: "/sheets", icon: ScrollText, authenticated: true, match: (pathname) => pathname === "/sheets" },
            { label: "Logs", href: "/audit-logs", icon: FileText, authenticated: true },
            { label: "Referências Pendentes", href: "/admin/mentions", icon: AtSign, authenticated: true },
            { label: "Integrações", href: "/integracoes", icon: PlugZap, authenticated: true },
        ],
    },
]

export interface NavViewer {
    isSignedIn: boolean
    can: (permission: string) => boolean
}

/** Categorias com os itens visíveis para a pessoa; categorias vazias não aparecem. */
export function getVisibleNavigation(viewer: NavViewer, categories: NavCategory[] = NAV_CATEGORIES): NavCategory[] {
    return categories
        .map((category) => ({
            ...category,
            items: category.items.filter((item) => (!item.authenticated || viewer.isSignedIn) && canNavigate(item.href, viewer.can)),
        }))
        .filter((category) => category.items.length > 0)
}

export function itemMatches(item: NavItem, pathname: string) {
    return item.match ? item.match(pathname) : matchesRoute(pathname, item.href)
}

export type ActiveNav = { kind: "home" } | { kind: "item"; categoryId: NavCategoryId; href: string } | null

/** Onde a pessoa está: Início, um item de categoria (inclusive subtelas) ou nenhum destaque. */
export function resolveActiveNav(pathname: string, categories: NavCategory[] = NAV_CATEGORIES): ActiveNav {
    if (pathname === HOME_HREF) return { kind: "home" }
    for (const category of categories) {
        const item = category.items.find((candidate) => itemMatches(candidate, pathname))
        if (item) return { kind: "item", categoryId: category.id, href: item.href }
    }
    return null
}
