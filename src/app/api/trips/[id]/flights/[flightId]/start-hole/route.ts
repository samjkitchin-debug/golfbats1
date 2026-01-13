import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/app/lib/supabaseServer";

type Params = {
  id: string;
  flightId: string;
};

export async function PATCH(
  req: Request,
  context: { params: Params } | { params: Promise<Params> }
) {
  try {
    // Support both direct and Promise-based params (for consistency with other routes)
    const resolvedParams =
      "then" in context.params
        ? await (context.params as Promise<Params>)
        : (context.params as Params);

    const { flightId } = resolvedParams;

    const supabase = await createSupabaseServerClient();

    // 1) Require auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    // 2) Parse and validate body
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

    // Get current member ID via members.user_id mapping
    const { data: memberRow } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!memberRow) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const memberId: string = memberRow.id;

    // 3) Fetch the flight joined to its trip to obtain trip + host
    const { data: flightRow, error: flightError } = await supabase
      .from("trip_flights")
      .select(
        `
          id,
          trip_id,
          execution_status,
          start_hole,
          trips!inner(
            id,
            group_id,
            host_member_id
          )
        `
      )
      .eq("id", flightId)
      .single();

    if (flightError || !flightRow) {
      return NextResponse.json(
        { ok: false, error: "flight_not_found" },
        { status: 404 }
      );
    }

    const trip = (flightRow as any).trips as {
      id: string;
      group_id: string;
      host_member_id: string | null;
    };

    const tripGroupId = trip.group_id;
    const hostMemberId = trip.host_member_id;

    // 4) Authorise: host OR group admin
    const isHost =
      !!memberId && !!hostMemberId && memberId === hostMemberId;

    // Group admin check via group_members (user_id-based)
    const { data: gmRow } = await supabase
      .from("group_members")
      .select("id, role")
      .eq("group_id", tripGroupId)
      .eq("user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    const isGroupAdmin = !!gmRow && (gmRow as any).role === "admin";

    if (!isHost && !isGroupAdmin) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    // 5) Reject updates if execution_status is 'finished'
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

