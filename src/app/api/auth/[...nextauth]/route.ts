import NextAuth from "next-auth"
import type { NextRequest } from "next/server"
import { buildAuthOptions } from "@/features/auth/auth-options"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ nextauth: string[] }> }

/** Providers montados por requisição: o Google vem da integração "Autenticação Google". */
async function handler(request: NextRequest, context: RouteContext) {
    const options = await buildAuthOptions()
    return NextAuth(request, context, options)
}

export { handler as GET, handler as POST }
