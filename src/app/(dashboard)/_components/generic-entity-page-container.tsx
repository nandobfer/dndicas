"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { EntityPage } from "@/features/rules/components/entity-page"
import { entityConfig } from "@/lib/config/entities"

interface GenericEntityPageProps {
    entityTypeKey: "Regra" | "Habilidade" | "Talento" | "Magia"
}

export default function GenericEntityPage({ entityTypeKey }: GenericEntityPageProps) {
    const params = useParams()
    const slug = params.slug as string
    const config = entityConfig[entityTypeKey]

    const { data: item, isLoading } = useQuery({
        queryKey: [entityTypeKey.toLowerCase(), slug],
        queryFn: async () => {
            // Decodes slug to possible name (slug is the name from URL)
            const name = decodeURIComponent(slug).replace(/-/g, " ")
            
            // Search by name in the API
            const endpoint = config.provider!.endpoint()
            const separator = endpoint.includes('?') ? '&' : '?'
            const res = await fetch(`${endpoint}${separator}search=${encodeURIComponent(name)}&searchField=name`)
            
            if (!res.ok) return null
            const data = await res.json()
            
            // The search might return one or more items, pick the best match
            const items = Array.isArray(data) ? data : (data.items || data.spells || data.traits || data.rules || data.feats || [])
            
            // Find exact name match
            return items.find((i: any) => i.name.toLowerCase() === name.toLowerCase()) || items[0] || null
        },
        enabled: !!slug && !!config.provider
    })

    return (
        <EntityPage 
            item={item} 
            entityType={entityTypeKey} 
            isLoading={isLoading} 
        />
    )
}
