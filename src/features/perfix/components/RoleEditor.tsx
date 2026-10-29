"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@nandobfer/perfix/react"
import { canManageRole } from "@nandobfer/perfix"
import { ArrowLeft, History, KeyRound, Settings, Users } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import { GlassCard as Card } from "@/components/ui/glass-card"
import { Button } from "@/core/ui/button"
import { Input } from "@/core/ui/input"
import { Textarea } from "@/core/ui/textarea"
import { Field } from "./Field"
import { Checkbox } from "@/core/ui/checkbox"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { Label } from "@/core/ui/label"
import { roleSchema } from "../schemas"
import { useAccessMutation, useRole, useUsers, type RoleDetail } from "../hooks/usePerfixAdmin"
import { useAppSession } from "./PerfixProvider"
import { PermissionTree } from "./permissions/PermissionTree"
import { RoleColorSelect } from "./RoleColorSelect"

export function RolePage({ id }: { id?: string }) {
    const query = useRole(id)
    if (id && query.isPending) return <p role="status">Carregando perfil...</p>
    if (id && !query.data) return <p role="alert">Não foi possível carregar o perfil. <Button variant="ghost" onClick={() => void query.refetch()}>Tentar novamente</Button></p>
    return <>{query.isError && <p role="alert">Não foi possível atualizar os dados do perfil. Seu rascunho foi preservado.</p>}<RoleEditor key={id ?? "new"} role={query.data} /></>
}

type RoleTab = "geral" | "permissoes" | "membros" | "log"
const noop = () => undefined

