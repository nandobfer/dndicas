"use client"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { usePermissions } from "@nandobfer/perfix/react"
import { Button } from "@/core/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/core/ui/tabs"
import { GlassCard as Card } from "@/components/ui/glass-card"
import api from "@/core/utils/api"
import { toast } from "sonner"
import { RolesPage } from "./RolesPage"
import type { RoleDto } from "../types"
interface Settings { defaultRoleId: string | null; version: number; roleOptions: RoleDto[] }
export function PerfixEditorForm() {
    const access = usePermissions()
    const params = useSearchParams()
    const [tab, setTab] = useState(params.get("tab") === "perfis" ? "perfis" : "geral")
    const query = useQuery({ queryKey: ["perfix", "settings"], queryFn: async () => (await api.get<{ data: Settings }>("/perfix/settings")).data.data })
    return <Card className="p-6"><h1 className="mb-4 text-xl font-semibold">Perfix</h1><Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="geral">Geral</TabsTrigger>{access.can("roles.view") && <TabsTrigger value="perfis">Perfis</TabsTrigger>}</TabsList>
        <TabsContent value="geral">{query.isPending ? <p role="status">Carregando configuração...</p> : query.isError || !query.data ? <p role="alert">Não foi possível carregar a configuração. <Button onClick={() => void query.refetch()}>Tentar novamente</Button></p> : <SignupSection key={`${query.data.version}`} settings={query.data} />}</TabsContent>
        {access.can("roles.view") && <TabsContent value="perfis"><RolesPage /></TabsContent>}
    </Tabs></Card>
}
function SignupSection({ settings }: { settings: Settings }) {
    const access = usePermissions()
    const client = useQueryClient()
    const [selected, setSelected] = useState(settings.defaultRoleId ?? "")
    const mutation = useMutation({ mutationFn: async () => api.patch("/perfix/settings", { defaultRoleId: selected || null, version: settings.version }), onSuccess: () => { toast.success("Perfil padrão atualizado"); void client.invalidateQueries({ queryKey: ["perfix", "settings"] }) }, onError: error => toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Não foi possível salvar") })
    return <div className="space-y-4 py-4"><label className="block space-y-2"><span>Perfil padrão de novos usuários</span><select className="block w-full rounded border bg-background p-3" value={selected} disabled={!access.can("integrations.perfix.edit") || mutation.isPending} onChange={event => setSelected(event.target.value)}><option value="">Sem perfil — cadastro indisponível</option>{settings.roleOptions.filter(role => role.ativo && role.slug !== "admin" && !role.permissoes.includes("*")).map(role => <option key={role.id} value={role.id}>{role.nome}</option>)}</select></label><p className="text-sm text-muted-foreground">Aplica-se ao cadastro local, primeiro login Google e criação administrativa sem perfis informados.</p>{!selected && <p role="alert">Sem perfil padrão válido, novos cadastros serão bloqueados.</p>}
        {access.can("integrations.perfix.edit") && <Button disabled={mutation.isPending || selected === (settings.defaultRoleId ?? "")} onClick={() => { if (!selected && !window.confirm("Desabilitar novos cadastros?")) return; mutation.mutate() }}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>}
    </div>
}
