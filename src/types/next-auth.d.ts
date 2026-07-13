import type { DefaultSession, DefaultUser } from "next-auth"
import type { JWT as DefaultJWT } from "next-auth/jwt"
import type { UserRole, UserStatus } from "@/features/users/types/user.types"

declare module "next-auth" {
    interface Session {
        user: DefaultSession["user"] & {
            id: string
            username: string | null
            role: UserRole
            status: UserStatus
        }
    }

    interface User extends DefaultUser {
        username?: string | null
        role?: UserRole
        status?: UserStatus
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        id?: string
        username?: string | null
        role?: UserRole
        status?: UserStatus
    }
}
