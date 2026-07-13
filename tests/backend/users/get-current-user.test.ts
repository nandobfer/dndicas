import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('features/users/api/get-current-user', () => {
    it('returns an unauthenticated result when Auth.js has no session', async () => {
        vi.doMock('@/core/auth/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findOne: vi.fn() },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');

        await expect(mod.getCurrentUserFromDb()).resolves.toMatchObject({
            success: false,
            user: null,
            userId: null,
            error: 'Not authenticated',
        });
    });

    it('returns the active local user for the Auth.js session id', async () => {
        const localUser = { _id: 'mongo-1', role: 'user', status: 'active', legacyClerkId: 'legacy-1' };
        vi.doMock('@/core/auth/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'mongo-1' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue(localUser),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');
        const result = await mod.getCurrentUserFromDb();

        expect(result).toMatchObject({
            success: true,
            userId: 'mongo-1',
            legacyClerkId: 'legacy-1',
            user: { _id: 'mongo-1', role: 'user' },
        });
    });

    it('requireAdmin throws when the current user is not an admin', async () => {
        vi.doMock('@/core/auth/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'mongo-1' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue({ role: 'user', status: 'active' }),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');

        await expect(mod.requireAdmin()).rejects.toThrow('Admin access required');
    });

    it('blocks inactive local users before authorizing backend access', async () => {
        vi.doMock('@/core/auth/server', () => ({
            auth: vi.fn().mockResolvedValue({ userId: 'mongo-1' }),
            currentUser: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue({ role: 'admin', status: 'inactive', legacyClerkId: 'legacy-1' }),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/get-current-user')>('@/features/users/api/get-current-user');

        await expect(mod.getCurrentUserFromDb()).resolves.toMatchObject({
            success: false,
            user: null,
            userId: 'mongo-1',
            legacyClerkId: 'legacy-1',
            error: 'Usuário inativo',
        });
        await expect(mod.requireAdmin()).rejects.toThrow('Usuário inativo');
    });
});
