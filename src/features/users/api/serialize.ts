import type { IUser } from "../models/user"
import type { RoleDto } from "@/features/perfix/types"
import type { UserResponse } from "../types/user.types"
export function serializeUser(user: IUser, rows: RoleDto[]): UserResponse {
    return { id: String(user._id), username: user.username, email: user.email, name: user.name, avatarUrl: user.avatarUrl,
        roles: rows.filter(role => user.roles.includes(role.id)), roleIds: user.roles, version: user.accessVersion,
        status: user.status, deleted: user.deleted, passwordSetupRequired: user.passwordSetupRequired,
        lastLoginAt: user.lastLoginAt?.toISOString(), createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() }
}
