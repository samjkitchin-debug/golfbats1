import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/dev-notes
 * Save a new dev note or update an existing one
 * 
 * Body: { note: string, id?: string }
 * - If id is provided, updates the existing note
 * - If id is not provided, creates a new note
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { note, id } = body as { note?: string; id?: string };

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return NextResponse.json(
        { error: "Note is required and cannot be empty." },
        { status: 400 }
      );
    }

    const trimmedNote = note.trim();

    if (id) {
      // Update existing note
      const { data, error } = await supabase
        .from("dev_notes")
        .update({ note: trimmedNote })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to update note." },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, note: data });
    } else {
      // Create new note
      const { data, error } = await supabase
        .from("dev_notes")
        .insert({
          user_id: user.id,
          note: trimmedNote,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: error.message || "Failed to create note." },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, note: data });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dev-notes
 * Retrieve all dev notes for the authenticated user
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("dev_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch notes." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, notes: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dev-notes
 * Delete a dev note
 * 
 * Body: { id: string }
 */
export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Note ID is required." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("dev_notes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to delete note." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

