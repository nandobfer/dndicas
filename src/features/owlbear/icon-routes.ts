import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"

const ICON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "image/svg+xml; charset=utf-8",
} as const

const ACTION_ICON_FILES = {
    catalog: "catalog.svg",
    sheet: "sheet.svg",
    npcs: "npc.svg",
    dice: "dice.svg",
} as const

const INLINE_ICONS = {
    contextMenu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Dndicas"><rect width="96" height="96" rx="20" fill="#0f172a"/><path d="M28 24h40c5.5 0 10 4.5 10 10v28c0 5.5-4.5 10-10 10H28c-5.5 0-10-4.5-10-10V34c0-5.5 4.5-10 10-10Z" fill="#1e293b" stroke="#60a5fa" stroke-width="4"/><path d="M31 41h34" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/><path d="M31 55h22" stroke="#34d399" stroke-width="5" stroke-linecap="round"/></svg>`,
} as const

export type OwlbearIconName = keyof typeof ACTION_ICON_FILES | keyof typeof INLINE_ICONS

export async function getOwlbearIconResponse(name: OwlbearIconName) {
    if (name in INLINE_ICONS) {
        return new NextResponse(INLINE_ICONS[name as keyof typeof INLINE_ICONS], { headers: ICON_HEADERS })
    }

    const fileName = ACTION_ICON_FILES[name as keyof typeof ACTION_ICON_FILES]
    const icon = await readFile(join(process.cwd(), "public", "owlbear", fileName), "utf8")

    return new NextResponse(icon, { headers: ICON_HEADERS })
}

export function getOwlbearIconOptionsResponse() {
    return new NextResponse(null, { status: 204, headers: ICON_HEADERS })
}
