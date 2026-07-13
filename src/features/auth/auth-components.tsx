"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { LogOut, User, UserCircle } from "lucide-react"
import { Button } from "@/core/ui/button"
import { Input } from "@/core/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/ui/card"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { useAuth } from "@/core/hooks/useAuth"
import { notifyAuthSessionChanged } from "./auth-session-events"

export function SignedIn({ children }: { children: React.ReactNode }) {
    const { isSignedIn } = useAuth()
    if (!isSignedIn) return null
    return <>{children}</>
}

export function SignedOut({ children }: { children: React.ReactNode }) {
    const { isSignedIn } = useAuth()
    if (isSignedIn) return null
    return <>{children}</>
}

export function UserButton({ afterSignOutUrl = "/" }: { afterSignOutUrl?: string; appearance?: unknown }) {
    const { fullName, imageUrl, user, signOut: authSignOut } = useAuth()
    const router = useRouter()
    const [isSigningOut, setIsSigningOut] = React.useState(false)
    const name = fullName || user?.username || "Minha conta"

    async function handleSignOut() {
        if (isSigningOut) return
        setIsSigningOut(true)
        try {
            await authSignOut(afterSignOutUrl)
            router.replace(afterSignOutUrl)
            router.refresh()
        } finally {
            setIsSigningOut(false)
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Link href="/profile" className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-white/80 hover:bg-white/15">
                {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                    <UserCircle className="h-4 w-4" />
                )}
                <span className="sr-only">{name}</span>
            </Link>
            <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                title="Sair"
            >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sair</span>
            </button>
        </div>
    )
}

function GoogleIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.65 8.65 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
        </svg>
    )
}

export function SignIn({ fallbackRedirectUrl, forceRedirectUrl }: { routing?: string; fallbackRedirectUrl?: string; forceRedirectUrl?: string }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [identifier, setIdentifier] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const callbackUrl = forceRedirectUrl || searchParams.get("callbackUrl") || fallbackRedirectUrl || "/"

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setIsSubmitting(true)

        const result = await signIn("credentials", {
            identifier,
            password,
            redirect: false,
            callbackUrl,
        })

        setIsSubmitting(false)

        if (!result || result.error) {
            setError("Email, usuário ou senha inválidos. Confira seus dados e tente novamente.")
            return
        }

        notifyAuthSessionChanged("signed-in")
        router.push(result.url || callbackUrl)
        router.refresh()
    }

    function handleGoogleSignIn() {
        void signIn("google", { callbackUrl })
    }

    return (
        <Card className="w-full max-w-md border-white/10 bg-black/40 text-white shadow-2xl backdrop-blur-xl">
            <CardHeader>
                <CardTitle>Entrar</CardTitle>
                <CardDescription className="text-white/60">Acesse sua conta do Dungeons & Dicas.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="identifier" className="text-sm font-medium text-white/80">Email ou usuário</label>
                        <Input id="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="password" className="text-sm font-medium text-white/80">Senha</label>
                        <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                    </div>
                    {error && <p className="text-sm text-red-300">{error}</p>}
                    <Button type="submit" className="w-full bg-blue-500 text-white hover:bg-blue-600" disabled={isSubmitting}>{isSubmitting ? "Entrando..." : "Entrar"}</Button>
                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <span className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-black px-2 text-white/40">ou</span>
                        </div>
                    </div>
                    <Button type="button" variant="outline" className="h-10 w-full border-[#dadce0] bg-white text-sm font-medium text-[#3c4043] shadow-sm hover:bg-[#f8fafd] hover:text-[#202124] disabled:opacity-70" onClick={handleGoogleSignIn} disabled={isSubmitting}>
                        <GoogleIcon />
                        Entrar com Google
                    </Button>
                    <p className="text-center text-sm text-white/50">
                        Ainda nao tem conta? <Link href="/sign-up" className="text-blue-300 hover:text-blue-200">Criar conta</Link>
                    </p>
                </form>
            </CardContent>
        </Card>
    )
}