function RoleEditor({ role: incomingRole }: { role?: RoleDetail }) {
    // A versão é a da abertura do editor, nunca a de um refetch sobre um rascunho antigo.
    const [role] = useState(incomingRole)
    const reducedMotion = useReducedMotion()
    const router = useRouter()
    const { session } = useAppSession()
    const access = usePermissions()
    const admin = role?.slug === "admin"
    const readOnly = !access.can("roles.edit") || (admin ? !access.isAdmin : !canManageRole(access.roles, role ?? { permissoes: [] }))
    const canMembers = !readOnly && access.can("users.edit")
    const users = useUsers(!!role && access.can("users.view"))
    const mutation = useAccessMutation()
    const [tab, setTab] = useState<RoleTab>("geral")
    const [search, setSearch] = useState("")
    const [draft, setDraft] = useState({ nome: role?.nome ?? "", descricao: role?.descricao ?? "", cor: role?.cor ?? "roxo", ativo: role?.ativo ?? true, permissoes: role?.permissoes ?? [] })
    const [members, setMembers] = useState<string[]>(role?.membros ?? [])
    const initial = { nome: role?.nome ?? "", descricao: role?.descricao ?? "", cor: role?.cor ?? "roxo", ativo: role?.ativo ?? true, permissoes: role?.permissoes ?? [] }
    const changedMembers = members.length !== (role?.membros.length ?? 0) || members.some(id => !role?.membros.includes(id))
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || changedMembers
    useEffect(() => {
        const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = "" } }
        const follow = (event: MouseEvent) => {
            const link = (event.target as Element).closest?.("a[href]")
            if (dirty && link && !window.confirm("Descartar as alterações do perfil?")) { event.preventDefault(); event.stopPropagation() }
        }
        window.addEventListener("beforeunload", leave); document.addEventListener("click", follow, true)
        return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", follow, true) }
    }, [dirty])
    const cancel = () => { if (!mutation.isPending && (!dirty || window.confirm("Descartar as alterações do perfil?"))) router.push("/integracoes/perfix?tab=perfis") }
    const save = async () => {
        const parsed = roleSchema.safeParse(admin ? { ...draft, permissoes: [] } : draft)
        if (!parsed.success) { setTab("geral"); toast.error(parsed.error.issues[0]?.message); return }
        const { nome, descricao, cor } = parsed.data
        const data = role ? { ...(admin ? { nome, descricao, cor } : parsed.data), version: role.version, ...(canMembers && changedMembers ? { membros: members } : {}) } : parsed.data
        try { await mutation.mutateAsync({ path: role ? `/roles/${role.id}` : "/roles", method: role ? "patch" : "post", data }); router.push("/integracoes/perfix?tab=perfis") } catch { /* conserva o rascunho */ }
    }
    const tabs: IntegrationTabDef<RoleTab>[] = [
        { id: "geral", label: "Geral", icon: Settings },
        { id: "permissoes", label: "Permissões", icon: KeyRound },
        ...(role && access.can("users.view") ? [{ id: "membros" as const, label: "Membros", icon: Users }] : []),
        ...(role ? [{ id: "log" as const, label: "Log de Auditoria", icon: History }] : []),
    ]
    const removed = role?.permissoes.filter(key => !draft.permissoes.includes(key)).length ?? 0
    return <div className="flex flex-col gap-6">
        {/* Composição original de integrations/components/detail/DetailHeader.tsx do Opex. */}
        <motion.div initial={reducedMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3"><Button size="icon" variant="ghost" className="mt-0.5" aria-label="Voltar para Perfis" onClick={cancel}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="flex items-center gap-3 text-lg font-semibold md:text-2xl">{role ? role.nome : "Novo Perfil"}</h1><p className="mt-1 text-sm text-muted-foreground">{readOnly ? "Visualização do perfil" : "Defina as permissões e os membros"}</p></div></motion.div>
        <Card>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); void save() }}>
            <div className="min-h-0 flex-1 overflow-auto p-6">
                <IntegrationTabs<RoleTab> tabs={tabs} active={tab} onSelect={setTab} pendingTab={null} onConfirmDiscard={noop} onCancelDiscard={noop} label="Seções do perfil">
                    {tab === "geral" && <div className="space-y-4">
                        <Field id="role-name" label="Nome"><Input id="role-name" value={draft.nome} disabled={readOnly || mutation.isPending} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field>
                        <Field id="role-description" label="Descrição"><Textarea id="role-description" value={draft.descricao} disabled={readOnly || mutation.isPending} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></Field>
                        <div className="space-y-1.5"><Label className="text-xs font-semibold">Cor</Label><RoleColorSelect value={draft.cor} disabled={readOnly || mutation.isPending} onChange={cor => setDraft({ ...draft, cor })} /></div>
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.ativo} disabled={readOnly || admin || mutation.isPending} onCheckedChange={value => setDraft({ ...draft, ativo: value === true })} />Perfil ativo</label>
                    </div>}
                    {tab === "permissoes" && <div className="space-y-3">{!!removed && <p className="text-sm text-warning">Os membros perderão {removed} permissão(ões) ao salvar.</p>}<PermissionTree selected={new Set(draft.permissoes)} onChange={next => setDraft({ ...draft, permissoes: [...next] })} readOnly={readOnly || admin || mutation.isPending} /></div>}
                    {tab === "membros" && role && access.can("users.view") && <div className="space-y-3">
                        <Input aria-label="Buscar membros" placeholder="Buscar usuário" value={search} onChange={event => setSearch(event.target.value)} />
                        {users.isPending && <p>Carregando membros...</p>}{users.isError && <p role="alert">Não foi possível carregar usuários.</p>}
                        {(users.data ?? []).filter(user => `${user.nome} ${user.email}`.toLowerCase().includes(search.toLowerCase())).map(user => <label className="flex items-center gap-3 rounded-lg border p-3 text-sm" key={user.id}><Checkbox checked={members.includes(user.id)} disabled={!canMembers || !user.gerenciavel || session?.user.id === user.id || mutation.isPending || (!draft.ativo && !members.includes(user.id))} onCheckedChange={value => setMembers(value ? [...members, user.id] : members.filter(id => id !== user.id))} /><span>{user.nome}<span className="block text-xs text-muted-foreground">{user.email}</span></span></label>)}
                    </div>}
                    {tab === "log" && role && <div className="space-y-3"><p className="text-sm text-muted-foreground">Criado em {format(new Date(role.createdAt), "dd/MM/yyyy HH:mm")} · Última alteração em {format(new Date(role.updatedAt), "dd/MM/yyyy HH:mm")}</p>{role.audit.map(event => <div key={event.id} className="rounded-lg border p-3 text-sm"><p>{event.action}</p><p className="text-xs text-muted-foreground">{format(new Date(event.createdAt), "dd/MM/yyyy HH:mm")} · Ator: {event.actorId}{event.simulation ? " · Em simulação" : ""}</p></div>)}</div>}
                </IntegrationTabs>
            </div>
            <footer className="flex justify-end gap-2 border-t p-4"><Button type="button" variant="outline" onClick={cancel} disabled={mutation.isPending}>{readOnly ? "Fechar" : "Cancelar"}</Button>{!readOnly && <Button type="submit" disabled={!dirty || mutation.isPending || (changedMembers && (users.isPending || users.isError))}>{mutation.isPending ? "Salvando..." : "Salvar"}</Button>}</footer>
        </form>
        </Card>
    </div>
}
