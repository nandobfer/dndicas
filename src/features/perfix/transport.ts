"use client"
import { getViewAsHeaderValue } from "@nandobfer/perfix/react"
import api from "@/core/utils/api"
/** Transporta o estado da aba, evitando que o cookie de outra aba altere APIs/RSC. */
export function installViewAsTransport() {
    const interceptor = api.interceptors.request.use(config => {
        if (!config.headers.has("x-perfix-view-as")) config.headers.set("x-perfix-view-as", getViewAsHeaderValue())
        return config
    })
    const original = window.fetch
    const wrapped: typeof window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
        if (url.origin !== window.location.origin) return original(input, init)
        const outgoing = new Request(input instanceof Request ? input : url, init)
        if (!outgoing.headers.has("x-perfix-view-as")) outgoing.headers.set("x-perfix-view-as", getViewAsHeaderValue())
        return original(outgoing)
    }
    window.fetch = wrapped
    return () => { api.interceptors.request.eject(interceptor); if (window.fetch === wrapped) window.fetch = original }
}
