import { describe, expect, it, vi } from 'vitest';

import { makeJsonRequest, readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('/api/users routes', () => {
    it('GET /api/users validates filters and returns 400 for invalid pagination', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            clerkClient: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                find: vi.fn(),
                countDocuments: vi.fn(),
            },
        }));
        vi.doMock('@/features/users/api/get-current-user', () => ({
            requireAdmin: vi.fn(),
            getCurrentUserFromDb: vi.fn(),
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/users/route')>('@/app/api/users/route');
        const response = await mod.GET(new Request('http://localhost/api/users?page=0'));
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.error).toBe('Filtros inválidos');
    });

    it('GET /api/users lists paginated users with normalized response fields', async () => {
        const lean = vi.fn().mockResolvedValue([
            {
                _id: { toString: () => 'mongo-1' },
                clerkId: 'clerk-1',
                username: 'hero',
                email: 'hero@example.com',
                name: 'Hero',
                avatarUrl: null,
                role: 'admin',
                status: 'active',
                deleted: false,
                createdAt: new Date('2024-01-01T00:00:00.000Z'),
                updatedAt: new Date('2024-01-02T00:00:00.000Z'),
            },
        ]);
        const limit = vi.fn(() => ({ lean }));
        const skip = vi.fn(() => ({ limit }));
        const sort = vi.fn(() => ({ skip }));

        vi.doMock('@clerk/nextjs/server', () => ({
            clerkClient: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                find: vi.fn(() => ({ sort })),
                countDocuments: vi.fn().mockResolvedValue(1),
            },
        }));
        vi.doMock('@/features/users/api/get-current-user', () => ({
            requireAdmin: vi.fn(),
            getCurrentUserFromDb: vi.fn(),
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/users/route')>('@/app/api/users/route');
        const response = await mod.GET(new Request('http://localhost/api/users?search=hero&status=all&role=admin&page=1&limit=10'));
        const payload = await readJson(response);

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            items: [
                {
                    id: 'mongo-1',
                    clerkId: 'clerk-1',
                    username: 'hero',
                    email: 'hero@example.com',
                    name: 'Hero',
                    avatarUrl: null,
                    role: 'admin',
                    status: 'active',
                    deleted: false,
                    createdAt: '2024-01-01T00:00:00.000Z',
                    updatedAt: '2024-01-02T00:00:00.000Z',
                },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
        });
    });

    it('POST /api/users returns 403 when the current user is not admin', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            clerkClient: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {},
        }));
        vi.doMock('@/features/users/api/get-current-user', () => ({
            requireAdmin: vi.fn().mockRejectedValue(new Error('forbidden')),
            getCurrentUserFromDb: vi.fn(),
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/users/route')>('@/app/api/users/route');
        const response = await mod.POST(makeJsonRequest('http://localhost/api/users', {
            method: 'POST',
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(403);
    });

    it('PUT /api/users/[id] blocks self-role changes', async () => {
        const user = {
            _id: { toString: () => 'mongo-1' },
            clerkId: 'clerk-1',
            username: 'hero',
            email: 'hero@example.com',
            name: 'Hero',
            role: 'admin',
            status: 'active',
            updatedAt: new Date('2024-01-02T00:00:00.000Z'),
            save: vi.fn(),
        };

        vi.doMock('@clerk/nextjs/server', () => ({
            clerkClient: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findOne: vi.fn().mockResolvedValue(user),
            },
        }));
        vi.doMock('@/features/users/api/get-current-user', () => ({
            requireAdmin: vi.fn().mockResolvedValue({ _id: { toString: () => 'mongo-1' }, role: 'admin' }),
            getCurrentUserFromDb: vi.fn(),
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/users/[id]/route')>('@/app/api/users/[id]/route');
        const response = await mod.PUT(makeJsonRequest('http://localhost/api/users/mongo-1', {
            method: 'PUT',
            body: JSON.stringify({ role: 'user' }),
        }), { params: Promise.resolve({ id: 'mongo-1' }) });
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.error).toContain('própria função');
    });

    it('DELETE /api/users/[id] blocks self deletion', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({
            clerkClient: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {},
        }));
        vi.doMock('@/features/users/api/get-current-user', () => ({
            requireAdmin: vi.fn().mockResolvedValue({ _id: { toString: () => 'mongo-1' } }),
            getCurrentUserFromDb: vi.fn(),
        }));
        vi.doMock('@/features/users/api/audit-service', () => ({
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/users/[id]/route')>('@/app/api/users/[id]/route');
        const response = await mod.DELETE(new Request('http://localhost/api/users/mongo-1', {
            method: 'DELETE',
        }), { params: Promise.resolve({ id: 'mongo-1' }) });
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.error).toContain('própria conta');
    });
});
