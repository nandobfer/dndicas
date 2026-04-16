import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { TraitFormModal } from '@/features/traits/components/trait-form-modal'

vi.mock('@/features/rules/components/rich-text-editor', () => ({
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

vi.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: vi.fn() }),
}))

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: null, isLoaded: true }),
    useAuth: () => ({ userId: null }),
}))

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
    const MockDiv = ({ children, layoutId, initial, animate, exit, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; layoutId?: string }) => (
        <div {...props}>{children}</div>
    )
    const MockButton = ({ children, layoutId, initial, animate, exit, transition, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode; layoutId?: string }) => (
        <button {...props}>{children}</button>
    )
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: MockDiv,
            button: MockButton,
        },
    }
})

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    trait: null,
    isSubmitting: false,
}

describe('TraitFormModal — charges behavior', () => {
    it('submits with charges undefined when creating without touching the selector', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        render(<TraitFormModal {...defaultProps} onSubmit={onSubmit} />)

        fireEvent.change(screen.getByPlaceholderText('Ex: Fúria Bárbara'), { target: { value: 'Habilidade Teste' } })
        fireEvent.change(screen.getByPlaceholderText('Ex: PHB pg. 48'), { target: { value: 'LDJ pág. 1' } })
        fireEvent.change(screen.getByTestId('rich-text-editor'), { target: { value: 'Descrição de teste com mais de dez caracteres.' } })

        fireEvent.submit(screen.getByPlaceholderText('Ex: Fúria Bárbara').closest('form')!)

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Habilidade Teste',
                    charges: undefined,
                }),
            )
        })
    })

    it('preserves existing charges when editing', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined)
        const trait = {
            _id: '1',
            id: '1',
            name: 'Habilidade Editada',
            description: 'Descrição existente com mais de dez caracteres.',
            charges: { mode: 'fixed' as const, value: '2' },
            source: 'LDJ',
            status: 'active' as const,
            createdAt: '',
            updatedAt: '',
        }

        render(<TraitFormModal {...defaultProps} onSubmit={onSubmit} trait={trait} />)

        fireEvent.submit(screen.getByPlaceholderText('Ex: Fúria Bárbara').closest('form')!)

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    charges: { mode: 'fixed', value: '2' },
                }),
            )
        })
    })
})
