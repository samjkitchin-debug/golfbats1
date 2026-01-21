import { NextResponse } from "next/server";

/**
 * Purge all trips and associated data
 * Uses service role key to bypass RLS via direct REST API calls
 * WARNING: This permanently deletes ALL trips and related data
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    // Step 1: Delete from handicap_rounds (may not have CASCADE)
    // Use PostgREST API with a filter that matches all rows
    const handicapResponse = await fetch(
      `${supabaseUrl}/rest/v1/handicap_rounds?created_at=gte.1970-01-01T00:00:00Z`,
      {
        method: "DELETE",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
      }
    );

    if (!handicapResponse.ok) {
      const errorText = await handicapResponse.text();
      console.error("[purge-trips] Error deleting handicap_rounds:", errorText);
      return NextResponse.json(
        { ok: false, error: "Failed to delete handicap_rounds", details: errorText },
        { status: 500 }
      );
    }

    // Step 2: Delete all trips (cascades to most related tables)
    const tripsResponse = await fetch(
      `${supabaseUrl}/rest/v1/trips?created_at=gte.1970-01-01T00:00:00Z`,
      {
        method: "DELETE",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
      }
    );

    if (!tripsResponse.ok) {
      const errorText = await tripsResponse.text();
      console.error("[purge-trips] Error deleting trips:", errorText);
      return NextResponse.json(
        { ok: false, error: "Failed to delete trips", details: errorText },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "All trips and associated data have been purged successfully",
    });
  } catch (error: any) {
    console.error("[purge-trips] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected error", details: error?.message },
      { status: 500 }
    );
  }
}
