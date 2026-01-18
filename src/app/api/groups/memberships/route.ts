import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { requireAuthedUser, isGroupAdmin } from "@/app/lib/serverAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/groups/memberships?groupId=...
 * Returns memberships for a group (requires group admin)
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuthedUser();
    const supabase = await createSupabaseServerClient();

    const searchParams = req.nextUrl.searchParams;
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "groupId is required" }, { 
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Must be group admin
    const userIsAdmin = await isGroupAdmin({ supabase, userId, groupId });
    if (!userIsAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch memberships
    const { data: memberships, error } = await supabase
      .from("group_members")
      .select("user_id, status, role")
      .eq("group_id", groupId)
      .in("status", ["approved", "pending"]);

    if (error) {
      console.error("[memberships GET] Error:", error);
      return NextResponse.json({ error: "Failed to load memberships" }, { 
        status: 500,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ memberships: memberships || [] }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("[memberships GET] Error:", error);
    return NextResponse.json({ error: "An error occurred" }, { 
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

/**
 * PATCH /api/groups/memberships
 * Updates membership: approve, reject, or setRole
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await requireAuthedUser();
    const supabase = await createSupabaseServerClient();

    const body = await req.json();
    const { groupId, userId: targetUserId, action, role } = body;

    if (!groupId || !targetUserId || !action) {
      return NextResponse.json({ error: "groupId, userId, and action are required" }, { 
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Must be group admin
    const userIsAdmin = await isGroupAdmin({ supabase, userId, groupId });
    if (!userIsAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { 
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "approve") {
      // Set status to approved
      const { error } = await supabase
        .from("group_members")
        .update({ status: "approved" })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);

      if (error) {
        console.error("[memberships PATCH approve] Error:", error);
        return NextResponse.json({ error: "Failed to approve membership" }, { 
          status: 500,
          headers: { "Cache-Control": "no-store" },
        });
      }

      return NextResponse.json({ ok: true }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "reject") {
      // Delete the row (simplest option)
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);

      if (error) {
        console.error("[memberships PATCH reject] Error:", error);
        return NextResponse.json({ error: "Failed to reject membership" }, { 
          status: 500,
          headers: { "Cache-Control": "no-store" },
        });
      }

      return NextResponse.json({ ok: true }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "remove") {
      // Only allowed if status == approved
      const { data: membership, error: checkError } = await supabase
        .from("group_members")
        .select("status, role")
        .eq("group_id", groupId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (checkError || !membership) {
        return NextResponse.json({ error: "Membership not found" }, { 
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (membership.status !== "approved") {
        return NextResponse.json({ error: "Can only remove approved members" }, { 
          status: 400,
          headers: { "Cache-Control": "no-store" },
        });
      }

      // Check last admin guardrail: if removing an admin, ensure there's at least one other approved admin
      if (membership.role === "admin") {
        const { count, error: countError } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("role", "admin")
          .eq("status", "approved")
          .neq("user_id", targetUserId);

        if (countError) {
          console.error("[memberships PATCH remove count] Error:", countError);
          return NextResponse.json({ error: "Failed to check admin count" }, { 
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }

        if (count === 0) {
          return NextResponse.json(
            { error: "You are the only approved admin. Add another admin before removing this." },
            { 
              status: 400,
              headers: { "Cache-Control": "no-store" },
            }
          );
        }
      }

      // Check if removing yourself (would leave zero admins)
      if (targetUserId === userId && membership.role === "admin") {
        const { count, error: selfCountError } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("role", "admin")
          .eq("status", "approved")
          .neq("user_id", userId);

        if (selfCountError) {
          console.error("[memberships PATCH remove self count] Error:", selfCountError);
          return NextResponse.json({ error: "Failed to check admin count" }, { 
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }

        if (count === 0) {
          return NextResponse.json(
            { error: "You are the only approved admin. Add another admin before removing yourself." },
            { 
              status: 400,
              headers: { "Cache-Control": "no-store" },
            }
          );
        }
      }

      // Delete the row
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);

      if (error) {
        console.error("[memberships PATCH remove] Error:", error);
        return NextResponse.json({ error: "Failed to remove membership" }, { 
          status: 500,
          headers: { "Cache-Control": "no-store" },
        });
      }

      return NextResponse.json({ ok: true }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "setRole") {
      if (!role || (role !== "admin" && role !== "member")) {
        return NextResponse.json({ error: "role must be 'admin' or 'member'" }, { 
          status: 400,
          headers: { "Cache-Control": "no-store" },
        });
      }

      // Only allowed if status == approved
      const { data: membership, error: checkError } = await supabase
        .from("group_members")
        .select("status, role")
        .eq("group_id", groupId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (checkError || !membership) {
        return NextResponse.json({ error: "Membership not found" }, { 
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (membership.status !== "approved") {
        return NextResponse.json({ error: "Can only change role for approved members" }, { 
          status: 400,
          headers: { "Cache-Control": "no-store" },
        });
      }

      // If demoting from admin to member, check last admin guardrail
      if (membership.role === "admin" && role === "member") {
        const { count, error: countError } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("role", "admin")
          .eq("status", "approved");

        if (countError) {
          console.error("[memberships PATCH setRole count] Error:", countError);
          return NextResponse.json({ error: "Failed to check admin count" }, { 
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }

        if (count === 1) {
          return NextResponse.json(
            { error: "You are the only approved admin. Add another admin before changing this." },
            { 
              status: 400,
              headers: { "Cache-Control": "no-store" },
            }
          );
        }
      }

      // Update role
      const { error: updateError } = await supabase
        .from("group_members")
        .update({ role })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);

      if (updateError) {
        console.error("[memberships PATCH setRole] Error:", updateError);
        return NextResponse.json({ error: "Failed to update role" }, { 
          status: 500,
          headers: { "Cache-Control": "no-store" },
        });
      }

      return NextResponse.json({ ok: true }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { 
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("[memberships PATCH] Error:", error);
    return NextResponse.json({ error: "An error occurred" }, { 
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
