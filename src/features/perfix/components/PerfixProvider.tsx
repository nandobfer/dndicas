"use client"
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PermissionsProvider, ViewAsProvider, useViewAs, getViewAsHeaderValue } from "@nandobfer/perfix/react"
import api from "@/core/utils/api"
import { resetPusherClient } from "@/lib/pusher/client"
import { AUTH_SESSION_CHANGED_EVENT } from "@/features/auth/auth-session-events"
import { ViewAsSelector } from "./view-as/ViewAsSelector"
import { ViewAsBanner } from "./view-as/ViewAsBanner"
import type { AccessDto } from "../types"
import { toast } from "sonner"
import { installViewAsTransport } from "../transport"
import { AccessLoadingScreen } from "./AccessLoadingScreen"
export interface AppSession { user: { id: string; name: string; username: string; email: string; image?: string }; access: AccessDto }
const SessionContext = createContext<{ session: AppSession | null; isLoaded: boolean }>({ session: null, isLoaded: false })
export const useAppSession = () => useContext(SessionContext)
const subscribe = () => () => {}
export function PerfixProvider({ children }: { children: ReactNode }) {
    const client = useQueryClient()
    const router = useRouter()
    useEffect(() => { const cleanup = installViewAsTransport(); router.refresh(); return cleanup }, [router])
    return <ViewAsProvider onChange={change => {
        resetPusherClient()
        void client.cancelQueries().then(() => { client.clear(); router.refresh() })
        void api.post("/perfix/view-as", { kind: change.kind, previous: change.previous?.viewAs ?? null, next: change.next?.viewAs ?? null }, { headers: { "x-perfix-view-as": "none" } }).catch(() => toast.error("Não foi possível auditar a transição de acesso"))
    }}><SessionBoundary>{children}</SessionBoundary></ViewAsProvider>
}
function SessionBoundary({ children }: { children: ReactNode }) {
    const mounted = useSyncExternalStore(subscribe, () => true, () => false)
    const simulation = useViewAs()
    const [authState, setAuthState] = useState({ epoch: 0, signedOut: false })
    const header = mounted ? getViewAsHeaderValue() : "none"
    const query = useQuery({ queryKey: ["perfix-session", header, authState.epoch], enabled: mounted && !authState.signedOut, queryFn: async ({ signal }) => {
        const response = await api.get<{ data: AppSession }>("/me", { signal, headers: { "x-perfix-view-as": getViewAsHeaderValue() } })
        return response.data.data
    }, retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 30_000 })
    useEffect(() => {
        const refresh = (event: Event) => {
            const signedOut = (event as CustomEvent<string>).detail === "signed-out"
            setAuthState(previous => ({ epoch: previous.epoch + 1, signedOut }))
            if (signedOut && simulation.state) simulation.stop()
        }
        window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refresh)
        return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refresh)
    }, [simulation])
    useEffect(() => {
        if (query.isError && simulation.state) simulation.stop()
    }, [query.isError, simulation])
    const session = authState.signedOut ? null : query.isError ? null : query.data ?? null
    const isLoaded = mounted && (authState.signedOut || !query.isPending)
    return <SessionContext.Provider value={{ session, isLoaded }}><PermissionsProvider permissions={session?.access.permissions ?? []} roles={session?.access.roles ?? []} realIsAdmin={session?.access.realIsAdministrator ?? false}>
        {session?.access.realIsAdministrator && <div className="flex justify-end px-4 py-2"><ViewAsSelector /></div>}
        <ViewAsBanner />
        {isLoaded ? <div key={`${session?.user.id ?? "anonymous"}:${header}:${session?.access.permissions.join(",") ?? ""}`}>{children}</div> : <AccessLoadingScreen />}
    </PermissionsProvider></SessionContext.Provider>
}
