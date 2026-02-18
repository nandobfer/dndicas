"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/core/utils';
import { Button } from '@/core/ui/button';
import { Home, User, Sparkles, Upload, Mail, Building2, Palette, FileText } from 'lucide-react';

export const SidebarItems = [
    { label: "Início", href: "/", icon: Home },
    { label: "Perfil", href: "/profile", icon: User },
];

export const ExampleItems = [
    { label: "Componentes UI", href: "/ui-components", icon: Palette },
    { label: "IA / Gemini", href: "/examples/ai", icon: Sparkles },
    { label: "Storage / S3", href: "/examples/storage", icon: Upload },
    { label: "Email", href: "/examples/email", icon: Mail },
];

export const FeatureItems = [
    { label: "Empresas", href: "/companies", icon: Building2 },
];

export const AdminItems = [
    { label: "Logs de Auditoria", href: "/audit-logs", icon: FileText },
];

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname();

    return (
        <nav className={cn("grid items-start px-2 text-sm font-medium lg:px-4 gap-4", className)}>
            {/* Menu Principal */}
            <div>
                {SidebarItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start gap-3 rounded-lg px-3 py-2 transition-all",
                                pathname === item.href && "text-primary"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}
            </div>

            {/* Exemplos */}
            <div>
                <h4 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Exemplos
                </h4>
                {ExampleItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start gap-3 rounded-lg px-3 py-2 transition-all",
                                pathname === item.href && "text-primary"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}
            </div>

            {/* Módulos */}
            <div>
                <h4 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Módulos
                </h4>
                {FeatureItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start gap-3 rounded-lg px-3 py-2 transition-all",
                                pathname === item.href && "text-primary"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}
            </div>

            {/* Administração */}
            <div>
                <h4 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Administração
                </h4>
                {AdminItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start gap-3 rounded-lg px-3 py-2 transition-all",
                                pathname === item.href && "text-primary"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}
            </div>
        </nav>
    )
}
