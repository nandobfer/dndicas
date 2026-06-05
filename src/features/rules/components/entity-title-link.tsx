"use client"

import * as React from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@/core/utils"
import { getEntityDetailCacheValue, getEntityDetailQueryKey, getEntityHref, getEntitySlug } from "../utils/entity-navigation"

interface EntityTitleLinkProps {
    name: string
    entityType: string
    entity?: unknown
    className?: string
    style?: React.CSSProperties
    disableLink?: boolean
    hrefOverride?: string
}

export function EntityTitleLink({ name, entityType, entity, className, style, disableLink = false, hrefOverride }: EntityTitleLinkProps) {
    const queryClient = useQueryClient()

    if (!name || disableLink)
        return (
            <h3 className={cn("text-sm font-bold text-white", className)} style={style}>
                {name}
            </h3>
        )

    const slug = getEntitySlug(name)
    const href = hrefOverride || getEntityHref(entityType, name)

    const handleClick = () => {
        if (!entity) return

        queryClient.setQueryData(getEntityDetailQueryKey(entityType, slug), getEntityDetailCacheValue(entityType, entity))
    }

    return (
        <Link
            href={href}
            onClick={handleClick}
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
