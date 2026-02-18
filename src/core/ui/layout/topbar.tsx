"use client"
import { UserButton } from "@clerk/nextjs";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/core/ui/sheet';
import { Button } from '@/core/ui/button';
import { VisuallyHidden } from '@/core/ui/visually-hidden';
import { Menu, Home, Package2 } from 'lucide-react';
import { Sidebar } from './sidebar';
import Link from 'next/link';

export function Topbar() {
    return (
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col">
                    <VisuallyHidden>
                        <SheetTitle>Menu de Navegação</SheetTitle>
                    </VisuallyHidden>
                    <nav className="grid gap-2 text-lg font-medium">
                        <Link href="#" className="flex items-center gap-2 text-lg font-semibold">
                            <Package2 className="h-6 w-6" />
                            <span className="sr-only">Dungeons & Dicas</span>
                        </Link>
                        <Sidebar />
                    </nav>
                </SheetContent>
            </Sheet>

            <div className="w-full flex-1">
                <Link href="/" className="flex items-center gap-2">
                    <Package2 className="h-6 w-6" />
                    <span className="text-lg font-bold">Dungeons & Dicas</span>
                </Link>
            </div>
            <UserButton afterSignOutUrl="/sign-in" />
        </header>
    )
}
