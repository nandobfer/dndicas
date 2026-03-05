#!/usr/bin/env npx ts-node

import * as dotenv from "dotenv";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

import mongoose from "mongoose";
import { createClerkClient } from "@clerk/backend";

const { syncUserFromClerk } = require("../src/features/users/api/sync");

async function connectDatabase(overrideHost?: string) {
  let mongoUri = process.env.MONGODB_URI;
  if (overrideHost && mongoUri) {
    const parts = mongoUri.match(/^(mongodb(?:\+srv)?:\/\/(?:[^:]+:[^@]+@)?)([^:\/?]+)(.*)$/);
    if (parts) {
      const [, prefix, , suffix] = parts;
      mongoUri = `${prefix}${overrideHost}${suffix}`;
      console.log(`Using custom host: ${overrideHost}`);
    }
  }
  if (!mongoUri) throw new Error("MONGODB_URI not set.");
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB");
}

async function main() {
  console.log("🚀 Syncing Users from Clerk...");
  const args = process.argv.slice(2);
  const getArgValue = (name: string) => {
    const idx = args.findIndex((a) => a === `--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const customHost = getArgValue("host");

  try {
    await connectDatabase(customHost);
    const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    console.log("📥 Fetching users from Clerk...");
    
    let totalSynced = 0;
    let offset = 0;
    const limit = 50;

    while (true) {
        const response = await client.users.getUserList({ limit, offset });
        if (response.data.length === 0) break;
        for (const user of response.data) {
            const clerkUserData = {
                id: user.id,
                username: user.username,
                email_addresses: user.emailAddresses.map(e => ({ id: e.id, email_address: e.emailAddress })),
                primary_email_address_id: user.primaryEmailAddressId,
                first_name: user.firstName,
                last_name: user.lastName,
                image_url: user.imageUrl,
                public_metadata: user.publicMetadata,
            };
            const result = await syncUserFromClerk(clerkUserData);
            if (result.success) {
                console.log(`   ✅ ${result.action.toUpperCase()}: ${user.username || user.id}`);
                totalSynced++;
            }
        }
        offset += limit;
        if (offset >= (response.totalCount || 0)) break;
    }
    console.log("\n✅ Sync Completed! Total: " + totalSynced);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal Error:", error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}
main();