import { redirect } from "next/navigation"
import { requestAccess } from "./access"
import { can } from "../catalog"
export async function pageAccess(...keys: string[]) {
    return pageAccessOr("/", ...keys)
}
/** Como `pageAccess`, mas manda para `deniedTo` quando faltam permissões (ex.: `/sheets` → `/my-sheets`). */
export async function pageAccessOr(deniedTo: string, ...keys: string[]) {
    const context = await requestAccess()
    if (!context) redirect("/sign-in")
    if (!keys.every(key => can(context.effective, key))) redirect(deniedTo)
    return context
}
/** Variante para páginas que exibem o próprio estado de acesso negado: `null` quando faltam permissões. */
export async function pageAccessOrDenied(callbackUrl: string, ...keys: string[]) {
    const context = await requestAccess()
    if (!context) redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    return keys.every(key => can(context.effective, key)) ? context : null
}
