#!/usr/bin/env npx ts-node

/**
 * @fileoverview Migrate Spell Images from Description to Image Field
 * 
 * This script iterates through all spells, finds the first <img> tag in the description,
 * extracts the 'src' value, removes the <img> tag from the description,
 * and sets the extracted URL into the dedicated 'image' field.
 *
 * Usage:
 *   npx ts-node scripts/migrate-spell-images.ts [--host <mongodb_host>]
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config({ path: ".env" })

// Import Spell Model
// We'll use require to bypass some strict TS path issues in scripts if they occur, 
// similar to bootstrap-admin.ts
const { Spell } = require('../src/features/spells/models/spell');

/**
 * Connect to MongoDB with error handling.
 * Builds the URI by taking the .env base and replacing parts with provided arguments.
 */
async function connectDatabase(args: { host?: string; user?: string; pass?: string; db?: string; srv?: boolean }): Promise<void> {
  let mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is not set in .env.");
  }

  // Regex decomposition: mongodb(+srv)://[user:pass@]host[:port]/db[?options]
  const uriRegex = /^(mongodb(?:\+srv)?:\/\/)(?:([^:]+):([^@]+)@)?([^:\/?]+(:[0-9]+)?)\/([^?]*)(.*)$/;
  const parts = mongoUri.match(uriRegex);

  if (parts) {
    const [originalFull, protocol, envUser, envPass, envHost, , envDb, options] = parts;
    
    const user = args.user ? encodeURIComponent(args.user) : (envUser || "");
    const pass = args.pass ? encodeURIComponent(args.pass) : (envPass || "");
    const host = args.host || envHost;
    const db = args.db || envDb;

    // Use mongodb+srv if --srv flag is passed, otherwise keep original protocol
    let protocolToUse = protocol;
    if (args.srv) {
        protocolToUse = "mongodb+srv://";
    }

    // Reconstruct URI
    if (user && pass) {
      mongoUri = `${protocolToUse}${user}:${pass}@${host}/${db}${options}`;
    } else {
      mongoUri = `${protocolToUse}${host}/${db}${options}`;
    }

    if (args.user || args.pass || args.host || args.db || args.srv) {
      console.log(`🌐 URI reconstructed with provided arguments.`);
      // Hide password in logs: replace ":password@" with ":****@"
      const logUri = mongoUri.replace(/:([^@]+)@/, ":****@");
      console.log(`🔗 Target: ${logUri}`);
    }
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to connect to MongoDB: ${message}`);
  }
}

/**
 * Main migration logic
 */
async function migrateImages() {
  console.log("🔍 Fetching spells with potential images in description and empty image field...");
  
  // Find spells where description contains an img tag AND image field is empty/unset
  const spells = await Spell.find({
    description: { $regex: /<img[^>]+src="([^">]+)"/i },
    $or: [
      { image: { $exists: false } },
      { image: "" },
      { image: null }
    ]
  });

  console.log(`\nFound ${spells.length} spells to process.\n`);

  let successCount = 0;
  let skippedCount = 0;

  for (const spell of spells) {
    const description = spell.description || "";
    
    // Regex to match the first <img> tag and capture its src
    // Example: <img src="/api/upload?key=...">
    const imgRegex = /<img[^>]+src="([^">]+)"[^>]*>/i;
    const match = description.match(imgRegex);

    if (match && match[0] && match[1]) {
      const fullImgTag = match[0];
      const imgSrc = match[1];

      console.log(`[${spell.name}] Migrating image: ${imgSrc.substring(0, 50)}...`);

      // 1. Remove the first occurrence of the <img> tag from description
      const newDescription = description.replace(fullImgTag, "");

      // 2. Set the image field and update description
      spell.description = newDescription;
      spell.image = imgSrc;

      await spell.save();
      successCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\nMigration completed!`);
  console.log(`✅ Processed: ${successCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
}

async function main() {
  console.log("🚀 Spell Image Migration Script");
  console.log("==============================\n");

  const argsArr = process.argv.slice(2);
  
  function getArg(name: string): string | undefined {
    const idx = argsArr.findIndex(a => a === `--${name}`);
    if (idx !== -1 && argsArr[idx + 1] && !argsArr[idx+1].startsWith('--')) {
      return argsArr[idx + 1];
    }
    // Check for --name=value format
    const namedArg = argsArr.find(a => a.startsWith(`--${name}=`));
    if (namedArg) return namedArg.split('=')[1];
    return undefined;
  }

  const host = getArg("host");
  const user = getArg("user");
  const pass = getArg("pass");
  const db = getArg("db");
  const srv = argsArr.some(a => a === "--srv");

  try {
    await connectDatabase({ host, user, pass, db, srv });
    await migrateImages();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ Fatal Error:', message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
