import { NextRequest } from "next/server"
import { deleteOwlbearRoomNpc, patchOwlbearRoomNpc } from "@/features/owlbear/server/room-npc-routes"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roomId: string; npcId: string }> }) {
    const { roomId, npcId } = await params
    return patchOwlbearRoomNpc(req, roomId, npcId)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ roomId: string; npcId: string }> }) {
    const { roomId, npcId } = await params
    return deleteOwlbearRoomNpc(req, roomId, npcId)
}
