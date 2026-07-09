"use client"

import { LiquidGlassBackground } from "@/components/ui/glass-background"
import { cn } from "@/core/utils"
import * as React from "react"

import { logOwlbearDebug } from "./debug"
import type { OwlbearRuntimeState } from "./types"

export function RuntimeBanner({ status }: { status: OwlbearRuntimeState["status"] }) {
    if (status !== "unavailable") return null

    return <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100">SDK Owlbear indisponível nesta action.</div>
}

export function GmOnlyMessage({ message }: { message: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            {message}
        </div>
    )
}

export function CenteredStatus({ message }: { message: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
            {message}
        </div>
    )
}

export function OwlbearActionFrame({
    children,
    runtime,
    actionName,
    contentClassName,
}: {
    children: React.ReactNode
    runtime: OwlbearRuntimeState
    actionName: string
    contentClassName?: string
}) {
    React.useEffect(() => {
        logOwlbearDebug("[Dndicas Owlbear Action]", "render", {
            actionName,
            runtimeStatus: runtime.status,
            role: runtime.role,
            roomId: runtime.roomId,
            playerId: runtime.playerId,
            sceneReady: runtime.sceneReady,
        })
    }, [actionName, runtime.playerId, runtime.role, runtime.roomId, runtime.sceneReady, runtime.status])

    return (
        <div
            data-testid="owlbear-action-surface"
            data-theme={runtime.themeMode}
            className={cn(
                "relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-white",
                runtime.themeMode === "light" && "text-slate-950"
            )}
        >
            <LiquidGlassBackground />
            <div
                className={cn(
                    "relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[840px] flex-1 flex-col gap-4 overflow-hidden p-4",
                    contentClassName,
                )}
            >
                <RuntimeBanner status={runtime.status} />
                {children}
            </div>
        </div>
    )
}
