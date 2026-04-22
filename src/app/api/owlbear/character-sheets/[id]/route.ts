import { NextRequest } from "next/server"
import { getOwlbearSheet, patchOwlbearSheet } from "@/features/owlbear/server/character-sheet-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return getOwlbearSheet(req, id)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return patchOwlbearSheet(req, id)
}
