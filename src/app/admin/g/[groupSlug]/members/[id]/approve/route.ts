import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * POST /admin/g/[groupSlug]/members/[id]/approve
 * Approve a member's group membership (set status to "approved" in group_members).
 * Only accessible to group admins or platform admins.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ groupSlug: string; id: string }> | { groupSlug: string; id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const groupSlug = params.groupSlug;
    const memberId = params.id;

    if (!groupSlug || !memberId) {
      return NextResponse.json(
        { error: "Group slug and Member ID are required." },
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

    // Verify member exists in this group
    const { data: targetGroupMember, error: targetError } = await supabase
      .from("group_members")
      .select("user_id, status")
      .eq("group_id", groupId)
      .eq("user_id", memberId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json(
        { error: `Failed to verify member: ${targetError.message}` },
        { status: 500 }
      );
    }

    if (!targetGroupMember) {
      return NextResponse.json(
        { error: "Member not found in this group." },
        { status: 404 }
      );
    }

    // Update group_members status to approved
    const { error: updateError } = await supabase
      .from("group_members")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
      .eq("group_id", groupId)
      .eq("user_id", memberId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to approve member: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Also update members.status to "active" if not already
    const { error: memberUpdateError } = await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", memberId)
      .neq("status", "active");

    if (memberUpdateError) {
      console.warn("Failed to update member status to active:", memberUpdateError);
      // Continue - group membership approval is primary action
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Approve member error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}
