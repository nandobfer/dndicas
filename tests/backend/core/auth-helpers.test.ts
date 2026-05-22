import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('core/auth helpers', () => {
    it('requireAuth returns the current user id', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'user-1' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.requireAuth()).resolves.toBe('user-1');
    });

    it('requireAuth throws when the request is anonymous', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.requireAuth()).rejects.toThrow('UNAUTHORIZED');
    });

    it('hasAnyRole returns false when the user has no role', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
            currentUser: vi.fn().mockResolvedValue({
                publicMetadata: {},
            }),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.hasAnyRole(['admin', 'user'])).resolves.toBe(false);
    });

    it('hasAllRoles only returns true for the single assigned role', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
            currentUser: vi.fn().mockResolvedValue({
                publicMetadata: { role: 'admin' },
            }),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.hasAllRoles(['admin'])).resolves.toBe(true);
        await expect(mod.hasAllRoles(['admin', 'user'])).resolves.toBe(false);
    });

    it('getUserInfo derives the primary email and name payload', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
            currentUser: vi.fn().mockResolvedValue({
                id: 'user-1',
                primaryEmailAddress: { emailAddress: 'hero@example.com' },
                firstName: 'Hero',
                lastName: 'Player',
                imageUrl: 'https://example.com/avatar.png',
            }),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.getUserInfo()).resolves.toEqual({
            id: 'user-1',
            email: 'hero@example.com',
            firstName: 'Hero',
            lastName: 'Player',
            fullName: 'Hero Player',
            imageUrl: 'https://example.com/avatar.png',
        });
    });

    it('isEmailVerified checks the primary email verification status', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn(),
            currentUser: vi.fn().mockResolvedValue({
                primaryEmailAddressId: 'email-1',
                emailAddresses: [
                    { id: 'email-1', verification: { status: 'verified' } },
                ],
            }),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.isEmailVerified()).resolves.toBe(true);
    });

    it('logAuthAction writes an audit entry and swallows audit failures', async () => {
        const logAction = vi.fn().mockRejectedValue(new Error('db down'));

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'user-99' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            logAction,
        }));

        const mod = await importFresh<typeof import('@/core/auth/helpers')>('@/core/auth/helpers');

        await expect(mod.logAuthAction('LOGIN', { source: 'test' })).resolves.toBeUndefined();
        expect(logAction).toHaveBeenCalledWith(
            'LOGIN',
            'Auth',
            'user-99',
            'user-99',
            expect.objectContaining({
                source: 'test',
                timestamp: expect.any(String),
            }),
        );
    });
});
