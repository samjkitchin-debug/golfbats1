import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * POST /admin/members/[id]/approve
 * Set a member's status to "active".
 * Only accessible to admins.
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

    // Check admin status (same mechanism as other admin routes)
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    if (!adminEmails.includes(email)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const memberId = params.id;

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
    }

    // Verify member exists
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,status")
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

    // Update status to active
    const { error: updateError } = await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to approve member: ${updateError.message}` },
        { status: 500 }
      );
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


