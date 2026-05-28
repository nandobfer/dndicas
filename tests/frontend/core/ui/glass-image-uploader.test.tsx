import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlassImageUploader } from '@/components/ui/glass-image-uploader';

const sonnerMocks = vi.hoisted(() => ({
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: sonnerMocks.toastSuccess,
        error: sonnerMocks.toastError,
    },
}));

describe('GlassImageUploader', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        sonnerMocks.toastSuccess.mockReset();
        sonnerMocks.toastError.mockReset();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('shows the AI action in the empty state even without explicit AI payload', () => {
        render(
            <GlassImageUploader
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );

        expect(screen.getByTitle('Gerar imagem com IA')).toBeInTheDocument();
    });

    it('renders replace, AI and remove actions together when an image already exists', () => {
        const { container } = render(
            <GlassImageUploader
                value="/api/upload?key=class.png"
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );

        const titledButtons = Array.from(container.querySelectorAll('button[title]')).map((button) => button.getAttribute('title'));

        expect(titledButtons).toEqual(['Trocar imagem', 'Gerar imagem com IA', 'Remover imagem']);
    });

    it('posts a generic fallback prompt when no explicit AI payload is available', async () => {
        const onChange = vi.fn();
        const fetchMock = vi.mocked(global.fetch);

        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    url: '/api/upload?key=ai/generated/clerk-1/portrait.png',
                },
            }),
        } as Response);

        render(
            <GlassImageUploader
                onChange={onChange}
                onRemove={vi.fn()}
                label="Retrato"
                aspectRatio="portrait"
            />
        );

        fireEvent.click(screen.getByTitle('Gerar imagem com IA'));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/core/ai/image', expect.objectContaining({
                method: 'POST',
            }));
        });

        const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
        const body = JSON.parse(String(requestInit?.body)) as {
            entityLabel?: string
            formData?: unknown
            preferredAspectRatio: string
            prompt: string
        };

        expect(body.entityLabel).toBe('Retrato');
        expect(body.formData).toBeUndefined();
        expect(body.preferredAspectRatio).toBe('3:4');
        expect(body.prompt).toContain('Retrato');
        expect(body.prompt).toContain('retrato vertical');
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith('/api/upload?key=ai/generated/clerk-1/portrait.png');
        });
    });

    it('posts the full form payload to the AI image route and updates the field with the generated URL', async () => {
        const onChange = vi.fn();
        const payload = { name: 'Bola de Fogo', description: 'Explosão arcana.' };
        const fetchMock = vi.mocked(global.fetch);

        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    url: '/api/upload?key=ai/generated/clerk-1/fireball.png',
                },
            }),
        } as Response);

        render(
            <GlassImageUploader
                onChange={onChange}
                onRemove={vi.fn()}
                getAIPayload={() => payload}
                aiContextLabel="Magia"
            />
        );

        fireEvent.click(screen.getByTitle('Gerar imagem com IA'));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/core/ai/image', expect.objectContaining({
                method: 'POST',
            }));
        });
        expect(fetchMock).toHaveBeenCalledWith('/api/core/ai/image', expect.objectContaining({
            body: JSON.stringify({
                entityLabel: 'Magia',
                formData: payload,
                preferredAspectRatio: '1:1',
            }),
            headers: {
                'content-type': 'application/json',
            },
        }));
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith('/api/upload?key=ai/generated/clerk-1/fireball.png');
        });
        expect(sonnerMocks.toastSuccess).toHaveBeenCalledWith('Imagem gerada com IA com sucesso!');
    });
});
