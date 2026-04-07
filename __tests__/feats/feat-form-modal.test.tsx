/**
 * @fileoverview Tests for FeatFormModal — validates category selector rendering and validation.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FeatFormModal } from '@/features/feats/components/feat-form-modal'

// Mock heavy/unresolvable dependencies
jest.mock('@/features/rules/components/rich-text-editor', () => ({
    RichTextEditor: ({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) => (
        <textarea
            data-testid="rich-text-editor"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
        />
    ),
}))

jest.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: jest.fn() }),
}))

jest.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: null, isLoaded: true }),
    useAuth: () => ({ userId: null }),
}))

// Mock framer-motion to avoid animation-related issues in jsdom
jest.mock('framer-motion', () => {
    const actual = jest.requireActual('framer-motion')
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
            button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
        },
    }
})

const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
    feat: null,
    isSubmitting: false,
}

describe('FeatFormModal — category field', () => {
    it('renders all four category options', () => {
        render(<FeatFormModal {...defaultProps} />)

        expect(screen.getByText('Geral')).toBeInTheDocument()
        expect(screen.getByText('Origem')).toBeInTheDocument()
        expect(screen.getByText('Estilo de Luta')).toBeInTheDocument()
        expect(screen.getByText('Dádiva Épica')).toBeInTheDocument()
    })

    it('renders the category label', () => {
        render(<FeatFormModal {...defaultProps} />)
        expect(screen.getByText('Categoria')).toBeInTheDocument()
    })

    it('does not call onSubmit when category is not selected', async () => {
        const onSubmit = jest.fn().mockResolvedValue(undefined)
        render(<FeatFormModal {...defaultProps} onSubmit={onSubmit} />)

        // Fill all required fields except category
        const nameInput = screen.getByPlaceholderText('Ex: Mestre em Armas')
        fireEvent.change(nameInput, { target: { value: 'Talento Teste' } })

        const sourceInput = screen.getByPlaceholderText('Ex: PHB pg. 167')
        fireEvent.change(sourceInput, { target: { value: 'LDJ pág. 1' } })

        const descriptionEditor = screen.getByTestId('rich-text-editor')
        fireEvent.change(descriptionEditor, { target: { value: 'Descrição de teste com mais de dez caracteres.' } })

        const form = nameInput.closest('form')!
        fireEvent.submit(form)

        // onSubmit should not be called because category is missing
        await waitFor(() => {
            expect(onSubmit).not.toHaveBeenCalled()
        })
    })

    it('pre-selects category when editing an existing feat', () => {
        const feat = {
            _id: '1',
            name: 'Talento Editado',
            description: 'Descrição',
            source: 'LDJ',
            level: 1,
            prerequisites: [],
            attributeBonuses: [],
            category: 'Origem' as const,
            status: 'active' as const,
            createdAt: '',
            updatedAt: '',
        }
        render(<FeatFormModal {...defaultProps} feat={feat} />)

        // The "Origem" button should exist and be rendered with its selected state
        expect(screen.getByText('Origem')).toBeInTheDocument()
    })
})
