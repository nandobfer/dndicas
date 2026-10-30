"use client"
import { useQuery } from "@tanstack/react-query"
import api from "@/core/utils/api"
import { Checkbox } from "@/core/ui/checkbox"
import type { RoleDto } from "../types"
import { RoleChip } from "./permissions/RoleChip"
export function RoleAssignment({ value, onChange, disabled }: { value?: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
    const query = useQuery({ queryKey: ["perfix", "assignable"], queryFn: async () => (await api.get<{ data: (RoleDto & { bloqueado: boolean; motivo?: string })[] }>("/perfix/assignable-roles")).data.data })
    return <div className="space-y-2">{!value && <p className="text-xs text-muted-foreground">Sem seleção explícita: será usado o perfil padrão.</p>}{query.isPending ? <p>Carregando perfis...</p> : query.isError ? <p role="alert">Não foi possível carregar os perfis.</p> : query.data?.map(role => <label key={role.id} className="flex items-center gap-2 text-sm" title={role.motivo}><Checkbox checked={value?.includes(role.id) ?? false} disabled={disabled || role.bloqueado} onCheckedChange={checked => onChange(checked === true ? [...value ?? [], role.id] : value?.filter(id => id !== role.id) ?? [])} /><RoleChip cargo={role} /></label>)}</div>
}
