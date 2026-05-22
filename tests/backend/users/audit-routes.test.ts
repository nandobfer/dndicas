import { describe, expect, it, vi } from 'vitest';

import { readJson } from '../helpers/http';
import { importFresh } from '../helpers/module';

describe('/api/audit-logs routes', () => {
    it('GET /api/audit-logs/[id] rejects invalid ids', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn(),
            hasRole: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            default: { findById: vi.fn() },
        }));

        const mod = await importFresh<typeof import('@/app/api/audit-logs/[id]/route')>('@/app/api/audit-logs/[id]/route');
        const response = await mod.GET(new Request('http://localhost/api/audit-logs/bad'), {
            params: Promise.resolve({ id: 'bad' }),
        });
        const payload = await readJson(response);

        expect(response.status).toBe(400);
        expect(payload.code).toBe('INVALID_ID');
    });

    it('GET /api/audit-logs/[id] returns 404 when the log is missing', async () => {
        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn(),
            hasRole: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/core/database/audit-log', () => ({
            default: { findById: vi.fn().mockResolvedValue(null) },
        }));

        const mod = await importFresh<typeof import('@/app/api/audit-logs/[id]/route')>('@/app/api/audit-logs/[id]/route');
        const response = await mod.GET(new Request('http://localhost/api/audit-logs/507f1f77bcf86cd799439011'), {
            params: Promise.resolve({ id: '507f1f77bcf86cd799439011' }),
        });

        expect(response.status).toBe(404);
    });

    it('GET /api/audit-logs normalizes legacy and modern fields', async () => {
        const logs = [
            {
                toObject: () => ({
                    action: 'CREATE',
                    collectionName: 'Reference',
                    documentId: 'doc-1',
                    userId: 'clerk-1',
                    actorEmail: 'legacy@example.com',
                    timestamp: new Date('2024-01-01T00:00:00.000Z'),
                }),
            },
            {
                toObject: () => ({
                    action: 'UPDATE',
                    entity: 'User',
                    entityId: 'doc-2',
                    performedBy: 'mongo-1',
                    performedByUser: { username: 'hero' },
                    createdAt: new Date('2024-01-02T00:00:00.000Z'),
                }),
            },
        ];

        vi.doMock('@/core/auth', () => ({
            requireAuth: vi.fn(),
            hasRole: vi.fn(),
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/audit-log-extended', () => ({
            AuditLogExtended: {
                find: vi.fn(() => ({
                    skip: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            sort: vi.fn().mockResolvedValue(logs),
                        })),
                    })),
                })),
                countDocuments: vi.fn().mockResolvedValue(2),
            },
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                find: vi.fn(() => ({
                    lean: vi.fn().mockResolvedValue([
                        {
                            _id: 'mongo-1',
                            clerkId: 'clerk-1',
                            name: 'Hero',
                            username: 'hero',
                            avatarUrl: 'https://example.com/avatar.png',
                            status: 'active',
                            role: 'admin',
                        },
                    ]),
                })),
            },
        }));

        const mod = await importFresh<typeof import('@/app/api/audit-logs/route')>('@/app/api/audit-logs/route');
        const response = await mod.GET(new Request('http://localhost/api/audit-logs?page=1&limit=10'));
        const payload = await readJson(response);

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data).toHaveLength(2);
        expect(payload.data[0]).toEqual(expect.objectContaining({
            entity: 'Reference',
            entityId: 'doc-1',
            performedBy: 'clerk-1',
        }));
    });
});
