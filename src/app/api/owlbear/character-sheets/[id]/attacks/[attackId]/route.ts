import { NextRequest } from "next/server"
import { deleteOwlbearAttack, patchOwlbearAttack } from "@/features/owlbear/server/character-sheet-routes"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; attackId: string }> }) {
    const { id, attackId } = await params
    return patchOwlbearAttack(req, id, attackId)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; attackId: string }> }) {
    const { id, attackId } = await params
    return deleteOwlbearAttack(req, id, attackId)
}
