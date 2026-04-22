import { NextRequest } from "next/server"
import { deleteOwlbearSpell, patchOwlbearSpell } from "@/features/owlbear/server/character-sheet-routes"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; spellId: string }> }) {
    const { id, spellId } = await params
    return patchOwlbearSpell(req, id, spellId)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; spellId: string }> }) {
    const { id, spellId } = await params
    return deleteOwlbearSpell(req, id, spellId)
}
