"use client"

/**
 * @fileoverview ExpandableSidebar component with Liquid Glass styling.
 * Animated expand/collapse with smooth transitions under 400ms (SC-002).
 *
 * @example
 * ```tsx
 * <ExpandableSidebar isExpanded={isExpanded} onToggle={toggle}>
 *   <SidebarItem ... />
 * </ExpandableSidebar>
 * ```
 */

import * as React from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Home, User, Sparkles, FileText, Users, Scroll, Zap, Wand, AtSign, MessageSquare, Sword, ShieldCheck, Fingerprint, Backpack, ScrollText, Skull, LogOut, type LucideIcon } from "lucide-react"
import { cn } from "@/core/utils"
import { glassConfig } from "@/lib/config/glass-config"
import { motionConfig } from "@/lib/config/motion-configs"
import { SidebarItem, SidebarSection } from "./sidebar-item"
import { TooltipProvider } from "@/core/ui/tooltip"
import { useAuth } from "@/core/hooks/useAuth"
import { APP_VERSION } from "@/lib/config/version"

export interface ExpandableSidebarProps {
    /** Whether sidebar is expanded */
    isExpanded: boolean
    /** Expand callback */
    onExpand: () => void
    /** Collapse callback */
    onCollapse: () => void
    /** Whether it's mobile view */
    isMobile?: boolean
    /** Additional CSS classes */
    className?: string
}

/**
 * Navigation items configuration.
 * Updated per T020: renamed "Módulos" to "Cadastros" and added "Usuários".
 */
const mainItems = [
    { label: "Início", href: "/", icon: Home },
    { label: "Perfil", href: "/profile", icon: User, authenticated: true },
    { label: "Minhas Fichas", href: "/my-sheets", icon: ScrollText },
    { label: "Meus NPCs", href: "/my-npcs", icon: Users, authenticated: true },
]

// T020: Renamed from "Módulos" to "Cadastros" and added "Usuários"
// T032: Added "Habilidades" for traits catalog
// T008: Added "Talentos" for feats catalog
const cadastrosItems = [
    { label: "Classes", href: "/classes", icon: Sword },
    { label: "Raças", href: "/races", icon: Fingerprint },
    { label: "Origens", href: "/backgrounds", icon: ShieldCheck },
    { label: "Regras", href: "/rules", icon: Scroll },
    { label: "Habilidades", href: "/traits", icon: Sparkles },
    { label: "Talentos", href: "/feats", icon: Zap },
    { label: "Magias", href: "/spells", icon: Wand },
    { label: "Itens", href: "/items", icon: Backpack },
    { label: "Monstros", href: "/monsters", icon: Skull },
]

const adminItems = [
    { label: "Feedback", href: "/feedback", icon: MessageSquare },
    { label: "Usuários", href: "/users", icon: Users, admin: true },
    { label: "Fichas", href: "/sheets", icon: ScrollText, admin: true },
    { label: "Logs", href: "/audit-logs", icon: FileText, admin: true },
    { label: "Referências Pendentes", href: "/admin/mentions", icon: AtSign, admin: true }
]

/**
 * Expandable sidebar component with Liquid Glass styling and smooth animations.
 * Sidebar width: 280px expanded, 72px collapsed (per themeConfig.spacing.sidebar).
 */
type NavigationItem = {
    label: string
    href: string
    icon: LucideIcon
    authenticated?: boolean
    admin?: boolean
}

