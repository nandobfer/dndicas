"use client"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { usePermissions } from "@nandobfer/perfix/react"
import { Button } from "@/core/ui/button"
import { Settings, ShieldCheck } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/ui/select"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { GlassCard as Card } from "@/components/ui/glass-card"
import api from "@/core/utils/api"
import { toast } from "sonner"
import { RolesPage } from "./RolesPage"
import type { RoleDto } from "../types"
type PerfixTab = "geral" | "perfis"
/** O Radix não aceita item com valor vazio: "sem perfil" usa um sentinela convertido para `null` ao salvar. */
export const NO_DEFAULT_ROLE = "none"
const noop = () => undefined
interface Settings { defaultRoleId: string | null; version: number; roleOptions: RoleDto[] }
export function PerfixEditorForm() {
    const access = usePermissions()
    const params = useSearchParams()
    const [tab, setTab] = useState<PerfixTab>(params.get("tab") === "perfis" && access.can("roles.view") ? "perfis" : "geral")
    const tabs: IntegrationTabDef<PerfixTab>[] = [{ id: "geral", label: "Geral", icon: Settings }, ...(access.can("roles.view") ? [{ id: "perfis" as const, label: "Perfis", icon: ShieldCheck }] : [])]
    const query = useQuery({ queryKey: ["perfix", "settings"], queryFn: async () => (await api.get<{ data: Settings }>("/perfix/settings")).data.data })
    return <Card className="p-6"><h1 className="mb-4 text-xl font-semibold">Perfix</h1><IntegrationTabs<PerfixTab> tabs={tabs} active={tab} onSelect={setTab} pendingTab={null} onConfirmDiscard={noop} onCancelDiscard={noop} label="Seções do Perfix">
        {tab === "geral" && <div>{query.isPending ? <p role="status">Carregando configuração...</p> : query.isError || !query.data ? <p role="alert">Não foi possível carregar a configuração. <Button onClick={() => void query.refetch()}>Tentar novamente</Button></p> : <SignupSection key={`${query.data.version}`} settings={query.data} />}</div>}
        {tab === "perfis" && access.can("roles.view") && <RolesPage />}
    </IntegrationTabs></Card>
}
function SignupSection({ settings }: { settings: Settings }) {
    const access = usePermissions()
    const client = useQueryClient()
    const [selected, setSelected] = useState(settings.defaultRoleId ?? "")
    const mutation = useMutation({ mutationFn: async () => api.patch("/perfix/settings", { defaultRoleId: selected || null, version: settings.version }), onSuccess: () => { toast.success("Perfil padrão atualizado"); void client.invalidateQueries({ queryKey: ["perfix", "settings"] }) }, onError: error => toast.error((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Não foi possível salvar") })
    return <div className="space-y-4 py-4"><div className="space-y-2"><span id="perfix-default-role-label">Perfil padrão de novos usuários</span><Select value={selected || NO_DEFAULT_ROLE} disabled={!access.can("integrations.perfix.edit") || mutation.isPending} onValueChange={value => setSelected(value === NO_DEFAULT_ROLE ? "" : value)}><SelectTrigger aria-labelledby="perfix-default-role-label" className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NO_DEFAULT_ROLE}>Sem perfil — cadastro indisponível</SelectItem>{settings.roleOptions.filter(role => role.ativo && role.slug !== "admin" && !role.permissoes.includes("*")).map(role => <SelectItem key={role.id} value={role.id}>{role.nome}</SelectItem>)}</SelectContent></Select></div><p className="text-sm text-muted-foreground">Aplica-se ao cadastro local, primeiro login Google e criação administrativa sem perfis informados.</p>{!selected && <p role="alert">Sem perfil padrão válido, novos cadastros serão bloqueados.</p>}
        {access.can("integrations.perfix.edit") && <Button disabled={mutation.isPending || selected === (settings.defaultRoleId ?? "")} onClick={() => { if (!selected && !window.confirm("Desabilitar novos cadastros?")) return; mutation.mutate() }}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>}
    </div>
}
