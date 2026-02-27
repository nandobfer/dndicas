"use client"

import * as React from "react"
import { useDebounce } from "./useDebounce"

export interface SearchResult {
  _id: string
  type: "Regra" | "Magia" | "Habilidade" | "Talento"
  name: string
  description?: string
  source?: string
  status: "active" | "inactive"
}

const ENTITY_PROVIDERS = [
  {
    type: "Regra",
    endpoint: (q: string) => `/api/rules?search=${q}&limit=5&searchField=name`,
    map: (item: any) => ({
      ...item,
      type: "Regra",
    }),
  },
  {
    type: "Habilidade",
    endpoint: (q: string) => `/api/traits/search?q=${q}&limit=5`,
    map: (item: any) => ({
      ...item,
      type: "Habilidade",
    }),
  },
  {
    type: "Talento",
    endpoint: (q: string) => `/api/feats/search?query=${q}&limit=5`,
    map: (item: any) => ({
      status: "active",
      ...item,
      name: item.label || item.name,
      type: "Talento",
      description: item.metadata?.description || item.description,
    }),
  },
  {
    type: "Magia",
    endpoint: (q: string) => `/api/spells/search?q=${q}&limit=5`,
    map: (item: any) => ({
      status: "active",
      ...item,
      name: item.label || item.name,
      type: "Magia",
    }),
  },
]

export function useGlobalSearch() {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const debouncedQuery = useDebounce(query, 500)

  const performSearch = React.useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const fetchPromises = ENTITY_PROVIDERS.map(async (provider) => {
        try {
          const res = await fetch(provider.endpoint(q))
          if (!res.ok) return []
          const data = await res.json()
          
          let rawItems: any[] = []
          if (Array.isArray(data)) rawItems = data
          else if (data.items) rawItems = data.items
          else if (data.spells) rawItems = data.spells
          else if (data.traits) rawItems = data.traits
          else if (data.rules) rawItems = data.rules
          else if (data.feats) rawItems = data.feats

          return rawItems.map(provider.map)
        } catch (err) {
          console.error(`Search failed for ${provider.type}:`, err)
          return []
        }
      })

      const allResults = await Promise.all(fetchPromises)
      // Flatten and limit total results to a reasonable number
      setResults(allResults.flat())
    } catch (err) {
      console.error("Global search failed:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery, performSearch])

  return {
    query,
    setQuery,
    results,
    isLoading,
    isSearching: query !== debouncedQuery
  }
}
