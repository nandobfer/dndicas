"use client"

import { useState } from "react"
import { Controller, type UseFormReturn } from "react-hook-form"
import { format } from "date-fns"
import { Loader2, Plug, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { FormToggleCard } from "@/components/ui/opex/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { MADDOX_MCP_PATH, MADDOX_MCP_SERVER_NAME, MADDOX_SESSION_PURPOSE_LABELS, MADDOX_SESSION_SCOPE_LABELS, MADDOX_SESSION_SCOPES, type MaddoxSessionScope } from "../../constants"
import type { MaddoxSettings } from "../../schemas"
import type { MaddoxMcpStatusDto, MaddoxOpencodeSessionDto } from "../../types"
import { useDeleteMaddoxSession, useMaddoxMcpStatus, useMaddoxSessions, useRegisterMaddoxMcp } from "../../hooks/useMaddoxSettings"

/** Política das sessões do OpenCode (salva com a configuração). */
export function MaddoxOpencodePolicyCard({ form }: { form: UseFormReturn<MaddoxSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Sessões do OpenCode</CardTitle>
                <CardDescription>Com o OpenCode como provedor, o Maddox cria e mantém sessões no servidor para cada campanha. Os demais provedores ignoram estas opções.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="maddox-opencode-scope" label="Sessões por campanha">
                    <Controller
                        control={form.control}
                        name="opencode.sessionScope"
                        render={({ field }) => (
                            <OptionTabs<MaddoxSessionScope>
                                id="maddox-opencode-scope"
                                options={MADDOX_SESSION_SCOPES.map((scope) => ({ value: scope, label: MADDOX_SESSION_SCOPE_LABELS[scope] }))}
                                value={field.value}
                                onChange={field.onChange}
                                className="w-full flex-wrap"
                            />
                        )}
                    />
                </Field>
                <FormToggleCard<MaddoxSettings>
                    control={form.control}
                    name="opencode.deleteOnCampaignEnd"
                    id="maddox-opencode-delete"
                    label="Excluir ao encerrar a campanha"
                    description="Quando a campanha termina ou é arquivada, as sessões dela são excluídas do OpenCode (o histórico da campanha no DnDicas é mantido)."
                    onLabel="Sim"
                    offLabel="Não"
                />
                <Field id="maddox-opencode-directory" label="Diretório das sessões" error={form.formState.errors.opencode?.directory?.message}>
                    <Controller
                        control={form.control}
                        name="opencode.directory"
                        render={({ field }) => <Input id="maddox-opencode-directory" placeholder="Vazio = o diretório da integração OpenCode" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} />}
                    />
                </Field>
                <Field
                    id="maddox-opencode-mcp-url"
                    label="URL do MCP do Maddox"
                    error={form.formState.errors.opencode?.mcpUrl?.message}
                >
                    <Controller
                        control={form.control}
                        name="opencode.mcpUrl"
                        render={({ field }) => <Input id="maddox-opencode-mcp-url" placeholder={`https://seu-dominio${MADDOX_MCP_PATH}`} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value.trim() || null)} />}
                    />
                    <p className="text-xs text-muted-foreground">Endereço que o OpenCode chama para as ferramentas do narrador. Vazio = a URL pública do app + {MADDOX_MCP_PATH}.</p>
                </Field>
            </CardContent>
        </Card>
    )
}

const MCP_STATUS_LABELS: Record<MaddoxMcpStatusDto["status"], string> = {
    connected: "Conectado",
    pending: "Conectando",
    disabled: "Desativado no OpenCode",
    failed: "Falhou",
    needs_auth: "Pede autenticação",
    missing: "Não registrado",
    outdated: "URL desatualizada",
    unknown: "Sem resposta do OpenCode",
}

/**
 * MCP do Maddox no OpenCode (Maddox 4): com o OpenCode como narrador, as ferramentas de persistência chegam ao agente
 * por este MCP. A narração registra e conecta sozinha quando falta; aqui dá para conferir e registrar à mão.
 */
