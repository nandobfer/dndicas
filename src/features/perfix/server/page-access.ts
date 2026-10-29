import { redirect } from "next/navigation"
import { requestAccess } from "./access"
import { can } from "../catalog"
export async function pageAccess(...keys: string[]) {
    const context = await requestAccess()
    if (!context) redirect("/sign-in")
    if (!keys.every(key => can(context.effective, key))) redirect("/")
    return context
}
/** Variante para páginas que exibem o próprio estado de acesso negado: `null` quando faltam permissões. */
export async function pageAccessOrDenied(callbackUrl: string, ...keys: string[]) {
    const context = await requestAccess()
    if (!context) redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    return keys.every(key => can(context.effective, key)) ? context : null
}
