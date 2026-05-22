import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('features/users/api/audit-service', () => {
    it('computeDiff reports added, removed, and changed fields', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));
        vi.doMock('@/features/users/models/audit-log-extended', () => ({
            AuditLogExtended: { create: vi.fn() },
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findById: vi.fn(),
                findByClerkId: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/audit-service')>('@/features/users/api/audit-service');

        expect(mod.computeDiff(
            { name: 'Old', removed: true, unchanged: 'same' },
            { name: 'New', added: true, unchanged: 'same' },
        )).toEqual({
            added: ['added'],
            removed: ['removed'],
            changed: [{ field: 'name', oldValue: 'Old', newValue: 'New' }],
        });
    });

    it('createAuditLog sanitizes technical fields and enriches performer details', async () => {
        const create = vi.fn().mockResolvedValue({ _id: 'audit-1' });
        const findByIdLean = vi.fn().mockResolvedValue({
            _id: 'mongo-1',
            name: 'Hero',
            username: 'hero',
            email: 'hero@example.com',
            avatarUrl: null,
            role: 'admin',
            status: 'active',
        });

        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/audit-log-extended', () => ({
            AuditLogExtended: { create },
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findById: vi.fn(() => ({ lean: findByIdLean })),
                findByClerkId: vi.fn(),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/audit-service')>('@/features/users/api/audit-service');

        await mod.createAuditLog({
            action: 'CREATE',
            entity: 'User',
            entityId: 'mongo-2',
            performedBy: 'mongo-1',
            newData: {
                _id: 'mongo-2',
                __v: 0,
                clerkId: 'clerk-1',
                name: 'Created User',
            },
        });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            performedByUser: expect.objectContaining({
                username: 'hero',
                email: 'hero@example.com',
            }),
            newData: {
                _id: 'mongo-2',
                name: 'Created User',
            },
        }));
    });

    it('createAuditLog returns null on persistence failure', async () => {
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock('@/features/users/models/audit-log-extended', () => ({
            AuditLogExtended: { create: vi.fn().mockRejectedValue(new Error('fail')) },
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: {
                findById: vi.fn(() => ({ lean: vi.fn().mockResolvedValue(null) })),
                findByClerkId: vi.fn().mockResolvedValue(null),
            },
        }));

        const mod = await importFresh<typeof import('@/features/users/api/audit-service')>('@/features/users/api/audit-service');

        await expect(mod.createAuditLog({
            action: 'DELETE',
            entity: 'User',
            entityId: 'mongo-2',
            performedBy: 'mongo-1',
        })).resolves.toBeNull();
    });
});
