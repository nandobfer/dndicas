import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('features/users/api/get-current-user', () => {
    it('returns an unauthenticated result when Clerk has no session', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findByClerkId: vi.fn() },
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            ensureUserExists: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');

        await expect(mod.getCurrentUserFromDb()).resolves.toMatchObject({
            success: false,
            user: null,
            clerkId: null,
            error: 'Not authenticated',
        });
    });

    it('syncs from Clerk when the local user is missing an avatar', async () => {
        const ensureUserExists = vi.fn().mockResolvedValue({ _id: 'mongo-1', role: 'user' });

        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
            currentUser: vi.fn().mockResolvedValue({
                id: 'clerk-1',
                username: 'hero',
                emailAddresses: [{ id: 'email-1', emailAddress: 'hero@example.com' }],
                primaryEmailAddressId: 'email-1',
                firstName: 'Hero',
                lastName: 'Player',
                imageUrl: 'https://example.com/avatar.png',
                publicMetadata: { role: 'user' },
            }),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findByClerkId: vi.fn().mockResolvedValue({ _id: 'mongo-1', avatarUrl: undefined }),
            },
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            ensureUserExists,
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');
        const result = await mod.getCurrentUserFromDb();

        expect(result).toMatchObject({
            success: true,
            clerkId: 'clerk-1',
            user: { _id: 'mongo-1', role: 'user' },
        });
        expect(ensureUserExists).toHaveBeenCalledWith('clerk-1', expect.objectContaining({
            image_url: 'https://example.com/avatar.png',
        }));
    });

    it('requireAdmin throws when the current user is not an admin', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findByClerkId: vi.fn().mockResolvedValue({ role: 'user' }),
            },
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            ensureUserExists: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');

        await expect(mod.requireAdmin()).rejects.toThrow('Admin access required');
    });
});
