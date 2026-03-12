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
 */
async function connectDatabase(overrideHost?: string): Promise<void> {
  let mongoUri = process.env.MONGODB_URI;

  if (overrideHost && mongoUri) {
    const parts = mongoUri.match(/^(mongodb(?:\+srv)?:\/\/(?:[^:]+:[^@]+@)?)([^:\/?]+)(.*)$/);
    if (parts) {
      const [, prefix, , suffix] = parts;
      mongoUri = `${prefix}${overrideHost}${suffix}`;
      console.log(`🌐 Using custom host: ${overrideHost}`);
    }
  }

  if (!mongoUri) {
    throw new Error("MONGODB_URI environment variable is not set.");
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

  const args = process.argv.slice(2);
  const hostIdx = args.findIndex(a => a === "--host");
  const customHost = hostIdx !== -1 ? args[hostIdx + 1] : undefined;

  try {
    await connectDatabase(customHost);
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
