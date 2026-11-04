import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from 'next-auth';

import { importFresh } from '../helpers/module';

const dbConnect = vi.fn();
const compare = vi.fn();
const save = vi.fn();
const findOne = vi.fn();
const create = vi.fn();
const signupRoleIds = vi.fn();
const loggerError = vi.fn();

vi.mock('@/lib/db', () => ({
    dbConnect,
}));

vi.mock('bcryptjs', () => ({
    compare,
}));

vi.mock('@/features/users/models/user', () => ({
    User: {
        findOne,
        create,
    },
}));

vi.mock('@/features/perfix/server/settings', () => ({ signupRoleIds }));

vi.mock('@/lib/logger', () => ({
    logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), child: vi.fn() },
}));

describe('Auth.js options', () => {
    beforeEach(() => {
        dbConnect.mockResolvedValue(undefined);
        compare.mockReset();
        save.mockReset();
        findOne.mockReset();
        create.mockReset();
        signupRoleIds.mockReset();
        loggerError.mockReset();
    });

    it('authenticates credentials against an imported bcrypt hash', async () => {
        compare.mockResolvedValue(true);
        const user = {
            _id: { toString: () => 'local-user-1' },
            email: 'hero@example.com',
            username: 'hero',
            name: 'Hero',
            avatarUrl: 'https://example.com/avatar.png',
            roles: ['role-admin'],
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
            roles: ['role-user'],
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
            status: 'active',
            image: 'https://example.com/google.png',
        }));
        expect(save).toHaveBeenCalled();
    });

    const googleSignIn = async (nextAuthUser: { id: string; email: string; name: string; image: string }) => {
        const { authOptions } = await importFresh<typeof import('@/features/auth/auth-options')>('@/features/auth/auth-options');
        return authOptions.callbacks?.signIn?.({
            user: nextAuthUser,
            account: { provider: 'google', type: 'oauth', providerAccountId: 'g-new' },
            profile: { email: nextAuthUser.email, name: nextAuthUser.name, picture: nextAuthUser.image } as unknown as Profile,
            email: undefined,
            credentials: undefined,
        });
    };

    it('cria no primeiro login Google o usuário com o perfil padrão do Perfix', async () => {
        findOne.mockImplementation(() => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }), then: (resolve: (value: null) => unknown) => resolve(null) }));
        signupRoleIds.mockResolvedValue(['role-user']);
        create.mockImplementation(async (data: Record<string, unknown>) => ({ _id: { toString: () => 'new-user' }, ...data }));
        const nextAuthUser = { id: 'g-new', email: 'novo@example.com', name: 'Novo', image: 'https://example.com/n.png' };

        await expect(googleSignIn(nextAuthUser)).resolves.toBe(true);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'novo@example.com', roles: ['role-user'] }));
        expect(create.mock.calls[0]![0]).not.toHaveProperty('role');
        expect(nextAuthUser.id).toBe('new-user');
    });

    it('devolve o usuário para a tela de login quando o primeiro acesso Google falha no servidor', async () => {
        findOne.mockImplementation(() => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }), then: (resolve: (value: null) => unknown) => resolve(null) }));
        signupRoleIds.mockResolvedValue(['role-user']);
        create.mockRejectedValue(Object.assign(
            new Error('E11000 duplicate key error dup key: { email: "novo@example.com" }'),
            { name: 'MongoServerError', code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'novo@example.com' } },
        ));

        await expect(googleSignIn({ id: 'g-new', email: 'novo@example.com', name: 'Novo', image: '' })).resolves.toBe('/sign-in?error=GoogleSignInFailed');
        expect(loggerError).toHaveBeenCalledWith(
            { provider: 'google', errorName: 'MongoServerError', code: 11000, fields: ['email'] },
            'Falha no login com Google',
        );
        expect(JSON.stringify(loggerError.mock.calls)).not.toContain('novo@example.com');
    });

    it('bloqueia o primeiro login Google com mensagem acionável quando falta perfil padrão', async () => {
        const { DomainError } = await import('@/lib/api/route');
        findOne.mockImplementation(() => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }), then: (resolve: (value: null) => unknown) => resolve(null) }));
        signupRoleIds.mockRejectedValue(new DomainError(503, 'Cadastro indisponível', 'SIGNUP_UNAVAILABLE'));

        await expect(googleSignIn({ id: 'g-new', email: 'novo@example.com', name: 'Novo', image: '' })).resolves.toBe('/sign-in?error=SignupUnavailable');
        expect(create).not.toHaveBeenCalled();
    });
});
