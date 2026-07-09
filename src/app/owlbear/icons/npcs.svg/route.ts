import { getOwlbearIconOptionsResponse, getOwlbearIconResponse } from "@/features/owlbear/icon-routes"

export function GET() {
    return getOwlbearIconResponse("npcs")
}

export function OPTIONS() {
    return getOwlbearIconOptionsResponse()
}
