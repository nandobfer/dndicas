"use client"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import api from "@/core/utils/api"
import type { ViewAsRoleOption, ViewAsUserOption } from "../components/view-as/types"
interface Options { roles: ViewAsRoleOption[]; users: ViewAsUserOption[] }
const headers = { "x-perfix-view-as": "none" }
export function useViewAsRoles(enabled: boolean) {
    return useQuery({ queryKey: ["view-as", "roles"], queryFn: async ({ signal }) => (await api.get<{ data: Options }>("/perfix/view-as", { signal, headers })).data.data.roles, enabled })
}
export function useViewAsUsers(search: string, enabled: boolean) {
    const [term, setTerm] = useState(search.trim())
    useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer) }, [search])
    const query = useQuery({ queryKey: ["view-as", "users", term], queryFn: async ({ signal }) => ({ items: (await api.get<{ data: Options }>("/perfix/view-as", { signal, headers, params: { q: term } })).data.data.users }), enabled })
    return { ...query, term }
}
