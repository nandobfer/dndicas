import { protectedRoute } from "@/features/perfix/server/route"
import { reorderRoles } from "@/features/perfix/server/commands"
export const POST = protectedRoute(["roles.edit"], async (req, _params, access) => reorderRoles(access, await req.json()))
