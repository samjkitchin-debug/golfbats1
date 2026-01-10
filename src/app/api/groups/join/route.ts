import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

type Body = {
  slug?: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * POST /api/groups/join
 * Join a group by slug
 * Body: { slug: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const json = (await req.json()) as Body;

    const slug = asTrimmedString(json.slug).toLowerCase().trim();

    if (!slug) {
      return NextResponse.json(
        { error: "Group code is required." },
        { status: 400 }
      );
    }

    // Lookup group
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("id, slug, name, is_active")
      .eq("slug", slug)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: "group_not_found" }, { status: 404 });
    }

    // Check if group is active
    if (!group.is_active) {
      return NextResponse.json({ error: "group_inactive" }, { status: 403 });
    }

    // Check existing membership
    const { data: existingMembership } = await supabase
      .from("group_members")
      .select("status")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingMembership) {
      if (existingMembership.status === "approved") {
        return NextResponse.json({ status: "already_approved" });
      }
      if (existingMembership.status === "pending") {
        return NextResponse.json({ status: "already_pending" });
      }
      // If status is something else (e.g., "rejected"), allow new request
    }

    // Insert new membership request
    const { error: insertErr } = await supabase
      .from("group_members")
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: "member",
        status: "pending",
      });

    if (insertErr) {
      // Check if it's a unique constraint violation (shouldn't happen due to check above, but handle gracefully)
      if (insertErr.code === "23505" || insertErr.message?.includes("unique")) {
        // Race condition: check again
        const { data: checkMembership } = await supabase
          .from("group_members")
          .select("status")
          .eq("group_id", group.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (checkMembership?.status === "approved") {
          return NextResponse.json({ status: "already_approved" });
        }
        if (checkMembership?.status === "pending") {
          return NextResponse.json({ status: "already_pending" });
        }
      }

      console.error("[groups/join API] Failed to insert membership:", insertErr);
      return NextResponse.json(
        { error: insertErr.message || "Failed to request membership." },
        { status: 400 }
      );
    }

    return NextResponse.json({ status: "requested" });
  } catch (error) {
    console.error("Join group error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
