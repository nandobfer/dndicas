import { protectedRoute } from "@/features/perfix/server/route"
import { getSettings, updateSettings } from "@/features/perfix/server/settings"
export const GET = protectedRoute(["integrations.perfix.view"], async () => getSettings())
export const PATCH = protectedRoute(["integrations.perfix.edit"], async (req, _params, access) => updateSettings(access, await req.json()))
