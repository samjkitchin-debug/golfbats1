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
    const slug = asTrimmedString(json.slug).toLowerCase().trim();

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
      // Check if it's a unique constraint violation (slug already exists)
      if (groupErr.code === "23505" || groupErr.message?.includes("unique")) {
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
      // Group was created but membership failed - still return success with group data
      // User can request membership separately if needed
      return NextResponse.json({
        group: {
          id: group.id,
          slug: group.slug,
          name: group.name,
        },
        warning: "Group created, but failed to add you as admin. You may need to request membership.",
      });
    }

    return NextResponse.json({
      group: {
        id: group.id,
        slug: group.slug,
        name: group.name,
      },
    });
  } catch (error) {
    console.error("Create group error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
