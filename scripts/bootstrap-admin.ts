#!/usr/bin/env npx ts-node

/**
 * @fileoverview Bootstrap Admin CLI Script
 * Creates or promotes the first admin user in the system.
 *
 * Edge Cases Handled:
 * 1. Email exists in Clerk but not local → link + promote
 * 2. User exists local with role "user" → promote to admin
 * 3. Already admin → notify + skip
 * 4. Clerk/DB failure → clear error message
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-admin.ts <email>
 *   npm run bootstrap-admin -- <email>
 *
 * @see specs/000/spec.md - FR-003
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { clerkClient } from '@clerk/nextjs/server';

// Load environment variables
dotenv.config({ path: ".env" })

// Import after dotenv to ensure env vars are loaded
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UserModel = require('../src/features/users/models/user').User;

interface BootstrapResult {
  success: boolean;
  message: string;
  action: 'created' | 'promoted' | 'linked_promoted' | 'skipped' | 'error';
}

/**
 * Connect to MongoDB with error handling.
 */
async function connectDatabase(overrideHost?: string): Promise<void> {
  let mongoUri = process.env.MONGODB_URI;

  if (overrideHost && mongoUri) {
    // Replace host in URI: mongodb://[user:pass@]host[:port]/db
    // This regex looks for the part after @ (if exists) or after //
    const parts = mongoUri.match(/^(mongodb(?:\+srv)?:\/\/(?:[^:]+:[^@]+@)?)([^:\/?]+)(.*)$/);
    if (parts) {
      const [, prefix, , suffix] = parts;
      mongoUri = `${prefix}${overrideHost}${suffix}`;
      console.log(`🌐 Using custom host: ${overrideHost}`);
      console.log(`🔗 Target URI: ${mongoUri.replace(/:[^@]+@/, ":****@")}`); // Hide password in logs
    }
  }

  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is not set. Check your .env file.");
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to connect to MongoDB at ${overrideHost || "default host"}: ${message}`);
  }
}

/**
 * Find Clerk user by email.
 */
async function findClerkUserByEmail(email: string): Promise<{
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
} | null> {
  try {
    const client = await clerkClient();
    const users = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    if (users.totalCount === 0 || users.data.length === 0) {
      return null;
    }

    const user = users.data[0];
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to query Clerk: ${message}`);
  }
}

/**
 * Update Clerk user metadata to include admin role.
 */
async function updateClerkUserRole(clerkId: string, role: 'admin' | 'user'): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.updateUser(clerkId, {
      publicMetadata: { role },
    });
    console.log(`✅ Updated Clerk user metadata with role: ${role}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`⚠️  Could not update Clerk metadata: ${message}`);
    // Don't throw - local DB is authoritative for roles
  }
}

/**
 * Bootstrap admin user with comprehensive edge case handling.
 */
async function bootstrapAdmin(email: string): Promise<BootstrapResult> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return {
      success: false,
      message: 'Invalid email address provided',
      action: 'error',
    };
  }

  console.log(`\n🔍 Looking for user with email: ${normalizedEmail}`);

  // Check if user exists locally by email
  const localUser = await UserModel.findByEmail(normalizedEmail);

  if (localUser) {
    // Case 3: Already admin → notify + skip
    if (localUser.role === 'admin') {
      console.log('ℹ️  User is already an admin');
      return {
        success: true,
        message: `User "${localUser.username}" (${localUser.email}) is already an admin. No changes made.`,
        action: 'skipped',
      };
    }

    // Case 2: User exists local with role "user" → promote to admin
    console.log('📝 Promoting existing user to admin...');
    localUser.role = 'admin';
    await localUser.save();

    // Update Clerk metadata
    await updateClerkUserRole(localUser.clerkId, 'admin');

    return {
      success: true,
      message: `User "${localUser.username}" promoted to admin successfully.`,
      action: 'promoted',
    };
  }

  // User doesn't exist locally - check Clerk
  console.log('🔍 User not found locally, checking Clerk...');
  const clerkUser = await findClerkUserByEmail(normalizedEmail);

  if (!clerkUser) {
    return {
      success: false,
      message: `No user found with email "${normalizedEmail}" in Clerk. Please create an account first by signing up at the application.`,
      action: 'error',
    };
  }

  // Case 1: Email exists in Clerk but not local → link + promote
  console.log('📝 Creating local user and promoting to admin...');

  const username = clerkUser.username || normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined;

  const newUser = await UserModel.create({
    clerkId: clerkUser.id,
    email: normalizedEmail,
    username,
    name,
    avatarUrl: clerkUser.imageUrl || undefined,
    role: 'admin',
    status: 'active',
  });

  // Update Clerk metadata
  await updateClerkUserRole(clerkUser.id, 'admin');

  return {
    success: true,
    message: `User "${newUser.username}" created and promoted to admin successfully.`,
    action: 'linked_promoted',
  };
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  console.log("🚀 Bootstrap Admin Script");
  console.log("========================\n");

  const args = process.argv.slice(2);

  function getArgValue(name: string): string | undefined {
    const idx = args.findIndex((a) => a.startsWith(`--${name}`));
    if (idx === -1) return undefined;

    const arg = args[idx];
    if (arg.includes("=")) {
      return arg.split("=")[1];
    }
    // If next arg exists and doesn't start with --, it's the value
    if (idx + 1 < args.length && !args[idx + 1].startsWith("--")) {
      return args[idx + 1];
    }
    return undefined;
  }

  // Find email: looks for --email=VAL, --email VAL, or the first non-flag argument
  let email = getArgValue("email");
  if (!email) {
    email = args.find((a) => !a.startsWith("--") && !a.endsWith(".ts"));
  }

  // Find optional --host flag
  const customHost = getArgValue("host");

  if (!email) {
    console.error("❌ Error: Email address is required");
    console.log("\nUsage:");
    console.log("  tsx scripts/bootstrap-admin.ts <email> [--host <mongodb_host>]");
    console.log("  tsx scripts/bootstrap-admin.ts --email <email> [--host <mongodb_host>]");
    console.log("\nExample (Remote DB from local):");
    console.log("  tsx scripts/bootstrap-admin.ts nandobfer@gmail.com --host nandoburgos.dev");
    process.exit(1);
  }

  try {
    await connectDatabase(customHost);
    const result = await bootstrapAdmin(email);

    console.log('\n' + (result.success ? '✅' : '❌'), result.message);

    if (result.success) {
      console.log('\n📋 Next steps:');
      console.log('   1. Log in to the application with this email');
      console.log('   2. Access the admin panel at /admin');
      console.log('   3. Manage users at /users');
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ Fatal Error:', message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the script
main();
