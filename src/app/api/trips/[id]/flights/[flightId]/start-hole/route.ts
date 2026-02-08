import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/app/lib/supabaseServer";
import { requireAuthedUser, isGroupAdmin } from "@/app/lib/serverAuth";

type Params = {
  id: string;
  flightId: string;
};

export async function PATCH(
  req: Request,
  context: { params: Params } | { params: Promise<Params> }
) {
  try {
    const resolvedParams =
      "then" in context.params
        ? await (context.params as Promise<Params>)
        : (context.params as Params);

    const { id, flightId } = resolvedParams;

    const supabase = await createSupabaseServerClient();

    // Invariant: Route param [id] may be legacy numeric id or UUID. We always resolve to canonical trips.id (UUID) before role checks and mutations.
    const isNumeric = /^[0-9]+$/.test(id);
    const parsed = isNumeric ? Number(id) : null;
    let tripQuery = supabase.from("trips").select("id,group_id").limit(1);
    tripQuery = isNumeric ? tripQuery.eq("legacy_id", parsed) : tripQuery.eq("id", id);
    const { data: tripData, error: tripErr } = await tripQuery.maybeSingle();

    if (tripErr || !tripData) {
      return NextResponse.json(
        { ok: false, error: "Trip not found." },
        { status: 404 }
      );
    }

    const tripUuid = tripData.id;
    const groupId = tripData.group_id;

    let userId: string;
    try {
      const authResult = await requireAuthedUser();
      userId = authResult.userId;
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const userIsAdmin = await isGroupAdmin({ supabase, userId, groupId });
    if (!userIsAdmin) {
      return NextResponse.json(
        { ok: false, error: "Only group admins can update flights." },
        { status: 403 }
      );
    }

    // Parse and validate body
    const body = await req.json().catch(() => ({}));
    const startHole = (body as { startHole?: unknown }).startHole;

    if (
      typeof startHole !== "number" ||
      !Number.isInteger(startHole) ||
      startHole < 1 ||
      startHole > 18
    ) {
      return NextResponse.json(
        { ok: false, error: "invalid_start_hole" },
        { status: 400 }
      );
    }

    // Fetch the flight; validate it belongs to this trip (prevent cross-trip edits)
    const { data: flightRow, error: flightError } = await supabase
      .from("trip_flights")
      .select("id,trip_id,execution_status,start_hole")
      .eq("id", flightId)
      .maybeSingle();

    if (flightError || !flightRow) {
      return NextResponse.json(
        { ok: false, error: "flight_not_found" },
        { status: 404 }
      );
    }

    if ((flightRow as { trip_id: string }).trip_id !== tripUuid) {
      return NextResponse.json(
        { ok: false, error: "Not found." },
        { status: 404 }
      );
    }

    // Reject updates if execution_status is 'finished'
    if ((flightRow as any).execution_status === "finished") {
      return NextResponse.json(
        { ok: false, reason: "flight_finished" },
        { status: 409 }
      );
    }

    const updatePayload = {
      start_hole: startHole,
      // updated_at trigger will handle timestamp; we only send the logical field
    };

    // 6) Try update with regular client first
    const { error: updateError } = await supabase
      .from("trip_flights")
      .update(updatePayload)
      .eq("id", flightId);

    if (updateError && updateError.code === "42501") {
      // RLS blocked - retry with service role
      const supabaseService = await createSupabaseServiceClient();
      const { error: serviceError } = await supabaseService
        .from("trip_flights")
        .update(updatePayload)
        .eq("id", flightId);

      if (serviceError) {
        console.error(
          "[trip_flights/start-hole] Service client update error:",
          serviceError
        );
        return NextResponse.json(
          {
            ok: false,
            error:
              serviceError.message || "Failed to update start hole (service)",
          },
          { status: 500 }
        );
      }
    } else if (updateError) {
      console.error(
        "[trip_flights/start-hole] Update error:",
        updateError
      );
      return NextResponse.json(
        {
          ok: false,
          error: updateError.message || "Failed to update start hole",
        },
        { status: 500 }
      );
    }

    // 7) Return success
    return NextResponse.json({
      ok: true,
      flightId,
      startHole,
    });
  } catch (error) {
    console.error("[trip_flights/start-hole] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

