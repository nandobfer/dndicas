import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from 'next-auth';

import { importFresh } from '../helpers/module';

const dbConnect = vi.fn();
const compare = vi.fn();
const save = vi.fn();
const findOne = vi.fn();

vi.mock('@/core/database/db', () => ({
    default: dbConnect,
}));

vi.mock('bcryptjs', () => ({
    compare,
}));

vi.mock('@/features/users/models/user', () => ({
    User: {
        findOne,
        create: vi.fn(),
    },
}));

describe('Auth.js options', () => {
    beforeEach(() => {
        dbConnect.mockResolvedValue(undefined);
        compare.mockReset();
        save.mockReset();
        findOne.mockReset();
    });

    it('authenticates credentials against an imported bcrypt hash', async () => {
        compare.mockResolvedValue(true);
        const user = {
            _id: { toString: () => 'local-user-1' },
            email: 'hero@example.com',
            username: 'hero',
            name: 'Hero',
            avatarUrl: 'https://example.com/avatar.png',
            role: 'admin',
            status: 'active',
            passwordSetupRequired: false,
            passwordHash: '$2a$10$imported',
            save,
        };
        const select = vi.fn().mockResolvedValue(user);
        findOne.mockReturnValue({ select });

        const { authorizeCredentials } = await importFresh<typeof import('@/features/auth/auth-options')>('@/features/auth/auth-options');

        const result = await authorizeCredentials({ identifier: 'HERO@example.com ', password: 'secret' });

        expect(findOne).toHaveBeenCalledWith({
            deleted: { $ne: true },
            $or: [{ email: 'hero@example.com' }, { username: 'hero@example.com' }],
        });
        expect(select).toHaveBeenCalledWith('+passwordHash');
        expect(compare).toHaveBeenCalledWith('secret', '$2a$10$imported');
        expect(save).toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            id: 'local-user-1',
            email: 'hero@example.com',
            username: 'hero',
            role: 'admin',
            status: 'active',
        }));
    });

    it('maps Google sign-in to an existing local user by email', async () => {
        const user = {
            _id: { toString: () => 'local-google-user' },
            email: 'hero@example.com',
            username: 'hero',
            name: 'Hero',
            avatarUrl: undefined,
            role: 'user',
            status: 'active',
            save,
        };
        findOne.mockResolvedValue(user);

        const { authOptions } = await importFresh<typeof import('@/features/auth/auth-options')>('@/features/auth/auth-options');
        const nextAuthUser = { id: 'google-profile-id', email: 'Hero@example.com', name: 'Hero Google', image: 'https://example.com/google.png' };
        const accepted = await authOptions.callbacks?.signIn?.({
            user: nextAuthUser,
            account: { provider: 'google', type: 'oauth', providerAccountId: 'google-profile-id' },
            profile: { email: 'Hero@example.com', name: 'Hero Google', picture: 'https://example.com/google.png' } as unknown as Profile,
            email: undefined,
            credentials: undefined,
        });

        expect(accepted).toBe(true);
        expect(findOne).toHaveBeenCalledWith({ email: 'hero@example.com', deleted: { $ne: true } });
        expect(nextAuthUser).toEqual(expect.objectContaining({
            id: 'local-google-user',
            email: 'hero@example.com',
            username: 'hero',
            role: 'user',
            status: 'active',
            image: 'https://example.com/google.png',
        }));
        expect(save).toHaveBeenCalled();
    });
});
