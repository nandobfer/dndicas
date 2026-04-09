"use client"

import * as React from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"

interface EntityTitleLinkProps {
    name: string
    entityType: string
    className?: string
    style?: React.CSSProperties
    disableLink?: boolean
    hrefOverride?: string
}

export function EntityTitleLink({ name, entityType, className, style, disableLink = false, hrefOverride }: EntityTitleLinkProps) {
    // Determine route based on entity type
    const routeMap: Record<string, string> = {
        Regra: "rules",
        Habilidade: "traits",
        Talento: "feats",
        Magia: "spells",
        Classe: "classes",
        Origem: "backgrounds",
        Raça: "races",
        Item: "items",
    }

    const route = routeMap[entityType] || "rules"
    if (!name || disableLink)
        return (
            <h3 className={cn("text-sm font-bold text-white", className)} style={style}>
                {name}
            </h3>
        )

    const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))
    const href = hrefOverride || `/${route}/${slug}`

    return (
        <Link
            href={href}
            className={cn("group relative inline-flex items-center gap-2 cursor-pointer transition-colors", "hover:text-white group-hover:text-white", className)}
            style={style}
        >
            <motion.div whileHover={{ x: 4 }} className="flex items-center">
                <h3 className={cn("text-sm font-bold text-white relative", className)} style={style}>
                    {name}
                    <motion.span className="absolute -bottom-0.5 left-0 w-0 h-px bg-current opacity-50" whileHover={{ width: "100%" }} transition={{ duration: 0.2 }} />
                </h3>
            </motion.div>
        </Link>
    )
}
