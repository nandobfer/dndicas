/**
 * @fileoverview Clerk webhook handler for user synchronization events.
 * Receives webhooks from Clerk and syncs user data to MongoDB.
 *
 * @see specs/000/spec.md - FR-001, FR-002
 */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/nextjs/server';
import {
  syncUserFromClerk,
  deleteUserFromClerk,
  type ClerkUserData,
} from '@/features/users/api/sync';

/**
 * Verify Clerk webhook signature using Svix.
 */
async function verifyWebhook(req: NextRequest): Promise<WebhookEvent | null> {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[Webhook] Missing CLERK_WEBHOOK_SECRET environment variable');
    return null;
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Webhook] Missing Svix headers');
    return null;
  }

  const payload = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);

  try {
    const evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;

    return evt;
  } catch (err) {
    console.error('[Webhook] Verification failed:', err);
    return null;
  }
}

/**
 * Convert Clerk webhook user data to our sync format.
 */
function convertClerkUserData(userData: Record<string, unknown>): ClerkUserData {
  return {
    id: userData.id as string,
    username: (userData.username as string | null) || null,
    email_addresses: (userData.email_addresses as Array<{
      id: string;
      email_address: string;
    }>) || [],
    primary_email_address_id: (userData.primary_email_address_id as string | null) || null,
    first_name: (userData.first_name as string | null) || null,
    last_name: (userData.last_name as string | null) || null,
    image_url: (userData.image_url as string | null) || null,
    public_metadata: userData.public_metadata as { role?: 'admin' | 'user' } | undefined,
  };
}

/**
 * POST /api/webhooks/clerk
 * Handle incoming Clerk webhook events.
 */
export async function POST(req: NextRequest) {
  const evt = await verifyWebhook(req);

  if (!evt) {
    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 400 }
    );
  }

  const eventType = evt.type;

  console.log(`[Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case 'user.created':
      case 'user.updated': {
        const userData = convertClerkUserData(evt.data as unknown as Record<string, unknown>);
        const result = await syncUserFromClerk(userData);

        if (!result.success) {
          console.error(`[Webhook] User sync failed: ${result.error}`);
          // Still return 200 to prevent Clerk retries for validation errors
          return NextResponse.json({
            received: true,
            action: result.action,
            error: result.error,
          });
        }

        console.log(`[Webhook] User ${result.action}: ${result.user?.email}`);
        return NextResponse.json({
          received: true,
          action: result.action,
          userId: result.user?._id.toString(),
        });
      }

      case 'user.deleted': {
        const clerkId = (evt.data as unknown as Record<string, unknown>).id as string;
        
        if (!clerkId) {
          return NextResponse.json({ received: true, action: 'skipped' });
        }

        const result = await deleteUserFromClerk(clerkId);

        console.log(`[Webhook] User deletion ${result.action}`);
        return NextResponse.json({
          received: true,
          action: result.action,
        });
      }

      default:
        // Ignore other events
        console.log(`[Webhook] Ignoring event: ${eventType}`);
        return NextResponse.json({ received: true, action: 'ignored' });
    }
  } catch (error) {
    console.error('[Webhook] Handler error:', error);
    // Return 200 to prevent retries for unrecoverable errors
    return NextResponse.json({
      received: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/webhooks/clerk
 * Health check endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Clerk webhook handler',
    timestamp: new Date().toISOString(),
  });
}
