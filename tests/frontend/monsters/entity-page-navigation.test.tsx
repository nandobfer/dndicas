import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { EntityPage } from '@/features/rules/components/entity-page'

const routerPush = vi.fn()
const routerBack = vi.fn()

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: routerPush,
        back: routerBack,
    }),
}))

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    },
}))

vi.mock('@/components/ui/glass-card', () => ({
    GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassCardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/loading-state', () => ({
    LoadingState: ({ message }: { message?: string }) => <div>{message}</div>,
}))

vi.mock('@/components/ui/empty-state', () => ({
    EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('@/components/ui/chip', () => ({
    Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/core/ui/button', () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: vi.fn() }),
}))

vi.mock('@/features/rules/components/entity-renderers', () => ({
    renderEntity: () => <div>Rendered entity</div>,
}))

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewTooltip: () => null,
}))

vi.mock('@/components/ui/glass-dropdown-menu', () => ({
    GlassDropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('@/lib/config/theme-config', () => ({
    themeConfig: {
        spacing: {
            page: {
                padding: 16,
            },
        },
    },
}))

vi.mock('@/lib/config/motion-configs', () => ({
    motionConfig: {
        variants: {
            fadeInUp: {},
        },
    },
}))

describe('EntityPage navigation', () => {
    beforeEach(() => {
        routerPush.mockReset()
        routerBack.mockReset()
    })

    it('uses the provided backHref instead of history for the back button', () => {
        render(
            <EntityPage
                item={{ name: 'Adult Silver Dragon', description: '', status: 'active' }}
                entityType="Monstro"
                isLoading={false}
                hideActionIcons={true}
                backHref="/monsters"
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))

        expect(routerPush).toHaveBeenCalledWith('/monsters')
        expect(routerBack).not.toHaveBeenCalled()
    })
})
