#!/usr/bin/env npx ts-node

/**
 * @fileoverview Bootstrap Admin CLI Script
 * Creates or promotes the first admin user in the system.
 *
 * Edge Cases Handled:
 * 1. User exists local with role "user" → promote to admin
 * 2. Already admin → notify + skip
 * 3. User does not exist → create local admin requiring password setup
 * 4. DB failure → clear error message
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-admin.ts <email>
 *   npm run bootstrap-admin -- <email>
 *
 * @see specs/000/spec.md - FR-003
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config({ path: ".env" })

// Import after dotenv to ensure env vars are loaded
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UserModel = require('../src/features/users/models/user').User;

interface BootstrapResult {
  success: boolean;
  message: string;
  action: 'created' | 'promoted' | 'skipped' | 'error';
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

    return {
      success: true,
      message: `User "${localUser.username}" promoted to admin successfully.`,
      action: 'promoted',
    };
  }

  console.log('📝 Creating local admin user...');

  const username = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');

  const newUser = await UserModel.create({
    email: normalizedEmail,
    username,
    role: 'admin',
    status: 'active',
    deleted: false,
    passwordSetupRequired: true,
  });

  return {
    success: true,
    message: `User "${newUser.username}" created as admin. Define a local password before logging in.`,
    action: 'created',
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
