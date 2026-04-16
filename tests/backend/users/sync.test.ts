import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

function buildClerkUser(overrides: Partial<import('@/features/users/api/sync').ClerkUserData> = {}) {
    return {
        id: 'clerk-1',
        username: null,
        email_addresses: [{ id: 'email-1', email_address: 'hero.player+test@example.com' }],
        primary_email_address_id: 'email-1',
        first_name: 'Hero',
        last_name: 'Player',
        image_url: 'https://example.com/avatar.png',
        public_metadata: {},
        ...overrides,
    };
}

describe('features/users/api/sync', () => {
    it('creates a new local user with default role and sanitized username fallback', async () => {
        const create = vi.fn().mockResolvedValue({ _id: 'mongo-1' });
        const findOne = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne,
                create,
                findByClerkId: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        const result = await mod.syncUserFromClerk(buildClerkUser());

        expect(result.success).toBe(true);
        expect(result.action).toBe('created');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            clerkId: 'clerk-1',
            email: 'hero.player+test@example.com',
            username: 'hero_player_test',
            role: 'user',
            status: 'active',
            deleted: false,
        }));
    });

    it('updates an existing user and preserves role when clerk metadata omits it', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const existingUser = {
            clerkId: 'old-clerk',
            email: 'old@example.com',
            username: 'old_user',
            name: 'Old Name',
            avatarUrl: undefined,
            role: 'admin',
            status: 'inactive',
            deleted: true,
            save,
        };

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue(existingUser),
                create: vi.fn(),
                findByClerkId: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        const result = await mod.syncUserFromClerk(buildClerkUser({ id: 'clerk-2' }));

        expect(result.success).toBe(true);
        expect(result.action).toBe('updated');
        expect(existingUser.role).toBe('admin');
        expect(existingUser.deleted).toBe(false);
        expect(existingUser.status).toBe('active');
        expect(save).toHaveBeenCalled();
    });

    it('reconciles by email when clerk id lookup misses', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const existingUser = {
            clerkId: '',
            email: 'hero.player+test@example.com',
            username: 'legacy_user',
            name: undefined,
            avatarUrl: undefined,
            role: 'user',
            status: 'inactive',
            deleted: true,
            save,
        };
        const findOne = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(existingUser);

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne,
                create: vi.fn(),
                findByClerkId: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        const result = await mod.syncUserFromClerk(buildClerkUser({ public_metadata: { role: 'admin' } }));

        expect(result.action).toBe('updated');
        expect(existingUser.clerkId).toBe('clerk-1');
        expect(existingUser.role).toBe('admin');
    });

    it('marks a user inactive instead of hard deleting on Clerk deletion', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const user = {
            status: 'active',
            save,
        };

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findByClerkId: vi.fn().mockResolvedValue(user),
                findOne: vi.fn(),
                create: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        const result = await mod.deleteUserFromClerk('clerk-1');

        expect(result).toMatchObject({ success: true, action: 'deleted' });
        expect(user.status).toBe('inactive');
        expect(save).toHaveBeenCalled();
    });

    it('ensureUserExists reactivates an existing deleted user and backfills avatar', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const existingUser = {
            deleted: true,
            status: 'inactive',
            avatarUrl: undefined,
            isModified: vi.fn().mockReturnValue(true),
            save,
        };

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue(existingUser),
                findByClerkId: vi.fn(),
                create: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        const user = await mod.ensureUserExists('clerk-1', buildClerkUser());

        expect(user).toBe(existingUser);
        expect(existingUser.deleted).toBe(false);
        expect(existingUser.status).toBe('active');
        expect(existingUser.avatarUrl).toBe('https://example.com/avatar.png');
        expect(save).toHaveBeenCalled();
    });

    it('ensureUserExists returns null when no local user exists and no clerk payload is available', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue(null),
                findByClerkId: vi.fn(),
                create: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/sync')>('@/features/users/api/sync');

        await expect(mod.ensureUserExists('clerk-1')).resolves.toBeNull();
    });
});
