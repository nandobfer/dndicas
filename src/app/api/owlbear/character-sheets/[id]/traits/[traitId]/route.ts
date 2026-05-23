import { NextRequest } from "next/server"
import { deleteOwlbearTrait } from "@/features/owlbear/server/character-sheet-routes"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; traitId: string }> }) {
    const { id, traitId } = await params
    return deleteOwlbearTrait(req, id, traitId)
}
