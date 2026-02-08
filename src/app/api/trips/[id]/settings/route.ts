import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser, isGroupAdmin } from "@/app/lib/serverAuth";
import { isTripHost } from "@/app/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/trips/[id]/settings
 * Update trip format and capacity. Organiser-only (host or group admin).
 * Body: { format?: string; capacityLimit?: number | null; bookingConfirmed?: boolean }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    let userId: string;
    try {
      const auth = await requireAuthedUser();
      userId = auth.userId;
    } catch {
      return NextResponse.json(
        { error: "Not signed in." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id,created_by_member_id,trip_origin")
      .limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripErr } = await tripQuery.maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { error: "Trip not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const tripUuid = tripData.id;
    const groupId = (tripData as { group_id?: string }).group_id ?? null;
    const tripOrigin = (tripData as { trip_origin?: string }).trip_origin ?? "group";

    const canEdit =
      tripOrigin === "member"
        ? isTripHost(userId, tripData)
        : await isGroupAdmin({ supabase, userId, groupId: groupId ?? "" });

    if (!canEdit) {
      return NextResponse.json(
        { error: "Only organisers can change trip settings." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { format, capacityLimit, bookingConfirmed } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (format !== undefined) {
      const trimmed = typeof format === "string" ? format.trim() : "";
      updateData.format = trimmed || "Stroke";
    }

    if (capacityLimit !== undefined) {
      const val = capacityLimit === null || capacityLimit === "" ? null : Number(capacityLimit);
      if (val !== null && (!Number.isFinite(val) || val < 2 || val > 400)) {
        return NextResponse.json(
          { error: "Capacity must be between 2 and 400, or empty for no limit." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    if (
      format === undefined &&
      capacityLimit === undefined &&
      bookingConfirmed === undefined
    ) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const needsLogistics =
      capacityLimit !== undefined || bookingConfirmed !== undefined;
    if (needsLogistics) {
      const { data: existingRow } = await supabase
        .from("trips")
        .select("logistics")
        .eq("id", tripUuid)
        .single();

      const existingLogistics = (existingRow as any)?.logistics ?? {};
      const logisticsPatch: Record<string, unknown> =
        typeof existingLogistics === "object" ? { ...existingLogistics } : {};
      if (capacityLimit !== undefined) {
        logisticsPatch.capacityLimit =
          capacityLimit === null || capacityLimit === ""
            ? null
            : Number(capacityLimit);
        logisticsPatch.capacityConfirmed = true;
      }
      if (bookingConfirmed !== undefined) {
        logisticsPatch.bookingConfirmed = Boolean(bookingConfirmed);
      }
      updateData.logistics = logisticsPatch;
    }

    const { error: updateErr } = await supabase
      .from("trips")
      .update(updateData)
      .eq("id", tripUuid);

    if (updateErr) {
      console.error("[trips/settings] Update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update trip settings." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[trips/settings] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
