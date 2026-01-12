import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

const CACHE_TAG = "trips";

/**
 * POST /api/trips/[id]/result
 * Publish or update trip results
 * Body: { leaderboard: { name: string; points: number }[], notes?: string }
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    
    // Create two clients: one for auth/reading with RLS, one for writes bypassing RLS
    const supabase = await createSupabaseServerClient();
    const supabaseService = await createSupabaseServiceClient();

    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const legacyId = Number(params.id);
    if (!Number.isFinite(legacyId)) {
      return NextResponse.json({ error: "Invalid trip ID." }, { status: 400 });
    }

    // Find trip by legacy_id (with RLS - user must have access)
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, group_id, trip_origin, created_by_member_id")
      .eq("legacy_id", legacyId)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Authorize: check if user can publish results for this trip
    const groupId = trip.group_id;
    const tripOrigin = trip.trip_origin || "group";
    const createdByMemberId = trip.created_by_member_id;

    // Get user's email for platform admin check
    const { data: { user: userWithEmail } } = await supabase.auth.getUser();
    const userEmail = userWithEmail?.email;
    const isPlatformAdmin = isEmailAdmin(userEmail);

    // Get group member info
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved") ||
      false;

    // Authorization rules
    let isAuthorized = false;
    if (tripOrigin === "group") {
      isAuthorized = isGroupAdmin;
    } else if (tripOrigin === "member") {
      // Allow if user is the creator, or is group admin, or is platform admin
      isAuthorized = 
        (createdByMemberId && user.id === createdByMemberId) ||
        isGroupAdmin ||
        isPlatformAdmin;
    } else {
      // Fallback: require group admin
      isAuthorized = isGroupAdmin;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await req.json();
    const { leaderboard, notes } = body as {
      leaderboard?: { name: string; points: number }[];
      notes?: string;
    };

    if (!leaderboard || !Array.isArray(leaderboard)) {
      return NextResponse.json({ error: "Leaderboard is required." }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Check if result already exists (using service client for reads that might be RLS-restricted)
    const { data: existingResult } = await supabaseService
      .from("trip_results")
      .select("id")
      .eq("trip_id", trip.id)
      .maybeSingle();

    const resultId = existingResult?.id || crypto.randomUUID();

    // Upsert result using service client (bypasses RLS)
    const { error: resultErr } = await supabaseService.from("trip_results").upsert(
      {
        id: resultId,
        trip_id: trip.id,
        group_id: groupId,
        published: true,
        published_at: existingResult ? undefined : now, // Only set on first publish
        notes: notes || null,
        updated_at: now,
        ...(existingResult ? {} : { created_at: now }),
      },
      { onConflict: "id" }
    );

    if (resultErr) {
      return NextResponse.json(
        { error: resultErr.message || "Failed to save result." },
        { status: 400 }
      );
    }

    // Delete existing result_rows using service client
    await supabaseService.from("result_rows").delete().eq("result_id", resultId);

    // Insert new result_rows using service client
    const resultRows = leaderboard
      .map((entry, index) => ({
        id: crypto.randomUUID(),
        result_id: resultId,
        position: index + 1,
        display_name: entry.name,
        metric_label: "points",
        metric_value: String(entry.points),
      }))
      .sort((a, b) => b.position - a.position); // Sort by points descending

    const { error: rowsErr } = await supabaseService.from("result_rows").insert(resultRows);

    if (rowsErr) {
      return NextResponse.json(
        { error: rowsErr.message || "Failed to save leaderboard." },
        { status: 400 }
      );
    }

    // Archive trip if not already archived (using service client)
    await supabaseService
      .from("trips")
      .update({ status: "archived", updated_at: now })
      .eq("id", trip.id)
      .eq("status", "open"); // Only update if currently open

    // Invalidate trips cache
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Publish result error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trips/[id]/result
 * Clear trip results
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const legacyId = Number(params.id);
    if (!Number.isFinite(legacyId)) {
      return NextResponse.json({ error: "Invalid trip ID." }, { status: 400 });
    }

    // Find trip by legacy_id
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id")
      .eq("legacy_id", legacyId)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Find result
    const { data: result } = await supabase
      .from("trip_results")
      .select("id")
      .eq("trip_id", trip.id)
      .maybeSingle();

    if (result) {
      // Delete result_rows first
      await supabase.from("result_rows").delete().eq("result_id", result.id);
      // Delete result
      await supabase.from("trip_results").delete().eq("id", result.id);
    }

    // Invalidate trips cache
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Clear result error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

