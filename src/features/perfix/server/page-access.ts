import { redirect } from "next/navigation"
import { requestAccess } from "./access"
import { can } from "../catalog"
export async function pageAccess(...keys: string[]) {
    const context = await requestAccess()
    if (!context) redirect("/sign-in")
    if (!keys.every(key => can(context.effective, key))) redirect("/")
    return context
}
