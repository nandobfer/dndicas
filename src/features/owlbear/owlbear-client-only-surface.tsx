"use client"

import dynamic from "next/dynamic"

const OwlbearDiceActionInner = dynamic(
    () => import("./owlbear-action-surface").then((module) => module.OwlbearDiceAction),
    { ssr: false }
)

const OwlbearSheetActionInner = dynamic(
    () => import("./owlbear-action-surface").then((module) => module.OwlbearSheetAction),
    { ssr: false }
)

const OwlbearNpcsActionInner = dynamic(
    () => import("./owlbear-action-surface").then((module) => module.OwlbearNpcsAction),
    { ssr: false }
)

const OwlbearContextMenuBackgroundInner = dynamic(
    () => import("./owlbear-action-surface").then((module) => module.OwlbearContextMenuBackground),
    { ssr: false }
)

export function OwlbearDiceActionClient() {
    return <OwlbearDiceActionInner />
}

export function OwlbearSheetActionClient() {
    return <OwlbearSheetActionInner />
}

export function OwlbearNpcsActionClient() {
    return <OwlbearNpcsActionInner />
}

export function OwlbearContextMenuBackgroundClient({ kind }: { kind: "player" | "npc" }) {
    return <OwlbearContextMenuBackgroundInner kind={kind} />
}
