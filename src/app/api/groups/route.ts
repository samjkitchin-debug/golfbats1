import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

type Body = {
  name?: unknown;
  slug?: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * POST /api/groups
 * Create a new group and add the creator as an admin member
 * Body: { name: string, slug: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = (await req.json()) as Body;

    const name = asTrimmedString(json.name);
    const slug = asTrimmedString(json.slug).toLowerCase();

    // Validate inputs
    if (!name) {
      return NextResponse.json(
        { error: "Group name is required." },
        { status: 400 }
      );
    }

    if (!slug) {
      return NextResponse.json(
        { error: "Group code (slug) is required." },
        { status: 400 }
      );
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Group code can only contain lowercase letters, numbers, and hyphens." },
        { status: 400 }
      );
    }

    // Validate length limits
    if (name.length > 60) {
      return NextResponse.json(
        { error: "Group name must be 60 characters or fewer." },
        { status: 400 }
      );
    }

    if (slug.length > 32) {
      return NextResponse.json(
        { error: "Group code must be 32 characters or fewer." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Insert group
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .insert({
        slug,
        name,
        created_by: user.id,
        is_active: true,
      })
      .select("id, slug, name")
      .single();

    if (groupErr) {
      // Check for unique constraint violation (slug already exists)
      // Primary check: Postgres error code 23505 (unique_violation)
      // Defensive fallback: message-based check for driver/message variations
      const isUniqueViolation =
        groupErr.code === "23505" || groupErr.message?.includes("unique");

      if (isUniqueViolation) {
        return NextResponse.json(
          { error: "This group code is already taken. Please choose a different one." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: groupErr.message || "Failed to create group." },
        { status: 400 }
      );
    }

    if (!group) {
      return NextResponse.json(
        { error: "Failed to create group." },
        { status: 500 }
      );
    }

    // Add creator as admin member with approved status
    const { error: memberErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "admin",
      status: "approved",
      approved_at: now,
      approved_by: user.id,
    });

    if (memberErr) {
      console.error("[groups API] Failed to add creator as admin member:", memberErr);
      // Group was created but membership failed - attempt to rollback by deleting the group
      const { error: rollbackErr } = await supabase.from("groups").delete().eq("id", group.id);
      if (rollbackErr) {
        console.error("[groups API] Rollback delete failed (may be due to RLS or other constraint):", rollbackErr);
      }
      return NextResponse.json(
        { error: "Failed to create group." },
        { status: 500 }
      );
    }

    // Update members.last_active_group_id to the newly created group
    const { data: updateData, error: updateActiveGroupErr } = await supabase
      .from("members")
      .update({ last_active_group_id: group.id })
      .eq("id", user.id)
      .select("id");

    if (updateActiveGroupErr) {
      // If column doesn't exist, log warning but don't fail the request
      // The group and membership are already created successfully
      if (updateActiveGroupErr.message?.includes("column") && updateActiveGroupErr.message?.includes("does not exist")) {
        console.warn("[groups API] last_active_group_id column missing - migration needed:", updateActiveGroupErr);
      } else {
        console.error("[groups API] Failed to update last_active_group_id:", updateActiveGroupErr);
        // Non-critical error - group and membership are created, so continue
      }
    } else if (!updateData || updateData.length === 0) {
      // No rows were updated - member profile row may be missing
      console.warn("[groups API] member profile row missing; cannot set last_active_group_id");
      // Non-critical error - group and membership are created, so continue
    }

    return NextResponse.json({
      group: {
        id: group.id,
        slug: group.slug,
        name: group.name,
      },
      redirectGroupId: group.id,
    });
  } catch (error) {
    console.error("Create group error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
