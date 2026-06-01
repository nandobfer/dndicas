/**
 * Regression tests: MentionContent renders <table> HTML with styled elements.
 *
 * Before the fix, table/thead/tbody/tr/th/td elements fell through to the
 * generic React.createElement path with no Tailwind classes, resulting in
 * an unstyled (invisible) table. After the fix, each element receives the
 * ChargesPreview-inspired Tailwind classes.
 */

import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MentionContent } from '@/features/rules/components/mention-badge'

vi.mock('@/core/hooks/useMediaQuery', () => ({
    useIsMobile: () => false,
}))

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/glass-tooltip', () => ({
    SimpleGlassTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const TABLE_HTML = `
<table>
  <thead>
    <tr><th>Plano de Item Mágico</th><th>Sintonia</th></tr>
  </thead>
  <tbody>
    <tr><td>Jarra de Alquimia</td><td>Não</td></tr>
    <tr><td>Bolsa de Retenção</td><td>Não</td></tr>
  </tbody>
</table>
`

describe('MentionContent — table rendering', () => {
    it('renders a <table> element when HTML contains a table', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        expect(document.querySelector('table')).toBeInTheDocument()
    })

    it('renders thead and tbody elements', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        expect(document.querySelector('thead')).toBeInTheDocument()
        expect(document.querySelector('tbody')).toBeInTheDocument()
    })

    it('renders th elements with uppercase label class', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        const headers = document.querySelectorAll('th')
        expect(headers.length).toBe(2)
        expect(screen.getByText('Plano de Item Mágico')).toBeInTheDocument()
        expect(screen.getByText('Sintonia')).toBeInTheDocument()
    })

    it('renders td cell content', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        expect(screen.getByText('Jarra de Alquimia')).toBeInTheDocument()
        expect(screen.getByText('Bolsa de Retenção')).toBeInTheDocument()
    })

    it('wraps the table in a rounded container div', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        const table = document.querySelector('table')
        // Table should be inside a wrapper div (not a direct child of the prose container)
        expect(table?.parentElement?.tagName.toLowerCase()).toBe('div')
        expect(table?.parentElement?.parentElement?.tagName.toLowerCase()).toBe('div')
    })

    it('table wrapper has border and rounded classes', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        const table = document.querySelector('table')
        const outerWrapper = table?.parentElement?.parentElement
        expect(outerWrapper?.className).toContain('rounded-xl')
        expect(outerWrapper?.className).toContain('border-white/10')
    })

    it('th elements receive uppercase tracking class', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        const th = document.querySelector('th')
        expect(th?.className).toContain('uppercase')
        expect(th?.className).toContain('tracking-')
    })

    it('td elements receive text-xs class', () => {
        render(<MentionContent html={TABLE_HTML} mode="block" />)
        const tds = document.querySelectorAll('td')
        expect(tds.length).toBeGreaterThan(0)
        tds.forEach((td) => {
            expect(td.className).toContain('text-xs')
        })
    })
})
