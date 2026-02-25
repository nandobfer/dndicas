"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from '@/core/utils';
import { Button } from '@/core/ui/button';
import { Home, User, Sparkles, Upload, Mail, Building2, Palette, FileText, Users, Ruler, Zap } from "lucide-react"

export const SidebarItems = [
    { label: "Início", href: "/", icon: Home },
    { label: "Perfil", href: "/profile", icon: User, authenticated: true }
]

export const ExampleItems = [
    { label: "Componentes UI", href: "/ui-components", icon: Palette },
    { label: "IA / Gemini", href: "/examples/ai", icon: Sparkles, admin: true },
    { label: "Storage / S3", href: "/examples/storage", icon: Upload, admin: true },
    { label: "Email", href: "/examples/email", icon: Mail, admin: true }
]

export const FeatureItems = [
    { label: "Módulos", isHeader: true },
    { label: "Regras", href: "/rules", icon: Ruler },
    { label: "Talentos", href: "/feats", icon: Zap },
    { label: "Habilidades", href: "/traits", icon: Sparkles },
    { label: "Usuários", href: "/users", icon: Users }
]

export const AdminItems = [
    { label: "Administração", isHeader: true },
    { label: "Logs de Auditoria", href: "/audit-logs", icon: FileText }
]

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname();
    const { isSignedIn, isAdmin } = useAuth()

    const renderItems = (items: any[]) => {
        return items
            .filter((item) => {
                if (item.admin && !isAdmin) return false
                if (item.authenticated && !isSignedIn) return false
                return true
            })
            .map((item) => {
                if (item.isHeader) {
                    return (
                        <h4
                            key={item.label}
                            className="mb-2 mt-4 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider first:mt-0"
                        >
                            {item.label}
                        </h4>
                    )
                }
                return (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start gap-3 rounded-lg px-3 py-2 transition-all my-0.5",
                                pathname === item.href && "text-primary bg-white/10"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                )
            })
    }

    return (
        <nav className={cn("flex flex-col px-2 text-sm font-medium lg:px-4 py-4 overflow-y-auto", className)}>
            {renderItems(SidebarItems)}
            {renderItems(FeatureItems)}
            {renderItems(AdminItems)}
            {isAdmin && renderItems(ExampleItems)}
        </nav>
    )
}
