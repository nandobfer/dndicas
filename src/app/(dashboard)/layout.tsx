"use client"

import { UserButton } from "@clerk/nextjs"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/core/ui/sheet"
import { Button } from "@/core/ui/button"
import { VisuallyHidden } from "@/core/ui/visually-hidden"
import { Menu, Package2 } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSidebar } from "@/hooks/useSidebar"
import { ExpandableSidebar } from "@/components/ui/expandable-sidebar"
import { SidebarToggleButton } from "@/components/ui/sidebar-toggle-button"
import { Sidebar } from "@/core/ui/layout/sidebar"
import { glassConfig } from "@/lib/config/glass-config"
import { motionConfig } from "@/lib/config/motion-configs"
import { themeConfig } from "@/lib/config/theme-config"
import { cn } from "@/core/utils"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isExpanded, toggle, isHydrated } = useSidebar()

    return (
        <div className="flex min-h-screen w-full bg-background">
            {/* Desktop Sidebar */}
            <ExpandableSidebar isExpanded={isExpanded} />

            {/* Main Content Area */}
            <div className="flex flex-1 flex-col">
                {/* Topbar */}
                <header className={cn("flex h-14 items-center gap-4 border-b border-white/5 px-4 lg:h-[60px] lg:px-6", glassConfig.sidebar.blur, "bg-black/40")}>
                    {/* Mobile Menu */}
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0 md:hidden text-white/70 hover:text-white hover:bg-white/10">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Abrir menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className={cn("flex flex-col", glassConfig.sidebar.blur, glassConfig.sidebar.background)}>
                            <VisuallyHidden>
                                <SheetTitle>Menu de Navegação</SheetTitle>
                            </VisuallyHidden>
                            <nav className="grid gap-2 text-lg font-medium">
                                <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-white">
                                    <Package2 className="h-6 w-6" />
                                    <span>Dungeons & Dicas</span>
                                </Link>
                                <Sidebar className="mt-4" />
                            </nav>
                        </SheetContent>
                    </Sheet>

                    {/* Desktop Toggle Button */}
                    <SidebarToggleButton isExpanded={isExpanded} onToggle={toggle} className="hidden md:flex" />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* User Button */}
                    <UserButton afterSignOutUrl="/sign-in" />
                </header>

                {/* Page Content */}
                <motion.main
                    className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6"
                    variants={motionConfig.variants.fadeInUp}
                    initial="initial"
                    animate="animate"
                    transition={motionConfig.transitions.normal}
                >
                    {children}
                </motion.main>
            </div>
        </div>
    )
}
