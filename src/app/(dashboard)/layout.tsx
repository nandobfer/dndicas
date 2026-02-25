"use client"

import { UserButton, SignedIn, SignedOut } from "@clerk/nextjs"
import { Button } from "@/core/ui/button"
import { Menu, Package2, User } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSidebar } from "@/hooks/useSidebar"
import { ExpandableSidebar } from "@/components/ui/expandable-sidebar"
import { motionConfig } from "@/lib/config/motion-configs"
import { themeConfig } from "@/lib/config/theme-config"
import { cn } from "@/core/utils"
import { useState, useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isExpanded, expand, collapse, toggle, isHydrated } = useSidebar()
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
            {/* Unified Sidebar for Desktop and Mobile */}
            <ExpandableSidebar isExpanded={isExpanded} onExpand={expand} onCollapse={collapse} isMobile={isMobile} onToggle={toggle} />

            {/* Mobile Toggle Trigger */}
            {isMobile && !isExpanded && (
                <div className="md:hidden fixed top-4 left-4 z-50">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={expand}
                        className="shrink-0 text-white/70 hover:text-white hover:bg-white/10 bg-black/20 backdrop-blur-md border border-white/10 rounded-full h-10 w-10 shadow-lg"
                    >
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Abrir menu</span>
                    </Button>
                </div>
            )}

            {/* Main Content Area - With left margin only on desktop */}
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
