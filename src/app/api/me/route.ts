import { protectedRoute } from "@/features/perfix/server/route"
import { User } from "@/features/users/models/user"
export const dynamic = "force-dynamic"
export const GET = protectedRoute([], async (_req, _params, access) => {
    const user = await User.findById(access.userId).lean()
    return { user: { id: access.userId, name: user!.name || user!.username, username: user!.username, email: user!.email, image: user!.avatarUrl }, access: access.dto }
})
