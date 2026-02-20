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
import { useState, useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isExpanded, toggle, isHydrated } = useSidebar()
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    const marginLeft = isMobile ? "0" : isHydrated ? (isExpanded ? "280px" : "72px") : "72px"

    return (
        <div className="flex min-h-screen w-full bg-background">
            {/* Desktop Sidebar - Fixed */}
            <ExpandableSidebar isExpanded={isExpanded} />

            {/* Main Content Area - With left margin to account for sidebar */}
            <div
                className="flex flex-1 flex-col transition-all duration-300"
                style={{
                    marginLeft,
                }}
            >
                {/* Topbar */}
                <header
                    className={cn(
                        "flex h-14 items-center gap-4 border-b border-white/5 px-4 lg:h-[60px] lg:px-6",
                        glassConfig.sidebar.blur,
                        "bg-black/40",
                    )}
                >
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
