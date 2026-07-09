import { getOwlbearIconOptionsResponse, getOwlbearIconResponse } from "@/features/owlbear/icon-routes"

export function GET() {
    return getOwlbearIconResponse("contextMenu")
}

export function OPTIONS() {
    return getOwlbearIconOptionsResponse()
}
