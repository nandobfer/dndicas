import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { ExpandableSidebar } from '@/components/ui/expandable-sidebar'

let pathname = '/'

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
}))

vi.mock('next/image', () => ({
    default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}))

vi.mock('@clerk/nextjs', () => ({
    UserButton: () => <button type="button">Minha Conta</button>,
    SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: () => null,
}))

vi.mock('@/core/hooks/useAuth', () => ({
    useAuth: () => ({ isSignedIn: true, isAdmin: false }),
}))

vi.mock('framer-motion', () => {
    type MotionMockProps = React.HTMLAttributes<HTMLElement> & {
        variants?: unknown
        initial?: unknown
        animate?: unknown
        transition?: unknown
        whileHover?: unknown
        whileTap?: unknown
        exit?: unknown
        layoutId?: unknown
    }

    const createMotionComponent = (Tag: React.ElementType) => {
        const Component = ({ children, ...props }: MotionMockProps) => {
            const { variants, initial, animate, transition, whileHover, whileTap, exit, layoutId, ...domProps } = props
            void variants
            void initial
            void animate
            void transition
            void whileHover
            void whileTap
            void exit
            void layoutId
            return React.createElement(Tag, domProps, children)
        }
        return Component
    }

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            aside: createMotionComponent('aside'),
            div: createMotionComponent('div'),
            span: createMotionComponent('span'),
        },
    }
})

describe('ExpandableSidebar', () => {
    beforeEach(() => {
        pathname = '/'
    })

    it('shows the monsters catalog link for regular users', () => {
        render(<ExpandableSidebar isExpanded={true} onExpand={vi.fn()} onCollapse={vi.fn()} />)

        const link = screen.getByText('Monstros').closest('a')

        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', '/monsters')
    })

    it('marks monsters as active on the catalog route and subroutes', () => {
        pathname = '/monsters'
        const { rerender } = render(<ExpandableSidebar isExpanded={true} onExpand={vi.fn()} onCollapse={vi.fn()} />)

        let link = screen.getByText('Monstros').closest('a')
        expect(link?.firstElementChild).toHaveClass('bg-white/15')

        pathname = '/monsters/adult-red-dragon'
        rerender(<ExpandableSidebar isExpanded={true} onExpand={vi.fn()} onCollapse={vi.fn()} />)

        link = screen.getByText('Monstros').closest('a')
        expect(link?.firstElementChild).toHaveClass('bg-white/15')
    })
})
