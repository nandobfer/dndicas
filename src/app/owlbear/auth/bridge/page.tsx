import { Suspense } from "react"
import { OwlbearAuthBridgePage } from "@/features/owlbear/owlbear-auth-bridge-page"

export const dynamic = "force-dynamic"

export default function OwlbearAuthBridgeRoute() {
    return (
        <Suspense fallback={null}>
            <OwlbearAuthBridgePage />
        </Suspense>
    )
}
