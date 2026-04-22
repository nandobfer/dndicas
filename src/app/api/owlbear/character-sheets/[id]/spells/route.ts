import { NextRequest } from "next/server"
import { getOwlbearSpells, postOwlbearSpells } from "@/features/owlbear/server/character-sheet-routes"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return getOwlbearSpells(req, id)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return postOwlbearSpells(req, id)
}
