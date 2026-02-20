/**
 * @fileoverview User synchronization service for Clerk → MongoDB sync.
 * Handles user creation, update, and deletion based on Clerk events.
 *
 * @see specs/000/spec.md - FR-001, FR-002
 */

import dbConnect from '@/core/database/db';
import { User, type IUser } from '../models/user';
import type { UserRole, UserStatus } from '../types/user.types';

/**
 * Clerk user data from webhook/API.
 */
export interface ClerkUserData {
  id: string;
  username: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  public_metadata?: {
    role?: UserRole;
  };
}

/**
 * Sync result returned by sync operations.
 */
export interface SyncResult {
  success: boolean;
  user?: IUser;
  action: 'created' | 'updated' | 'deleted' | 'skipped' | 'error';
  error?: string;
}

/**
 * Get primary email from Clerk user data.
 */
function getPrimaryEmail(clerkUser: ClerkUserData): string {
  const primaryEmailId = clerkUser.primary_email_address_id;
  const emailObj = clerkUser.email_addresses.find(
    (e) => e.id === primaryEmailId
  );
  return emailObj?.email_address || clerkUser.email_addresses[0]?.email_address || '';
}

/**
 * Generate username from Clerk user data.
 * Uses username if available, falls back to email prefix.
 */
function generateUsername(clerkUser: ClerkUserData): string {
  if (clerkUser.username) {
    return clerkUser.username;
  }
  
  const email = getPrimaryEmail(clerkUser);
  // Extract username from email and sanitize
  const emailPrefix = email.split('@')[0] || 'user';
  return emailPrefix.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);
}

/**
 * Generate display name from Clerk user data.
 */
function generateName(clerkUser: ClerkUserData): string | undefined {
  const parts = [clerkUser.first_name, clerkUser.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Sync a Clerk user to the local MongoDB database.
 * Creates new user if not exists, updates if exists.
 *
 * @param clerkUser - User data from Clerk
 * @returns SyncResult with operation outcome
 */
export async function syncUserFromClerk(clerkUser: ClerkUserData): Promise<SyncResult> {
  try {
    await dbConnect();

    // Check if user exists by Clerk ID
    let existingUser = await User.findByClerkId(clerkUser.id);

    const email = getPrimaryEmail(clerkUser);
    const username = generateUsername(clerkUser);
    const name = generateName(clerkUser);

    if (existingUser) {
      // Update existing user
      existingUser.email = email;
      existingUser.username = username;
      existingUser.name = name;
      existingUser.avatarUrl = clerkUser.image_url || undefined;
      
      // Only update role if explicitly set in Clerk metadata
      if (clerkUser.public_metadata?.role) {
        existingUser.role = clerkUser.public_metadata.role;
      }

      await existingUser.save();

      return {
        success: true,
        user: existingUser,
        action: 'updated',
      };
    }

    // Check if user with same email exists (might have different clerkId)
    const existingEmailUser = await User.findByEmail(email);
    if (existingEmailUser) {
      // Update the clerkId of the existing user
      existingEmailUser.clerkId = clerkUser.id;
      existingEmailUser.username = username;
      existingEmailUser.name = name;
      existingEmailUser.avatarUrl = clerkUser.image_url || undefined;
      
      if (clerkUser.public_metadata?.role) {
        existingEmailUser.role = clerkUser.public_metadata.role;
      }

      await existingEmailUser.save();

      return {
        success: true,
        user: existingEmailUser,
        action: 'updated',
      };
    }

    // Create new user
    const newUser = await User.create({
      clerkId: clerkUser.id,
      email,
      username,
      name,
      avatarUrl: clerkUser.image_url || undefined,
      role: clerkUser.public_metadata?.role || 'user', // Default to 'user'
      status: 'active' as UserStatus,
    });

    return {
      success: true,
      user: newUser,
      action: 'created',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[UserSync] Failed to sync user:', message);

    return {
      success: false,
      action: 'error',
      error: message,
    };
  }
}

/**
 * Handle user deletion from Clerk.
 * Soft deletes the user by setting status to 'inactive'.
 *
 * @param clerkId - Clerk user ID
 * @returns SyncResult with operation outcome
 */
export async function deleteUserFromClerk(clerkId: string): Promise<SyncResult> {
  try {
    await dbConnect();

    const user = await User.findByClerkId(clerkId);

    if (!user) {
      return {
        success: true,
        action: 'skipped',
      };
    }

    user.status = 'inactive';
    await user.save();

    return {
      success: true,
      user,
      action: 'deleted',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[UserSync] Failed to delete user:', message);

    return {
      success: false,
      action: 'error',
      error: message,
    };
  }
}

/**
 * Ensure user exists in local database for a given Clerk ID.
 * Used as fallback sync on authenticated requests.
 *
 * @param clerkId - Clerk user ID
 * @param clerkUser - Optional Clerk user data (if already fetched)
 * @returns The local user document
 */
export async function ensureUserExists(
  clerkId: string,
  clerkUser?: ClerkUserData
): Promise<IUser | null> {
  try {
    await dbConnect();

    // Check if user exists
    let existingUser = await User.findByClerkId(clerkId)

    // If user exists but is missing data we have, update it
    if (existingUser && clerkUser && !existingUser.avatarUrl && clerkUser.image_url) {
        existingUser.avatarUrl = clerkUser.image_url
        await existingUser.save()
    }

    if (existingUser) {
      return existingUser;
    }

    // If no Clerk user data provided, we can't create the user
    if (!clerkUser) {
      console.warn('[UserSync] Cannot create user without Clerk data');
      return null;
    }

    // Sync user from Clerk
    const result = await syncUserFromClerk(clerkUser);
    return result.user || null;
  } catch (error) {
    console.error('[UserSync] ensureUserExists failed:', error);
    return null;
  }
}
