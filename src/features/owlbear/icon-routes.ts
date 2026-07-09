import { NextResponse } from "next/server"

const ICON_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "image/svg+xml; charset=utf-8",
} as const

const ICONS = {
    catalog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M8 6h8"/><path d="M8 10h6"/></svg>`,
    sheet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H19v15.5A3.5 3.5 0 0 1 15.5 21H5z"/><path d="M5 5.5A3.5 3.5 0 0 0 8.5 9H19"/><path d="M8 13h7"/><path d="M8 17h5"/></svg>`,
    npcs: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6l3-3 11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="M9.5 17.5 21 6l-3-3L6.5 14.5"/><path d="m11 19-6-6"/><path d="m8 16-4 4"/></svg>`,
    dice: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 8 4.5v9L12 22l-8-6.5v-9z"/><path d="M12 2v20"/><path d="m4 6.5 8 4.5 8-4.5"/><path d="m4 15.5 8-4.5 8 4.5"/><path d="M8.5 8.5h.01"/><path d="M15.5 8.5h.01"/><path d="M12 15.5h.01"/></svg>`,
    contextMenu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Dndicas"><rect width="96" height="96" rx="20" fill="#0f172a"/><path d="M28 24h40c5.5 0 10 4.5 10 10v28c0 5.5-4.5 10-10 10H28c-5.5 0-10-4.5-10-10V34c0-5.5 4.5-10 10-10Z" fill="#1e293b" stroke="#60a5fa" stroke-width="4"/><path d="M31 41h34" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/><path d="M31 55h22" stroke="#34d399" stroke-width="5" stroke-linecap="round"/></svg>`,
} as const

export type OwlbearIconName = keyof typeof ICONS

export function getOwlbearIconResponse(name: OwlbearIconName) {
    return new NextResponse(ICONS[name], { headers: ICON_HEADERS })
}

export function getOwlbearIconOptionsResponse() {
    return new NextResponse(null, { status: 204, headers: ICON_HEADERS })
}
