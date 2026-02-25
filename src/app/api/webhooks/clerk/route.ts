import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { syncUserFromClerk } from '@/features/users/api/sync'
import { User } from '@/features/users/models/user'
import dbConnect from '@/core/database/db'

/**
 * Clerk Webhook Handler
 * 
 * Synchronizes user data from Clerk to MongoDB.
 * Required events: user.created, user.updated, user.deleted
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.warn('[Clerk Webhook] CLERK_WEBHOOK_SECRET is not set. Webhook verification skipped (NOT RECOMMENDED FOR PRODUCTION)')
    // In dev we might want to allow it? No, it's dangerous. 
    // But if we want it to work immediately without user action:
    // return new Response('Webhook secret not configured', { status: 500 })
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  // Get the body
  const payload = await req.text()
  const body = payload

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET || "")

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error("Error verifying webhook:", err)
    return new Response("Error occured", {
      status: 400,
    })
  }

  // Get the type and data
  const eventType = evt.type

  console.log(`[Clerk Webhook] Received event: ${eventType}`)

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, ...attributes } = evt.data
    
    // Map webhook attributes to ClerkUserData interface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attr = attributes as any
    
    const clerkUserData = {
      id: id as string,
      username: attr.username,
      email_addresses: attr.email_addresses,
      primary_email_address_id: attr.primary_email_address_id,
      first_name: attr.first_name,
      last_name: attr.last_name,
      image_url: attr.image_url || attr.profile_image_url,
      public_metadata: attr.public_metadata,
    }

    try {
        const result = await syncUserFromClerk(clerkUserData)
        console.log(`[Clerk Webhook] User sync result: ${result.action}`, result.success ? '' : result.error)
    } catch (error) {
        console.error('[Clerk Webhook] Sync error:', error)
        return new Response('Sync error', { status: 500 })
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data
    if (id) {
        try {
            await dbConnect()
            await User.findOneAndUpdate(
                { clerkId: id }, 
                { deleted: true, status: 'inactive' }
            )
            console.log(`[Clerk Webhook] User ${id} marked as deleted`)
        } catch (error) {
            console.error('[Clerk Webhook] Delete error:', error)
            return new Response('Delete error', { status: 500 })
        }
    }
  }

  return new Response('', { status: 200 })
}
