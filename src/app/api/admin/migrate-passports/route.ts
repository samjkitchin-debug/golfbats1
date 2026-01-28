/**
 * One-off migration route: member_profiles -> member_passports
 * 
 * RUN ONCE ONLY - Migrates legacy plaintext passport data to canonical encrypted storage.
 * 
 * Security:
 * - Only runs in development (NODE_ENV !== "production")
 * - Requires MIGRATION_TOKEN environment variable and x-migration-token header
 * - Uses service-role client to bypass RLS
 * - Never logs sensitive values
 * 
 * Usage:
 *   POST /api/admin/migrate-passports
 *   Headers: x-migration-token: <MIGRATION_TOKEN>
 * 
 * Returns:
 *   { migrated: N, scrubbed: N, skipped_existing: N, skipped_incomplete_legacy: [...], errors: [...] }
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { encryptPassportNumber } from "@/app/lib/passportCrypto";

export async function POST(req: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Require migration token
  const migrationToken = process.env.MIGRATION_TOKEN;
  if (!migrationToken) {
    return NextResponse.json(
      { error: "MIGRATION_TOKEN not configured" },
      { status: 500 }
    );
  }

  const providedToken = req.headers.get("x-migration-token");
  if (!providedToken || providedToken !== migrationToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createSupabaseServiceClient();

    // Step 1: Find legacy rows with passport data
    const { data: legacyRows, error: fetchError } = await supabase
      .from("member_profiles")
      .select("member_id, passport_full_name, passport_number, passport_nationality, passport_expiry_date, passport_date_of_birth")
      .or("passport_number.not.is.null,passport_full_name.not.is.null,passport_nationality.not.is.null,passport_expiry_date.not.is.null,passport_date_of_birth.not.is.null");

    if (fetchError) {
      console.error("[migrate-passports] Failed to fetch legacy rows:", fetchError);
      return NextResponse.json(
        { error: `Failed to fetch legacy rows: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!legacyRows || legacyRows.length === 0) {
      return NextResponse.json({
        migrated: 0,
        scrubbed: 0,
        skipped_existing: 0,
        skipped_incomplete_legacy: [],
        errors: [],
        message: "No legacy passport data found",
      });
    }

    // Step 2: Check which ones already have member_passports rows
    const memberIds = legacyRows.map((r) => r.member_id);
    const { data: existingPassports, error: existingError } = await supabase
      .from("member_passports")
      .select("user_id, passport_number_encrypted")
      .in("user_id", memberIds);

    if (existingError) {
      console.error("[migrate-passports] Failed to check existing passports:", existingError);
      return NextResponse.json(
        { error: `Failed to check existing passports: ${existingError.message}` },
        { status: 500 }
      );
    }

    const existingUserIds = new Set((existingPassports || []).map((p) => p.user_id));
    const existingWithEncrypted = new Set(
      (existingPassports || [])
        .filter((p) => p.passport_number_encrypted)
        .map((p) => p.user_id)
    );

    // Step 3: Migrate rows (idempotent upsert) - only when ALL required fields present
    let migrated = 0;
    let scrubbed = 0;
    let skipped_existing = 0;
    const errors: Array<{ member_id: string; error: string }> = [];
    const skipped_incomplete_legacy: Array<{ member_id: string; missing: string[] }> = [];

    for (const legacy of legacyRows) {
      const userId = legacy.member_id;
      const alreadyExists = existingUserIds.has(userId);
      const hasEncryptedNumber = existingWithEncrypted.has(userId);

      // Validate all required fields exist BEFORE any upsert
      const missing: string[] = [];
      if (!legacy.passport_number || legacy.passport_number.trim() === "") missing.push("passport_number");
      if (!legacy.passport_full_name) missing.push("passport_full_name");
      if (!legacy.passport_nationality) missing.push("passport_nationality");
      if (!legacy.passport_expiry_date) missing.push("passport_expiry_date");

      if (missing.length > 0) {
        skipped_incomplete_legacy.push({
          member_id: legacy.member_id,
          missing,
        });
        continue; // IMPORTANT: skip BEFORE upsert
      }

      // All required fields present - proceed with migration
      try {
        // Prepare upsert data (all required fields are guaranteed to exist)
        const upsertData: {
          user_id: string;
          passport_full_name: string;
          passport_country: string;
          passport_expiry_date: string;
          passport_number_encrypted?: Buffer;
          updated_at?: string;
        } = {
          user_id: userId,
          passport_full_name: legacy.passport_full_name!,
          passport_country: legacy.passport_nationality!, // Map nationality -> country
          passport_expiry_date: legacy.passport_expiry_date!,
        };

        // Encrypt passport_number only if member_passports row doesn't already have encrypted number
        if (!hasEncryptedNumber) {
          try {
            const encryptedNumber = encryptPassportNumber(legacy.passport_number!);
            upsertData.passport_number_encrypted = Buffer.from(encryptedNumber, "base64");
          } catch (encryptError: any) {
            errors.push({
              member_id: userId,
              error: `Encryption failed: ${encryptError.message}`,
            });
            continue; // Skip this row
          }
        }

        // Upsert into member_passports
        const { error: upsertError } = await supabase
          .from("member_passports")
          .upsert(upsertData, {
            onConflict: "user_id",
          });

        if (upsertError) {
          errors.push({
            member_id: userId,
            error: `Upsert failed: ${upsertError.message}`,
          });
          continue;
        }

        if (!alreadyExists) {
          migrated++;
        } else {
          skipped_existing++;
        }

        // Step 4: Scrub legacy fields for this member_id (only after successful migration)
        const { error: scrubError } = await supabase
          .from("member_profiles")
          .update({
            passport_number: null,
            passport_full_name: null,
            passport_nationality: null,
            passport_date_of_birth: null,
            passport_expiry_date: null,
          })
          .eq("member_id", userId);

        if (scrubError) {
          errors.push({
            member_id: userId,
            error: `Scrub failed: ${scrubError.message}`,
          });
        } else {
          scrubbed++;
        }
      } catch (error: any) {
        errors.push({
          member_id: userId,
          error: `Unexpected error: ${error.message}`,
        });
      }
    }

    return NextResponse.json({
      migrated,
      scrubbed,
      skipped_existing,
      skipped_incomplete_legacy: skipped_incomplete_legacy.length > 0 ? skipped_incomplete_legacy : undefined,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migration complete: ${migrated} migrated, ${scrubbed} scrubbed, ${skipped_existing} skipped (already existed), ${skipped_incomplete_legacy.length} skipped (incomplete legacy data)`,
    });
  } catch (error: any) {
    console.error("[migrate-passports] Fatal error:", error);
    return NextResponse.json(
      { error: `Fatal error: ${error.message}` },
      { status: 500 }
    );
  }
}
