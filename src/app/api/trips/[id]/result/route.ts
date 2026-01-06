import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

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

    const body = await req.json();
    const { leaderboard, notes } = body as {
      leaderboard?: { name: string; points: number }[];
      notes?: string;
    };

    if (!leaderboard || !Array.isArray(leaderboard)) {
      return NextResponse.json({ error: "Leaderboard is required." }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Check if result already exists
    const { data: existingResult } = await supabase
      .from("trip_results")
      .select("id")
      .eq("trip_id", trip.id)
      .maybeSingle();

    const resultId = existingResult?.id || crypto.randomUUID();

    // Upsert result
    const { error: resultErr } = await supabase.from("trip_results").upsert(
      {
        id: resultId,
        trip_id: trip.id,
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

    // Delete existing result_rows
    await supabase.from("result_rows").delete().eq("result_id", resultId);

    // Insert new result_rows
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

    const { error: rowsErr } = await supabase.from("result_rows").insert(resultRows);

    if (rowsErr) {
      return NextResponse.json(
        { error: rowsErr.message || "Failed to save leaderboard." },
        { status: 400 }
      );
    }

    // Archive trip if not already archived
    await supabase
      .from("trips")
      .update({ status: "archived", updated_at: now })
      .eq("id", trip.id)
      .eq("status", "open"); // Only update if currently open

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Clear result error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