export function MaddoxOpencodeMcpCard() {
    const query = useMaddoxMcpStatus()
    const register = useRegisterMaddoxMcp()
    const status = query.data
    const connected = status?.status === "connected"
    const snippet = JSON.stringify({ mcp: { [MADDOX_MCP_SERVER_NAME]: { type: "remote", url: status?.url ?? `https://seu-dominio${MADDOX_MCP_PATH}`, oauth: false } } }, null, 2)
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">MCP do Maddox</CardTitle>
                    <CardDescription>
                        Com o OpenCode como provedor do Maddox, as ferramentas do narrador (estado da campanha, NPCs, locais, missões e memórias) chegam ao agente pelo MCP <code>{MADDOX_MCP_SERVER_NAME}</code>. Use um agente do OpenCode sem ferramentas de arquivos ou terminal.
                    </CardDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Atualizar situação do MCP" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {query.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : query.isError || !status ? (
                    <ErrorState title="Não foi possível consultar o MCP" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <>
                        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="maddox-mcp-status">
                            <span className={connected ? "rounded bg-success/15 px-1.5 py-0.5 text-xs text-success" : "rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning"}>{MCP_STATUS_LABELS[status.status]}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{status.url ?? "sem URL pública do app"}</span>
                        </p>
                        {status.registeredUrl && status.registeredUrl !== status.url && <p className="text-xs text-warning">Registrado no OpenCode com {status.registeredUrl}.</p>}
                        {status.error && <p className="text-xs text-destructive">{status.error}</p>}
                        {connected && !status.registeredUrl && (
                            <p className="text-xs text-muted-foreground">O OpenCode não informa a URL registrada. Se trocar a URL do MCP, clique em &quot;Registrar no OpenCode&quot; de novo ou ajuste o opencode.json.</p>
                        )}
                        {(!connected || !status.registeredUrl) && (
                            <Button type="button" size="sm" variant="outline" disabled={register.isPending || !status.url} onClick={() => register.mutate()}>
                                {register.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plug aria-hidden />} Registrar no OpenCode
                            </Button>
                        )}
                        <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Configuração manual (opencode.json)</summary>
                            <pre className="mt-2 overflow-x-auto rounded-md border bg-background/60 p-2 font-mono text-[11px]">{snippet}</pre>
                        </details>
                    </>
                )}
            </CardContent>
        </Card>
    )
}

const formatDate = (value: string | null) => (value ? format(new Date(value), "dd/MM/yyyy HH:mm") : "—")

/** Sessões mantidas pelo Maddox, com exclusão (salva sozinha, fora do formulário). */
export function MaddoxOpencodeSessionsCard() {
    const query = useMaddoxSessions()
    const remove = useDeleteMaddoxSession()
    const [target, setTarget] = useState<MaddoxOpencodeSessionDto | null>(null)

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Sessões ativas</CardTitle>
                    <CardDescription>Sessões do OpenCode criadas pelo Maddox. Excluir apaga a sessão no servidor; se o OpenCode não responder, a exclusão fica pendente e é retomada pela rotina de hora em hora.</CardDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Atualizar sessões" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
                </Button>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível listar as sessões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : !query.data?.length ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma sessão do OpenCode no momento. Elas surgem quando uma campanha usa o Maddox com o OpenCode.</p>
                ) : (
                    <ul className="divide-y">
                        {query.data.map((session) => (
                            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0 flex-1">
                                    <span className="font-medium">{session.campaignName ?? "Campanha removida"}</span>
                                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{MADDOX_SESSION_PURPOSE_LABELS[session.purpose]}</span>
                                    {session.status === "pending-deletion" && <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">exclusão pendente</span>}
                                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                        {session.sessionId} · último uso {formatDate(session.lastUsedAt)}
                                    </span>
                                    {session.lastError && <span className="block truncate text-xs text-destructive">{session.lastError}</span>}
                                </span>
                                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive" disabled={remove.isPending} onClick={() => setTarget(session)}>
                                    {remove.isPending && remove.variables === session.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                                    Excluir
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => !open && setTarget(null)}
                title="Excluir a sessão do OpenCode?"
                description="A conversa da sessão no OpenCode é apagada. Se a campanha voltar a usar o Maddox, uma nova sessão é criada."
                items={target ? [`${target.campaignName ?? "Campanha removida"} · ${MADDOX_SESSION_PURPOSE_LABELS[target.purpose]}`] : undefined}
                confirmLabel="Excluir sessão"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => {
                    if (!target) return
                    remove.mutate(target.id, { onSettled: () => setTarget(null) })
                }}
            />
        </Card>
    )
}
