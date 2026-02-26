"use client"

import { motion } from "framer-motion"
import { useSidebar } from "@/hooks/useSidebar"
import { ExpandableSidebar } from "@/components/ui/expandable-sidebar"
import { GlassHeader } from "@/components/ui/glass-header"
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

            {/* Mobile Header */}
            {isMobile && <GlassHeader onExpand={expand} />}

            {/* Main Content Area - With left margin only on desktop */}
            <motion.div
                className={cn("flex flex-1 flex-col min-w-0", isMobile && "pt-16")}
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
