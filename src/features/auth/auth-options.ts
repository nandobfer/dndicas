import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { compare } from "bcryptjs"
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"

const PERSISTENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 20
const USERNAME_SUFFIX_MAX_ATTEMPTS = 50

function normalizeIdentifier(identifier: string) {
    return identifier.trim().toLowerCase()
}

export async function authorizeCredentials(credentials: { identifier?: string | null; password?: string | null } | undefined) {
    const identifier = normalizeIdentifier(credentials?.identifier ?? "")
    const password = credentials?.password ?? ""

    if (!identifier || !password) return null

    await dbConnect()
    const user = await User.findOne({
        deleted: { $ne: true },
        $or: [{ email: identifier }, { username: identifier }],
    }).select("+passwordHash")

    if (!user || user.status !== "active" || user.passwordSetupRequired || !user.passwordHash) {
        return null
    }

    const passwordMatches = await compare(password, user.passwordHash)
    if (!passwordMatches) return null

    user.lastLoginAt = new Date()
    await user.save()

    return {
        id: user._id.toString(),
        email: user.email,
        name: user.name || user.username,
        image: user.avatarUrl,
        username: user.username,
        role: user.role,
        status: user.status,
    }
}

export interface GoogleOAuthCredentials {
    clientId: string
    clientSecret: string
}

/**
 * Providers do login. O Google só entra com as credenciais da integração "Autenticação Google"
 * (Integrações, banco → `.env` legado), resolvidas a cada requisição da rota do NextAuth.
 */
export function buildAuthProviders(google: GoogleOAuthCredentials | null = null) {
    const providers: NextAuthOptions["providers"] = [
        CredentialsProvider({
            name: "Email e senha",
            credentials: {
                identifier: { label: "Email ou usuario", type: "text" },
                password: { label: "Senha", type: "password" },
            },
            authorize: authorizeCredentials,
        }),
    ]

    if (google?.clientId && google.clientSecret) {
        providers.push(GoogleProvider({
            clientId: google.clientId,
            clientSecret: google.clientSecret,
        }))
    }

    return providers
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

function normalizeUsernameCandidate(value: string) {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")

    return normalized.length >= 3 ? normalized.slice(0, 40) : `user_${normalized || "google"}`
}

async function buildUniqueUsername(email: string, name?: string | null) {
    const [emailPrefix] = email.split("@")
    const base = normalizeUsernameCandidate(name || emailPrefix || "google_user")

    for (let attempt = 0; attempt < USERNAME_SUFFIX_MAX_ATTEMPTS; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}_${attempt}`
        const existing = await User.findOne({ username: candidate, deleted: { $ne: true } }).select("_id").lean()
        if (!existing) return candidate
    }

    return `${base}_${Date.now().toString(36)}`
}

async function findOrCreateGoogleUser(profile: { email?: string | null; name?: string | null; image?: string | null }) {
    const email = normalizeEmail(profile.email ?? "")
    if (!email) return null

    await dbConnect()

    const existingUser = await User.findOne({ email, deleted: { $ne: true } })
    if (existingUser) {
        if (existingUser.status !== "active") return null
        if (profile.image && !existingUser.avatarUrl) existingUser.avatarUrl = profile.image
        existingUser.lastLoginAt = new Date()
        await existingUser.save()
        return existingUser
    }

    const username = await buildUniqueUsername(email, profile.name)
    return User.create({
        username,
        email,
        name: profile.name || undefined,
        avatarUrl: profile.image || undefined,
        passwordSetupRequired: true,
        role: "user",
        status: "active",
        deleted: false,
        lastLoginAt: new Date(),
    })
}

/**
 * Opções estáticas (sessão JWT, callbacks e login por senha) — suficientes para `getServerSession`.
 * A rota `/api/auth/[...nextauth]` usa `buildAuthOptions()`, que acrescenta o Google configurado.
 */
export const authOptions: NextAuthOptions = {
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
        maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
        updateAge: 60 * 60 * 24 * 30,
    },
    pages: {
        signIn: "/sign-in",
    },
    providers: buildAuthProviders(),
    callbacks: {
        async signIn({ account, profile, user }) {
            if (account?.provider !== "google") return true

            const googleProfile = profile as { email?: string | null; name?: string | null; picture?: string | null } | undefined
            const localUser = await findOrCreateGoogleUser({
                email: googleProfile?.email ?? user.email,
                name: googleProfile?.name ?? user.name,
                image: googleProfile?.picture ?? user.image,
            })

            if (!localUser) return false


            user.id = localUser._id.toString()
            user.email = localUser.email
            user.name = localUser.name || localUser.username
            user.image = localUser.avatarUrl
            user.username = localUser.username
            user.role = localUser.role
            user.status = localUser.status

            return true
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.username = user.username
                token.role = user.role
                token.status = user.status
            }
            return token
        },
        async session({ session, token }) {
            if (session.user) {
                const userId = typeof token.id === "string" ? token.id : null
                session.user.id = String(token.id)
                session.user.username = typeof token.username === "string" ? token.username : null
                session.user.role = token.role === "admin" ? "admin" : "user"
                session.user.status = token.status === "inactive" ? "inactive" : "active"

                if (userId) {
                    await dbConnect()
                    const user = await User.findOne({ _id: userId, deleted: { $ne: true } }).lean()
                    if (user) {
                        session.user.name = user.name || user.username
                        session.user.email = user.email
                        session.user.image = user.avatarUrl || null
                        session.user.username = user.username
                        session.user.role = user.role
                        session.user.status = user.status
                    }
                }
            }
            return session
        },
    },
}

/** Credenciais do Google da integração; `null` quando incompletas ou indisponíveis. SOMENTE servidor. */
export async function getGoogleOAuthCredentials(): Promise<GoogleOAuthCredentials | null> {
    try {
        const { getIntegrationConfig } = await import("@/lib/integrations/config")
        const config = await getIntegrationConfig("google_auth")
        return config.clientId && config.clientSecret ? { clientId: config.clientId, clientSecret: config.clientSecret } : null
    } catch (error) {
        console.error("[auth] Configuração do login com Google indisponível", error)
        return null
    }
}

/** Opções completas da rota do NextAuth, com os providers resolvidos na hora. */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
    return { ...authOptions, providers: buildAuthProviders(await getGoogleOAuthCredentials()) }
}
