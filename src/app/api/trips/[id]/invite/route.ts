import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/trips/[id]/invite
 * Invite a member to a trip (trip creator only)
 * Body: { memberId: string }
 * 
 * IMPORTANT: Only trip creator can invite others
 * Adds member as confirmed attendee (invites occupy slots)
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current member ID
    let currentMemberId: string | null = null;
    const { data: memberData } = await supabase
      .from("members")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    currentMemberId = memberData?.id || null;

    if (!currentMemberId) {
      return NextResponse.json({ error: "Member profile not found." }, { status: 403 });
    }

    const paramId = params.id;
    const legacyId = Number(paramId);
    const isLegacyId = Number.isFinite(legacyId) && String(legacyId) === paramId.trim();

    // Find trip
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,created_by_member_id,trip_origin,capacity")
      .eq("trip_origin", "member"); // Only member-hosted trips can be invited to

    if (isLegacyId) {
      tripQuery = tripQuery.eq("legacy_id", legacyId);
    } else {
      tripQuery = tripQuery.eq("id", paramId);
    }

    const { data: trip, error: tripErr } = await tripQuery.single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Verify current user is the trip creator
    if (trip.created_by_member_id !== currentMemberId) {
      return NextResponse.json(
        { error: "Only the trip creator can invite members." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { memberId } = body as { memberId?: string };

    if (!memberId || typeof memberId !== "string") {
      return NextResponse.json({ error: "memberId is required." }, { status: 400 });
    }

    // Check capacity (invites occupy slots)
    const { data: currentAttendees } = await supabase
      .from("trip_attendees")
      .select("member_id")
      .eq("trip_id", trip.id)
      .eq("status", "confirmed");

    const currentCount = currentAttendees?.length || 0;
    const capacity = trip.capacity || 4;

    if (currentCount >= capacity) {
      return NextResponse.json(
        { error: "Trip is at capacity." },
        { status: 400 }
      );
    }

    // Check if member is already invited/joined
    const { data: existingAttendee } = await supabase
      .from("trip_attendees")
      .select("member_id")
      .eq("trip_id", trip.id)
      .eq("member_id", memberId)
      .maybeSingle();

    if (existingAttendee) {
      // Already invited/joined - return success (idempotent)
      return NextResponse.json({ ok: true, alreadyInvited: true });
    }

    // Insert attendee row
    const { error: insertErr } = await supabase
      .from("trip_attendees")
      .insert({
        trip_id: trip.id,
        group_id: trip.group_id,
        member_id: memberId,
        status: "confirmed",
        joined_at: new Date().toISOString(),
      });

    if (insertErr) {
      // PostgreSQL unique constraint violation error code is "23505"
      if (insertErr.code === "23505" || insertErr.message?.includes("duplicate") || insertErr.message?.includes("unique")) {
        return NextResponse.json({ ok: true, alreadyInvited: true });
      }

      console.error("[invite API] insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message || "Failed to invite member." },
        { status: 400 }
      );
    }

    // Invalidate cache tags
    try {
      (revalidateTag as any)(`trips:group:${trip.group_id}`);
      (revalidateTag as any)(`trip:${trip.id}`);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Invite member error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
