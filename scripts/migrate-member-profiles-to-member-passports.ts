/**
 * Migration Script: member_profiles -> member_passports
 * 
 * RUN ONCE ONLY - This script migrates legacy passport data from member_profiles
 * to member_passports (canonical source) and scrubs plaintext from member_profiles.
 * 
 * Prerequisites:
 * - Set PASSPORT_ENCRYPTION_KEY environment variable
 * - Database connection configured
 * - Run this script from the project root: npx tsx scripts/migrate-member-profiles-to-member-passports.ts
 * 
 * What it does:
 * 1. Inspects row counts in member_profiles and member_passports
 * 2. For each member_profiles row with passport data where member_passports row does NOT exist:
 *    - Creates member_passports row with encrypted passport_number
 *    - Maps passport_nationality -> passport_country
 *    - Sets passport_expiry_date, passport_full_name
 *    - passport_photo_path stays NULL (no legacy field)
 * 3. After migration, scrubs member_profiles passport fields (sets to NULL)
 * 
 * IMPORTANT: This script does NOT run automatically. Review the code and run manually.
 */

import { createSupabaseServiceClient } from "../src/app/lib/supabaseServer";
import { encryptPassportNumber } from "../src/app/lib/passportCrypto";

async function main() {
  console.log("=== Migration: member_profiles -> member_passports ===\n");

  // Check encryption key
  if (!process.env.PASSPORT_ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
    console.error("ERROR: PASSPORT_ENCRYPTION_KEY environment variable is required in production.");
    process.exit(1);
  }

  const supabase = await createSupabaseServiceClient();

  // Step 1: Inspect row counts
  console.log("Step 1: Inspecting row counts...");
  const { count: profilesCount } = await supabase
    .from("member_profiles")
    .select("*", { count: "exact", head: true });

  const { count: passportsCount } = await supabase
    .from("member_passports")
    .select("*", { count: "exact", head: true });

  console.log(`  member_profiles rows: ${profilesCount || 0}`);
  console.log(`  member_passports rows: ${passportsCount || 0}\n`);

  // Step 2: Find member_profiles rows with passport data that need migration
  console.log("Step 2: Finding rows to migrate...");
  const { data: profilesToMigrate, error: fetchError } = await supabase
    .from("member_profiles")
    .select("member_id, passport_full_name, passport_number, passport_nationality, passport_expiry_date")
    .not("passport_number", "is", null)
    .not("passport_full_name", "is", null);

  if (fetchError) {
    console.error("ERROR: Failed to fetch member_profiles:", fetchError);
    process.exit(1);
  }

  console.log(`  Found ${profilesToMigrate?.length || 0} member_profiles rows with passport data\n`);

  if (!profilesToMigrate || profilesToMigrate.length === 0) {
    console.log("No rows to migrate. Exiting.");
    return;
  }

  // Step 3: Check which ones already have member_passports rows
  const memberIds = profilesToMigrate.map((p) => p.member_id);
  const { data: existingPassports, error: existingError } = await supabase
    .from("member_passports")
    .select("user_id")
    .in("user_id", memberIds);

  if (existingError) {
    console.error("ERROR: Failed to check existing member_passports:", existingError);
    process.exit(1);
  }

  const existingUserIds = new Set((existingPassports || []).map((p) => p.user_id));
  const toMigrate = profilesToMigrate.filter((p) => !existingUserIds.has(p.member_id));

  console.log(`  ${toMigrate.length} rows need migration (${existingUserIds.size} already exist)\n`);

  if (toMigrate.length === 0) {
    console.log("All rows already migrated. Proceeding to scrub step.\n");
  } else {
    // Step 4: Migrate rows
    console.log("Step 3: Migrating rows...");
    let migrated = 0;
    let errors = 0;

    for (const profile of toMigrate) {
      try {
        // Encrypt passport number
        const encryptedNumber = encryptPassportNumber(profile.passport_number!);
        const encryptedBuffer = Buffer.from(encryptedNumber, "base64");

        // Insert into member_passports
        const { error: insertError } = await supabase
          .from("member_passports")
          .insert({
            user_id: profile.member_id,
            passport_full_name: profile.passport_full_name,
            passport_number_encrypted: encryptedBuffer,
            passport_country: profile.passport_nationality, // Map nationality -> country
            passport_expiry_date: profile.passport_expiry_date,
            passport_photo_path: null, // No legacy field
          });

        if (insertError) {
          console.error(`  ERROR migrating member_id ${profile.member_id}:`, insertError.message);
          errors++;
        } else {
          migrated++;
          if (migrated % 10 === 0) {
            console.log(`  Migrated ${migrated} rows...`);
          }
        }
      } catch (error: any) {
        console.error(`  ERROR migrating member_id ${profile.member_id}:`, error.message);
        errors++;
      }
    }

    console.log(`\n  Migration complete: ${migrated} migrated, ${errors} errors\n`);
  }

  // Step 5: Scrub member_profiles passport fields
  console.log("Step 4: Scrubbing member_profiles passport fields...");
  const { error: scrubError } = await supabase
    .from("member_profiles")
    .update({
      passport_number: null,
      passport_full_name: null,
      passport_nationality: null,
      passport_date_of_birth: null,
      passport_expiry_date: null,
    })
    .not("passport_number", "is", null); // Only update rows that have passport data

  if (scrubError) {
    console.error("ERROR: Failed to scrub member_profiles:", scrubError);
    process.exit(1);
  }

  console.log("  Scrubbing complete.\n");
  console.log("=== Migration complete ===");
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main };
