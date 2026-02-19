/**
 * @fileoverview Helper to get current authenticated user from MongoDB.
 * Combines Clerk authentication with local database lookup.
 *
 * @see specs/000/spec.md - FR-002
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import dbConnect from '@/core/database/db';
import { User, type IUser } from '../models/user';
import { ensureUserExists, type ClerkUserData } from './sync';

/**
 * Result of getting current user.
 */
export interface CurrentUserResult {
  /** Whether the operation was successful */
  success: boolean;
  /** The local user document if found */
  user: IUser | null;
  /** Clerk user ID */
  clerkId: string | null;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Convert Clerk currentUser() response to our ClerkUserData format.
 */
function convertCurrentUser(user: Awaited<ReturnType<typeof currentUser>>): ClerkUserData | null {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    email_addresses: user.emailAddresses.map((e) => ({
      id: e.id,
      email_address: e.emailAddress,
    })),
    primary_email_address_id: user.primaryEmailAddressId,
    first_name: user.firstName,
    last_name: user.lastName,
    image_url: user.imageUrl,
    public_metadata: user.publicMetadata as { role?: 'admin' | 'user' } | undefined,
  };
}

/**
 * Get the current authenticated user from MongoDB.
 * Creates the user if they don't exist (fallback sync).
 *
 * @returns CurrentUserResult with user data
 */
export async function getCurrentUserFromDb(): Promise<CurrentUserResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return {
        success: false,
        user: null,
        clerkId: null,
        error: 'Not authenticated',
      };
    }

    await dbConnect();

    // Try to find existing user
    let user = await User.findByClerkId(userId);

    if (!user) {
      // Fallback: sync user from Clerk
      const clerkUser = await currentUser();
      const clerkUserData = convertCurrentUser(clerkUser);

      if (clerkUserData) {
        user = await ensureUserExists(userId, clerkUserData);
      }
    }

    return {
      success: true,
      user,
      clerkId: userId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[getCurrentUserFromDb] Error:', message);

    return {
      success: false,
      user: null,
      clerkId: null,
      error: message,
    };
  }
}

/**
 * Get the current authenticated user from MongoDB.
 * Throws error if user is not authenticated or not found.
 *
 * @returns The local user document
 * @throws Error if not authenticated or user not found
 */
export async function requireCurrentUser(): Promise<IUser> {
  const result = await getCurrentUserFromDb();

  if (!result.success || !result.user) {
    throw new Error(result.error || 'User not found');
  }

  return result.user;
}

/**
 * Check if the current user has admin role.
 *
 * @returns boolean indicating admin status
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const result = await getCurrentUserFromDb();
  return result.user?.role === 'admin';
}

/**
 * Require the current user to have admin role.
 * Throws error if not admin.
 *
 * @returns The local user document
 * @throws Error if not admin
 */
export async function requireAdmin(): Promise<IUser> {
  const user = await requireCurrentUser();

  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}
