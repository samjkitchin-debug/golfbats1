import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/gameday/[roundId]/participants
 * Adds or removes participants from a GameDay round
 * 
 * Body: { action: "add" | "remove", memberId: string }
 * 
 * IMPORTANT: Permissions consistent with Hosted Round rules:
 * - Round creator can add/remove anyone
 * - Members can add themselves
 * - Members cannot remove others (only themselves)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params;
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
      return NextResponse.json(
        { error: "Member profile not found." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, memberId } = body as { action?: "add" | "remove"; memberId?: string };

    if (!action || (action !== "add" && action !== "remove")) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'add' or 'remove'." },
        { status: 400 }
      );
    }

    if (!memberId || typeof memberId !== "string") {
      return NextResponse.json(
        { error: "memberId is required." },
        { status: 400 }
      );
    }

    // Parse roundId
    const numericId = parseInt(roundId, 10);
    const isNumeric = !isNaN(numericId);

    // Find trip
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,created_by_member_id,trip_origin")
      .eq("trip_origin", "member");

    if (isNumeric) {
      tripQuery = tripQuery.eq("legacy_id", numericId);
    } else {
      tripQuery = tripQuery.eq("id", roundId);
    }

    const { data: tripData, error: tripError } = await tripQuery.single();

    if (tripError || !tripData) {
      return NextResponse.json(
        { error: "Round not found." },
        { status: 404 }
      );
    }

    const isCreator = tripData.created_by_member_id === currentMemberId;
    const isSelf = memberId === currentMemberId;

    // Authorization checks
    if (action === "add") {
      // Creator can add anyone, members can add themselves
      if (!isCreator && !isSelf) {
        return NextResponse.json(
          { error: "You can only add yourself to this round." },
          { status: 403 }
        );
      }
    } else if (action === "remove") {
      // Creator can remove anyone, members can only remove themselves
      if (!isCreator && !isSelf) {
        return NextResponse.json(
          { error: "You can only remove yourself from this round." },
          { status: 403 }
        );
      }
    }

    const tripId = tripData.id;
    const groupId = tripData.group_id;

    if (action === "add") {
      // Add participant (upsert to trip_attendees with status="confirmed")
      const { error: insertError } = await supabase
        .from("trip_attendees")
        .upsert(
          {
            trip_id: tripId,
            group_id: groupId,
            member_id: memberId,
            status: "confirmed",
            joined_at: new Date().toISOString(),
          },
          { onConflict: "trip_id,member_id" }
        );

      if (insertError) {
        console.error("[gameday participants] Insert error:", insertError);
        return NextResponse.json(
          { error: insertError.message || "Failed to add participant." },
          { status: 400 }
        );
      }
    } else {
      // Remove participant
      const { error: deleteError } = await supabase
        .from("trip_attendees")
        .delete()
        .eq("trip_id", tripId)
        .eq("member_id", memberId);

      if (deleteError) {
        console.error("[gameday participants] Delete error:", deleteError);
        return NextResponse.json(
          { error: deleteError.message || "Failed to remove participant." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Gameday participants error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
