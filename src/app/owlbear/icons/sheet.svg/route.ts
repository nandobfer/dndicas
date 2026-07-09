import { getOwlbearIconOptionsResponse, getOwlbearIconResponse } from "@/features/owlbear/icon-routes"

export function GET() {
    return getOwlbearIconResponse("sheet")
}

export function OPTIONS() {
    return getOwlbearIconOptionsResponse()
}
