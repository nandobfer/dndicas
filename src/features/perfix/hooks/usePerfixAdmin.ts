"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { canManageUser } from "@nandobfer/perfix"
import { usePermissions } from "@nandobfer/perfix/react"
import api from "@/core/utils/api"
import { toast } from "sonner"
import type { RoleDto } from "../types"
import type { UserResponse } from "@/features/users/types/user.types"
export type RoleDetail = RoleDto & { membros: string[]; audit: { id: string; action: string; actorId: string; createdAt: string; simulation: unknown }[] }
export const useRoles = () => useQuery({ queryKey: ["perfix", "roles"], queryFn: async () => (await api.get<{ data: { roles: (RoleDto & { usuariosCount: number })[]; hierarchyVersion: number } }>("/perfix/roles")).data.data })
export const useRole = (id?: string) => useQuery({ queryKey: ["perfix", "role", id], enabled: !!id, queryFn: async () => (await api.get<{ data: RoleDetail }>(`/perfix/roles/${id}`)).data.data })
export function useUsers(enabled: boolean) {
    const access = usePermissions()
    return useQuery({ queryKey: ["perfix", "members"], enabled, queryFn: async () => {
        const all: UserResponse[] = []
        let page = 1, pages = 1
        do {
            const response = await api.get<{ data: { items: UserResponse[]; totalPages: number } }>("/users", { params: { status: "all", page, limit: 100 } })
            all.push(...response.data.data.items); pages = response.data.data.totalPages; page++
        } while (page <= pages)
        return all.map(user => ({ id: user.id, nome: user.name || user.username, email: user.email, gerenciavel: canManageUser(access.roles, user.roles) }))
    } })
}
export function useAccessMutation() {
    const client = useQueryClient()
    return useMutation({ mutationFn: async ({ path, method, data }: { path: string; method: "post" | "patch" | "delete"; data: unknown }) => (await api.request({ url: `/perfix${path}`, method, data })).data,
        onSuccess: async () => { await client.invalidateQueries({ queryKey: ["perfix"] }); toast.success("Alterações salvas") },
        onError: error => { const response = error as { response?: { data?: { error?: string } } }; toast.error(response.response?.data?.error ?? "Não foi possível salvar") } })
}
