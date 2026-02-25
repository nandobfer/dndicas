"use client"

import { UserButton, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/core/ui/sheet"
import { Button } from "@/core/ui/button"
import { VisuallyHidden } from "@/core/ui/visually-hidden"
import { Menu, Package2, User } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSidebar } from "@/hooks/useSidebar"
import { ExpandableSidebar } from "@/components/ui/expandable-sidebar"
import { Sidebar } from "@/core/ui/layout/sidebar"
import { glassConfig } from "@/lib/config/glass-config"
import { motionConfig } from "@/lib/config/motion-configs"
import { themeConfig } from "@/lib/config/theme-config"
import { cn } from "@/core/utils"
import { useState, useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isExpanded, expand, collapse, isHydrated } = useSidebar()
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    const marginLeft = isMobile ? "0" : isHydrated ? (isExpanded ? `${themeConfig.spacing.sidebar.expanded}px` : `${themeConfig.spacing.sidebar.collapsed}px`) : `${themeConfig.spacing.sidebar.collapsed}px`

    return (
        <div className="flex min-h-screen w-full bg-background">
            {/* Desktop Sidebar - Fixed */}
            <ExpandableSidebar isExpanded={isExpanded} onExpand={expand} onCollapse={collapse} />

            {/* Mobile Toggle - Floating when header is gone */}
            <div className="md:hidden fixed top-4 left-4 z-50">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-white/70 hover:text-white hover:bg-white/10 bg-black/20 backdrop-blur-md border border-white/10 rounded-full h-10 w-10"
                        >
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

                        <div className="mt-auto pt-4 border-t border-white/5">
                            <SignedIn>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-white/70 font-medium">Minha Conta</span>
                                    <UserButton afterSignOutUrl="/sign-in" />
                                </div>
                            </SignedIn>
                            <SignedOut>
                                <Link
                                    href="/sign-in"
                                    className="flex items-center justify-between w-full h-10 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    <span className="text-sm font-medium text-white/70">Acessar conta</span>
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50">
                                        <User className="h-4 w-4" />
                                    </div>
                                </Link>
                            </SignedOut>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Main Content Area - With left margin to account for sidebar */}
            <motion.div
                className="flex flex-1 flex-col"
                animate={{
                    marginLeft
                }}
                transition={motionConfig.sidebarTransition}
            >
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
            </motion.div>
        </div>
    )
}
