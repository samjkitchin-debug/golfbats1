import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * POST /admin/members/[id]/make-admin
 * Mark a member as admin (is_admin = true).
 * Only accessible to existing admins.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
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

    // Check admin status via env allowlist OR existing is_admin flag
    const emailAdmin = isEmailAdmin(user.email);

    const { data: selfMember } = await supabase
      .from("members")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = emailAdmin || !!selfMember?.is_admin;

    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const memberId = params.id;

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
    }

    // Verify target member exists
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,is_admin")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: `Failed to verify member: ${memberError.message}` },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("members")
      .update({ is_admin: true })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to make member admin: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Make admin error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}


