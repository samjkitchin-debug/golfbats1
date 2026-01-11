import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

type Body = {
  groupId?: unknown;
};

/**
 * POST /api/groups/leave
 * Leave a group by removing the user's membership from group_members
 * Body: { groupId: string }
 * 
 * Prevents leaving if user is the sole approved admin of the group.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const json = (await req.json()) as Body;
    const groupId = typeof json.groupId === "string" ? json.groupId.trim() : "";

    if (!groupId) {
      return NextResponse.json(
        { error: "Group ID is required." },
        { status: 400 }
      );
    }

    // Verify group exists and is active
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("id, name, is_active")
      .eq("id", groupId)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    if (!group.is_active) {
      return NextResponse.json({ error: "Group is not active." }, { status: 403 });
    }

    // Check user's membership
    const { data: membership, error: membershipErr } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipErr) {
      console.error("[groups/leave API] Failed to check membership:", membershipErr);
      return NextResponse.json(
        { error: "Failed to check membership." },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this group." },
        { status: 404 }
      );
    }

    // If user is an approved admin, check if they are the sole approved admin
    if (membership.role === "admin" && membership.status === "approved") {
      // Count other approved admins in this group
      const { count, error: countErr } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("role", "admin")
        .eq("status", "approved")
        .neq("user_id", user.id);

      if (countErr) {
        console.error("[groups/leave API] Failed to check other admins:", countErr);
        return NextResponse.json(
          { error: "Failed to verify admin status." },
          { status: 500 }
        );
      }

      // If there are no other approved admins, prevent leaving
      if (count === 0) {
        return NextResponse.json(
          {
            error: "Cannot leave group",
            reason: "sole_admin",
            message: "You are the only approved admin of this group. Assign another admin before leaving.",
          },
          { status: 409 }
        );
      }
    }

    // Delete the membership
    const { error: deleteErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (deleteErr) {
      console.error("[groups/leave API] Failed to delete membership:", deleteErr);
      return NextResponse.json(
        { error: "Failed to leave group." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[groups/leave API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
