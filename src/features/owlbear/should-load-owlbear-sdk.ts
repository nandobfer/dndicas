import { OWLBEAR_CATALOG_EMBED_PARAM } from "./catalog-dashboard-frame"

interface OwlbearSdkWindowContext {
    location: {
        pathname: string
        search: string
    }
    self?: unknown
    top?: unknown
}

export function shouldLoadOwlbearSdk(context: OwlbearSdkWindowContext) {
    if (context.location.pathname.startsWith("/owlbear")) {
        return true
    }

    const searchParams = new URLSearchParams(context.location.search)
    if (searchParams.get(OWLBEAR_CATALOG_EMBED_PARAM) === "1") {
        return true
    }

    try {
        return context.self !== context.top
    } catch {
        return true
    }
}