export function SignUp() {
    const router = useRouter()
    const [username, setUsername] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [name, setName] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [error, setError] = React.useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setIsSubmitting(true)

        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, name, password }),
        })

        if (!response.ok) {
            const payload = await response.json().catch(() => null) as { error?: string } | null
            setError(payload?.error || "Não foi possível criar sua conta.")
            setIsSubmitting(false)
            return
        }

        const result = await signIn("credentials", {
            identifier: email,
            password,
            redirect: false,
            callbackUrl: "/",
        })

        setIsSubmitting(false)

        if (!result || result.error) {
            router.push("/sign-in")
            return
        }

        notifyAuthSessionChanged("signed-in")
        router.push(result.url || "/")
        router.refresh()
    }

    return (
        <Card className="w-full max-w-md border-white/10 bg-black/40 text-white shadow-2xl backdrop-blur-xl">
            <CardHeader>
                <CardTitle>Criar conta</CardTitle>
                <CardDescription className="text-white/60">Crie uma conta local simples para acessar suas fichas.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="signup-name" className="text-sm font-medium text-white/80">Nome</label>
                        <Input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="signup-username" className="text-sm font-medium text-white/80">Usuário</label>
                        <Input id="signup-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="signup-email" className="text-sm font-medium text-white/80">Email</label>
                        <Input id="signup-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="signup-password" className="text-sm font-medium text-white/80">Senha</label>
                        <Input id="signup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
                    </div>
                    {error && <p className="text-sm text-red-300">{error}</p>}
                    <Button type="submit" className="w-full bg-blue-500 text-white hover:bg-blue-600" disabled={isSubmitting}>{isSubmitting ? "Criando..." : "Criar conta"}</Button>
                    <p className="text-center text-sm text-white/50">
                        Já tem conta? <Link href="/sign-in" className="text-blue-300 hover:text-blue-200">Entrar</Link>
                    </p>
                </form>
            </CardContent>
        </Card>
    )
}

export function UserProfile({ path = "/profile" }: { path?: string }) {
    const { user, isLoaded } = useAuth()
    const [name, setName] = React.useState("")
    const [username, setUsername] = React.useState("")
    const [avatarUrl, setAvatarUrl] = React.useState("")
    const [message, setMessage] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    React.useEffect(() => {
        if (!user) return
        setName(user.name || "")
        setUsername(user.username || "")
        setAvatarUrl(user.image || "")
    }, [user])

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setMessage(null)
        setError(null)
        setIsSubmitting(true)

        const response = await fetch("/api/auth/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, username, avatarUrl }),
        })

        setIsSubmitting(false)

        if (!response.ok) {
            const payload = await response.json().catch(() => null) as { error?: string } | null
            setError(payload?.error || "Não foi possível atualizar seu perfil.")
            return
        }

        setMessage("Perfil atualizado com sucesso.")
        notifyAuthSessionChanged("signed-in")
    }

    if (!isLoaded) return <p className="text-white/60">Carregando perfil...</p>
    if (!user) {
        return (
            <div className="flex flex-col items-center gap-4 text-white/70">
                <User className="h-10 w-10" />
                <p>Entre para ver seu perfil.</p>
                <Button asChild className="bg-blue-500 text-white hover:bg-blue-600"><Link href={`/sign-in?callbackUrl=${encodeURIComponent(path)}`}>Entrar</Link></Button>
            </div>
        )
    }

    return (
        <Card className="w-full max-w-xl border-white/10 bg-black/40 text-white shadow-2xl backdrop-blur-xl">
            <CardHeader>
                <CardTitle>Meu perfil</CardTitle>
                <CardDescription className="text-white/60">Edite os dados básicos da sua conta local.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="profile-name" className="text-sm font-medium text-white/80">Nome</label>
                        <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="profile-username" className="text-sm font-medium text-white/80">Usuário</label>
                        <Input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} required />
                    </div>
                    <GlassImageUploader
                        value={avatarUrl}
                        onChange={setAvatarUrl}
                        onRemove={() => setAvatarUrl("")}
                        disabled={isSubmitting}
                        label="Avatar"
                        aspectRatio="square"
                        enableAI={false}
                    />
                    <p className="text-sm"><span className="text-white/50">Email:</span> {user.email || "Não informado"}</p>
                    {message && <p className="text-sm text-emerald-300">{message}</p>}
                    {error && <p className="text-sm text-red-300">{error}</p>}
                    <Button type="submit" className="w-full bg-blue-500 text-white hover:bg-blue-600" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar perfil"}</Button>
                </form>
            </CardContent>
        </Card>
    )
}