export const ExpandableSidebar: React.FC<ExpandableSidebarProps> = ({ isExpanded, onExpand, onCollapse, isMobile = false, className }) => {
    const pathname = usePathname()
    const router = useRouter()
    const { isSignedIn, isAdmin, fullName, email, imageUrl, signOut } = useAuth()
    const [isSigningOut, setIsSigningOut] = React.useState(false)
    const displayName = fullName || email || "Usuário"

    // Slower transition for mobile
    const transition = isMobile ? motionConfig.mobileSidebarTransition : motionConfig.sidebarTransition

    // Mobile variants: Slide from left instead of just resizing
    const sidebarVariants = isMobile
        ? {
              expanded: { x: 0, width: 280, minWidth: 280 },
              collapsed: { x: -280, width: 280, minWidth: 280 }
          }
        : motionConfig.variants.sidebar

    const filterItems = (items: NavigationItem[]) =>
        items.filter((item) => {
            if (item.admin && !isAdmin) return false
            if (item.authenticated && !isSignedIn) return false
            return true
        })

    const visibleMainItems = filterItems(mainItems)
    const visibleCadastrosItems = filterItems(cadastrosItems)
    const visibleAdminItems = filterItems(adminItems)

    const handleItemClick = () => {
        if (isMobile) {
            onCollapse()
        }
    }

    const handleSignOut = async () => {
        if (isSigningOut) return
        setIsSigningOut(true)
        try {
            await signOut("/sign-in")
            if (isMobile) onCollapse()
            router.replace("/sign-in")
            router.refresh()
        } finally {
            setIsSigningOut(false)
        }
    }

    return (
        <TooltipProvider>
            {/* Mobile Backdrop */}
            {isMobile && (
                <motion.div
                    initial={false}
                    animate={{ opacity: isExpanded ? 1 : 0, pointerEvents: isExpanded ? "auto" : "none" }}
                    className="fixed inset-0  z-50 md:hidden"
                    onClick={onCollapse}
                />
            )}

            <motion.aside
                onMouseEnter={!isMobile ? onExpand : undefined}
                onMouseLeave={!isMobile ? onCollapse : undefined}
                className={cn(
                    "flex flex-col fixed left-0 top-0 h-screen z-40 transition-shadow duration-300",
                    "border-r border-white/5",
                    glassConfig.sidebar.blur,
                    glassConfig.sidebar.background,
                    isExpanded && "shadow-2xl shadow-black/50",
                    isMobile && "z-[60]",
                    className
                )}
                variants={sidebarVariants}
                initial={false}
                animate={isExpanded ? "expanded" : "collapsed"}
                transition={transition}
            >
                {/* Logo/Brand Header Area */}
                <div className={cn("flex h-14 items-center border-b border-white/5 lg:h-[60px]")}>
                    <Link href="/" className="flex items-center gap-2 font-semibold text-white truncate w-full" onClick={handleItemClick}>
                        <div className="flex-shrink-0 w-[72px] flex items-center justify-center">
                            <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" width={44} height={44} className="w-15 object-contain" />
                        </div>
                        {isExpanded && (
                            <motion.span
                                className="truncate"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={motionConfig.sidebarTransition}
                            >
                                Dungeons & Dicas
                            </motion.span>
                        )}
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2">
                    <div className="space-y-6">
                        {/* Main Items */}
                        <div className="space-y-1">
                            {visibleMainItems.map((item) => (
                                <SidebarItem
                                    key={item.href}
                                    href={item.href}
                                    icon={item.icon}
                                    label={item.label}
                                    isExpanded={isExpanded}
                                    isActive={pathname === item.href}
                                    onClick={handleItemClick}
                                />
                            ))}
                        </div>

                        {/* Cadastros (formerly Módulos) - T020 */}
                        {visibleCadastrosItems.length > 0 && (
                            <SidebarSection isExpanded={isExpanded}>
                                {visibleCadastrosItems.map((item) => (
                                    <SidebarItem
                                        key={item.href}
                                        href={item.href}
                                        icon={item.icon}
                                        label={item.label}
                                        isExpanded={isExpanded}
                                        isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                                        onClick={handleItemClick}
                                    />
                                ))}
                            </SidebarSection>
                        )}

                        {/* Admin */}
                        {visibleAdminItems.length > 0 && (
                            <SidebarSection isExpanded={isExpanded}>
                                {visibleAdminItems.map((item) => (
                                    <SidebarItem
                                        key={item.href}
                                        href={item.href}
                                        icon={item.icon}
                                        label={item.label}
                                        isExpanded={isExpanded}
                                        isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                                        onClick={handleItemClick}
                                    />
                                ))}
                            </SidebarSection>
                        )}
                    </div>
                </nav>

                {/* User Area Footer */}
                <div className={cn("border-t border-white/5 mt-auto py-4 px-2")}>
                    {isSignedIn ? (
                        <div className="space-y-3">
                            <Link
                                href="/profile"
                                className="flex w-full items-center gap-3 pl-[18px] pr-3 transition-all"
                                title={displayName}
                                onClick={handleItemClick}
                            >
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-white/70">
                                    {imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={imageUrl} alt={displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <User className="h-4 w-4" />
                                    )}
                                </div>
                                {isExpanded && (
                                    <motion.div
                                        className="flex min-w-0 flex-col overflow-hidden"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={motionConfig.sidebarTransition}
                                    >
                                        <span className="truncate text-sm font-medium text-white">{displayName}</span>
                                        <span className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-white/30">{APP_VERSION}</span>
                                    </motion.div>
                                )}
                            </Link>
                            {isExpanded && (
                                <motion.button
                                    type="button"
                                    onClick={() => void handleSignOut()}
                                    disabled={isSigningOut}
                                    className="ml-3 flex items-center gap-2 text-xs font-medium text-white/45 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={motionConfig.sidebarTransition}
                                >
                                    <LogOut className="h-3.5 w-3.5" />
                                    {isSigningOut ? "Saindo..." : "Sair"}
                                </motion.button>
                            )}
                        </div>
                    ) : (
                        <div className={cn("flex items-center gap-3", !isExpanded && "justify-center")}>
                            <Link
                                href="/sign-in"
                                className="flex w-full items-center gap-3 pl-[18px] pr-3 transition-all"
                                title="Acessar conta"
                                onClick={handleItemClick}
                            >
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 hover:text-white transition-colors">
                                    <User className="h-4 w-4" />
                                </div>
                                {isExpanded && (
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-medium text-white/70 truncate">Entrar / Cadastrar</span>
                                        <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Acessar</span>
                                    </div>
                                )}
                            </Link>
                        </div>
                    )}
                </div>
            </motion.aside>
        </TooltipProvider>
    )
}

ExpandableSidebar.displayName = "ExpandableSidebar"
