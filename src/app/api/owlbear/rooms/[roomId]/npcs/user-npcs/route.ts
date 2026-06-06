import { NextRequest } from "next/server"
import { postOwlbearRoomUserNpc } from "@/features/owlbear/server/room-npc-routes"

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
    const { roomId } = await params
    return postOwlbearRoomUserNpc(req, roomId)
}
