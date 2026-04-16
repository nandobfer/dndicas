import { describe, expect, it, vi } from 'vitest';

import { importFresh } from '../helpers/module';

describe('POST /api/webhooks/clerk', () => {
    it('returns 500 when the webhook secret is not configured', async () => {
        vi.doMock('next/headers', () => ({
            headers: vi.fn(),
        }));
        vi.doMock('svix', () => ({
            Webhook: class {},
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findOneAndUpdate: vi.fn() },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));

        const secret = process.env.CLERK_WEBHOOK_SECRET;
        delete process.env.CLERK_WEBHOOK_SECRET;

        const mod = await importFresh<typeof import('@/app/api/webhooks/clerk/route')>('@/app/api/webhooks/clerk/route');
        const response = await mod.POST(new Request('http://localhost/api/webhooks/clerk', { method: 'POST' }));

        expect(response.status).toBe(500);

        if (secret) {
            process.env.CLERK_WEBHOOK_SECRET = secret;
        }
    });

    it('returns 400 when svix headers are missing', async () => {
        process.env.CLERK_WEBHOOK_SECRET = 'secret';

        vi.doMock('next/headers', () => ({
            headers: vi.fn().mockResolvedValue(new Headers()),
        }));
        vi.doMock('svix', () => ({
            Webhook: class {},
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findOneAndUpdate: vi.fn() },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/webhooks/clerk/route')>('@/app/api/webhooks/clerk/route');
        const response = await mod.POST(new Request('http://localhost/api/webhooks/clerk', { method: 'POST' }));

        expect(response.status).toBe(400);
    });

    it('syncs a user.created event', async () => {
        process.env.CLERK_WEBHOOK_SECRET = 'secret';
        const syncUserFromClerk = vi.fn().mockResolvedValue({ success: true, action: 'created' });

        vi.doMock('next/headers', () => ({
            headers: vi.fn().mockResolvedValue(new Headers({
                'svix-id': 'id-1',
                'svix-timestamp': '123',
                'svix-signature': 'sig',
            })),
        }));
        vi.doMock('svix', () => ({
            Webhook: class {
                verify() {
                    return {
                        type: 'user.created',
                        data: {
                            id: 'clerk-1',
                            username: 'hero',
                            email_addresses: [{ id: 'email-1', email_address: 'hero@example.com' }],
                            primary_email_address_id: 'email-1',
                            first_name: 'Hero',
                            last_name: 'Player',
                            image_url: 'https://example.com/avatar.png',
                            public_metadata: { role: 'user' },
                        },
                    };
                }
            },
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk,
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findOneAndUpdate: vi.fn() },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn(),
        }));

        const mod = await importFresh<typeof import('@/app/api/webhooks/clerk/route')>('@/app/api/webhooks/clerk/route');
        const response = await mod.POST(new Request('http://localhost/api/webhooks/clerk', {
            method: 'POST',
            body: JSON.stringify({ test: true }),
        }));

        expect(response.status).toBe(200);
        expect(syncUserFromClerk).toHaveBeenCalledWith(expect.objectContaining({
            id: 'clerk-1',
            username: 'hero',
        }));
    });

    it('soft deletes a user on user.deleted events', async () => {
        process.env.CLERK_WEBHOOK_SECRET = 'secret';
        const findOneAndUpdate = vi.fn().mockResolvedValue(undefined);

        vi.doMock('next/headers', () => ({
            headers: vi.fn().mockResolvedValue(new Headers({
                'svix-id': 'id-1',
                'svix-timestamp': '123',
                'svix-signature': 'sig',
            })),
        }));
        vi.doMock('svix', () => ({
            Webhook: class {
                verify() {
                    return {
                        type: 'user.deleted',
                        data: { id: 'clerk-1' },
                    };
                }
            },
        }));
        vi.doMock('@/features/users/api/sync', () => ({
            syncUserFromClerk: vi.fn(),
        }));
        vi.doMock('@/features/users/models/user', () => ({
            User: { findOneAndUpdate },
        }));
        vi.doMock('@/core/database/db', () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await importFresh<typeof import('@/app/api/webhooks/clerk/route')>('@/app/api/webhooks/clerk/route');
        const response = await mod.POST(new Request('http://localhost/api/webhooks/clerk', {
            method: 'POST',
            body: JSON.stringify({ test: true }),
        }));

        expect(response.status).toBe(200);
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { clerkId: 'clerk-1' },
            { deleted: true, status: 'inactive' },
        );
    });
});
