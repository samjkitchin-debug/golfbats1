import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/me/active-group
 * Update the current user's last_active_group_id in the members table.
 * Body: { groupId: string }
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

    const body = await req.json();
    const { groupId } = body as { groupId?: string };

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required and must be a string." },
        { status: 400 }
      );
    }

    // Verify the group exists and is active
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Group not found or inactive." },
        { status: 404 }
      );
    }

    // Verify user has admin access to this group (platform admin or group admin)
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    const isEnvAdmin = adminEmails.includes(email);

    const { data: member } = await supabase
      .from("members")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isPlatformAdmin = isEnvAdmin || !!member?.is_admin;

    // Check if user is approved admin of this group
    const { data: groupMember } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    const hasAccess =
      isPlatformAdmin ||
      (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have admin access to this group." },
        { status: 403 }
      );
    }

    // Update last_active_group_id in members table
    // Note: If the column doesn't exist yet, a migration will be needed
    const { error: updateError } = await supabase
      .from("members")
      .update({ last_active_group_id: groupId })
      .eq("id", user.id);

    if (updateError) {
      // If column doesn't exist, return a helpful error
      if (updateError.message?.includes("column") && updateError.message?.includes("does not exist")) {
        console.error("last_active_group_id column missing - migration needed:", updateError);
        return NextResponse.json(
          { error: "Database schema update required. Please contact support." },
          { status: 500 }
        );
      }

      console.error("Failed to update last_active_group_id:", updateError);
      return NextResponse.json(
        { error: "Failed to update active group." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Update active group error:", e);
    return NextResponse.json(
      { error: "An error occurred while updating active group." },
      { status: 500 }
    );
  }
}
