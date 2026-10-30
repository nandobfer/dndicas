"use client"
import { useState } from "react"
import Link from "next/link"
import { usePermissions } from "@nandobfer/perfix/react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { Button } from "@/core/ui/button"
import { Input } from "@/core/ui/input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { useAccessMutation, useRoles } from "../hooks/usePerfixAdmin"
import type { RoleDto } from "../types"
import { RoleChip } from "./permissions/RoleChip"
function SortableRole({ role, disabled, onDelete }: { role: RoleDto & { usuariosCount: number }; disabled: boolean; onDelete: () => void }) {
    const sortable = useSortable({ id: role.id, disabled })
    return <li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="flex items-center gap-3 py-3">
        <Button type="button" variant="ghost" size="icon" aria-label={`Reordenar ${role.nome}`} disabled={disabled} {...sortable.attributes} {...sortable.listeners}><GripVertical className="h-4 w-4" /></Button>
        <Link className="min-w-0 flex-1" href={`/integracoes/perfix/perfis/${role.id}`}><RoleChip cargo={role} /><p className="truncate text-xs text-muted-foreground">{role.descricao || "Sem descrição"}</p></Link>
        <span className="text-xs">{role.usuariosCount} membros · {role.ativo ? "Ativo" : "Inativo"}</span>
        {!disabled && <Button aria-label={`Excluir ${role.nome}`} variant="ghost" disabled={role.usuariosCount > 0} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>}
    </li>
}
export function RolesPage() {
    const query = useRoles()
    const mutation = useAccessMutation()
    const access = usePermissions()
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<StatusFilter>("all")
    const roles = query.data?.roles ?? []
    const rows = roles.filter(role => `${role.nome} ${role.descricao}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (status === "all" || role.ativo === (status === "active")))
    const editable = access.can("roles.edit") && access.isAdmin
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    function reorder(event: DragEndEvent) {
        if (!event.over || event.active.id === event.over.id || !editable) return
        const movable = roles.filter(role => role.slug !== "admin")
        const from = movable.findIndex(role => role.id === event.active.id), to = movable.findIndex(role => role.id === event.over!.id)
        if (from < 0 || to < 0) return
        mutation.mutate({ path: "/roles/reorder", method: "post", data: { ordem: arrayMove(movable, from, to).map(role => role.id), version: query.data!.hierarchyVersion } })
    }
    return <section className="space-y-4"><header className="flex justify-between"><div><h2 className="text-lg font-semibold">Perfis</h2><p className="text-sm text-muted-foreground">Permissões, hierarquia e membros</p></div>{editable && <Button asChild><Link href="/integracoes/perfix/perfis/novo"><Plus className="h-4 w-4" />Novo Perfil</Link></Button>}</header>
        <div className="flex gap-3"><Input aria-label="Buscar perfil" placeholder="Buscar por nome ou descrição" value={search} onChange={event => setSearch(event.target.value)} /><StatusChips value={status} onChange={setStatus} /></div>
        {query.isPending ? <p role="status">Carregando perfis...</p> : query.isError ? <div role="alert">Não foi possível carregar os perfis. <Button onClick={() => void query.refetch()}>Tentar novamente</Button></div> : !rows.length ? <p>Nenhum perfil encontrado.</p> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={rows.map(role => role.id)} strategy={verticalListSortingStrategy}><ul className="divide-y">{rows.map(role => <SortableRole key={role.id} role={role} disabled={!editable || role.slug === "admin" || !!search || status !== "all" || mutation.isPending} onDelete={() => { if (window.confirm(`Excluir o perfil ${role.nome}?`)) mutation.mutate({ path: `/roles/${role.id}`, method: "delete", data: { version: role.version } }) }} />)}</ul></SortableContext></DndContext>}
        <p className="text-xs text-muted-foreground">O topo tem maior hierarquia. Administrador é reservado. Arraste ou use o teclado para ordenar.</p>
    </section>
}
