import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/groups/pending-approvals
 * Returns pending membership counts for groups where the current user is an admin.
 * Used by Members page to show "Pending N" in dropdown and Review CTA.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { totalPending: 0, byGroupId: {} },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: adminRows, error: adminErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("status", "approved");

    if (adminErr || !adminRows?.length) {
      return NextResponse.json(
        { totalPending: 0, byGroupId: {} },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const adminGroupIds = adminRows.map((r) => r.group_id);

    const { data: pendingRows, error: pendingErr } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", adminGroupIds)
      .eq("status", "pending");

    if (pendingErr) {
      return NextResponse.json(
        { totalPending: 0, byGroupId: {} },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const byGroupId: Record<string, number> = {};
    for (const row of pendingRows || []) {
      byGroupId[row.group_id] = (byGroupId[row.group_id] ?? 0) + 1;
    }
    const totalPending = (pendingRows || []).length;

    return NextResponse.json(
      { totalPending, byGroupId },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { totalPending: 0, byGroupId: {} },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
