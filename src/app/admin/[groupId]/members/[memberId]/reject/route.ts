import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * POST /admin/[groupId]/members/[memberId]/reject
 * Reject a pending group membership by deleting the group_members row.
 * Only accessible to APPROVED group admins for the specified group.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ groupId: string; memberId: string }> | { groupId: string; memberId: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { groupId, memberId } = params;

    if (!groupId || !memberId) {
      return NextResponse.json({ error: "Group ID and member ID are required." }, { status: 400 });
    }

    // Check if caller is an APPROVED admin for this group
    const isPlatformAdmin = isEmailAdmin(user.email);
    
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
      return NextResponse.json({ error: "Admin access required for this group." }, { status: 403 });
    }

    // Verify the target membership exists
    const { data: targetMembership, error: targetError } = await supabase
      .from("group_members")
      .select("status")
      .eq("group_id", groupId)
      .eq("user_id", memberId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json(
        { error: `Failed to verify membership: ${targetError.message}` },
        { status: 500 }
      );
    }

    if (!targetMembership) {
      return NextResponse.json({ error: "Membership not found." }, { status: 404 });
    }

    // Delete the group_members row (reject)
    const { error: deleteError } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", memberId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to reject membership: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Reject membership error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}
