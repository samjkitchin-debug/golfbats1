import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * POST /admin/g/[groupSlug]/trips/[id]/passport-export
 * Export passport data for trip attendees as CSV.
 * Only accessible to group admins or platform admins.
 */
export async function POST(
  req: Request,
  context: {
    params: Promise<{ groupSlug: string; id: string }> | { groupSlug: string; id: string };
  }
) {
  try {
    const params = await Promise.resolve(context.params);
    const groupSlug = params.groupSlug;
    const tripId = params.id;

    if (!groupSlug || !tripId) {
      return NextResponse.json(
        { error: "Group slug and Trip ID are required." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // Resolve slug to UUID
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("slug", groupSlug.toLowerCase())
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json({ error: "Group not found or inactive." }, { status: 404 });
    }

    const groupId = group.id;

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Platform admin: only via isEmailAdmin
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Check group admin authorization
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const isGroupAdmin =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    if (!isGroupAdmin) {
      return NextResponse.json(
        { error: "You must be an approved admin of this group." },
        { status: 403 }
      );
    }

    // Verify trip exists and belongs to this group
    const { data: trip } = await supabase
      .from("trips")
      .select("id, group_id")
      .eq("id", tripId)
      .eq("group_id", groupId)
      .single();

    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const memberIds: string[] = body.memberIds || [];

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: "Member IDs array is required." }, { status: 400 });
    }

    // Fetch passport data for requested members
    const { data: passports, error: passportsError } = await supabase
      .from("member_passports")
      .select(
        "user_id, passport_full_name, passport_number, passport_country, passport_expiry_date"
      )
      .in("user_id", memberIds);

    if (passportsError) {
      return NextResponse.json(
        { error: `Failed to fetch passports: ${passportsError.message}` },
        { status: 500 }
      );
    }

    // Fetch member names for attendees
    const { data: members } = await supabase
      .from("members")
      .select("id, full_name, display_name")
      .in("id", memberIds);

    const memberMap = new Map(
      members?.map((m) => [m.id, m.display_name || m.full_name || "Unknown"]) || []
    );
    const passportMap = new Map(
      passports?.map((p) => [p.user_id, p]) || []
    );

    // Build CSV
    const rows: string[] = ["Name,Passport Name,Passport Number,Country,Expiry Date"];

    for (const memberId of memberIds) {
      const name = memberMap.get(memberId) || "Unknown";
      const passport = passportMap.get(memberId);
      const passportName = passport?.passport_full_name || "";
      const passportNumber = passport?.passport_number || "";
      const country = passport?.passport_country || "";
      const expiry = passport?.passport_expiry_date || "";

      // Escape commas and quotes in CSV
      const escapeCsv = (s: string) => {
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      rows.push(
        [
          escapeCsv(name),
          escapeCsv(passportName),
          escapeCsv(passportNumber),
          escapeCsv(country),
          escapeCsv(expiry),
        ].join(",")
      );
    }

    const csv = rows.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="trip-${tripId}-passports.csv"`,
      },
    });
  } catch (e: unknown) {
    console.error("Passport export error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}
