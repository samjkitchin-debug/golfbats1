import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

/**
 * POST /api/me/delete-account
 * Delete the current user's account and all associated data.
 * 
 * Flow:
 * 1. Authenticate user via session client
 * 2. Fetch profile_photo_path before deletion
 * 3. Call RPC function account_delete_me
 * 4. If RPC succeeds, clean up storage files (profile photo + passport images)
 * 5. Delete auth user record via service client
 */
export async function POST(req: Request) {
  try {
    // Step 1: Authenticate user via session client
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Step 2: Fetch profile_photo_path BEFORE deletion
    const { data: memberData, error: memberErr } = await supabase
      .from("members")
      .select("profile_photo_path")
      .eq("id", user.id)
      .maybeSingle();

    if (memberErr) {
      console.error("Failed to fetch member data:", memberErr);
      return NextResponse.json(
        { error: "Failed to fetch member data." },
        { status: 500 }
      );
    }

    const profilePhotoPath =
      memberData && typeof memberData.profile_photo_path === "string"
        ? memberData.profile_photo_path
        : null;

    // Step 3: Call RPC function account_delete_me
    const { data: rpcResult, error: rpcError } = await supabase.rpc("account_delete_me");

    if (rpcError) {
      console.error("RPC account_delete_me error:", rpcError);
      return NextResponse.json(
        { error: `Failed to delete account: ${rpcError.message}` },
        { status: 500 }
      );
    }

    // Check if RPC returned ok: false
    if (rpcResult && typeof rpcResult === "object" && "ok" in rpcResult && rpcResult.ok === false) {
      const reason = "reason" in rpcResult && typeof rpcResult.reason === "string"
        ? rpcResult.reason
        : "Account deletion blocked.";
      return NextResponse.json(
        { ok: false, reason },
        { status: 409 }
      );
    }

    // Step 4: If RPC succeeded (ok=true), proceed with storage cleanup and auth deletion
    // Use service client for admin operations (storage cleanup + auth deletion)
    const supabaseService = await createSupabaseServiceClient();

    try {
      // Delete profile photo if it exists
      if (profilePhotoPath && profilePhotoPath.startsWith("profile-photos/")) {
        const relativePath = profilePhotoPath.replace("profile-photos/", "");
        const { error: removeProfileError } = await supabaseService.storage
          .from("profile-photos")
          .remove([relativePath]);

        if (removeProfileError) {
          console.warn("Failed to delete profile photo:", removeProfileError);
          // Continue - storage cleanup is best-effort
        }
      }

      // List and delete passport images (up to 100 objects)
      try {
        const { data: passportFiles, error: listError } = await supabaseService.storage
          .from("passport-images")
          .list(user.id, { limit: 100 });

        if (!listError && passportFiles && passportFiles.length > 0) {
          const filesToDelete = passportFiles.map((f) => `${user.id}/${f.name}`);
          const { error: removePassportsError } = await supabaseService.storage
            .from("passport-images")
            .remove(filesToDelete);

          if (removePassportsError) {
            console.warn("Failed to delete passport images:", removePassportsError);
            // Continue - storage cleanup is best-effort
          }
        }
      } catch (passportCleanupError) {
        console.warn("Passport images cleanup error:", passportCleanupError);
        // Continue - storage cleanup is best-effort
      }

      // Step 5: Delete auth user record
      const { error: deleteUserError } = await supabaseService.auth.admin.deleteUser(user.id);

      if (deleteUserError) {
        console.error("Failed to delete auth user:", deleteUserError);
        return NextResponse.json(
          { error: "Account data deleted, but failed to delete auth user. Contact support." },
          { status: 500 }
        );
      }
    } catch (cleanupError) {
      console.error("Storage cleanup or auth deletion error:", cleanupError);
      // Account data is already deleted via RPC, but cleanup failed
      // Return partial success with warning
      return NextResponse.json(
        { 
          ok: true, 
          warning: "Account deleted, but some files may remain. Contact support if needed." 
        },
        { status: 200 }
      );
    }

    // Success
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Delete account error:", e);
    // Never expose service role keys or internal errors
    return NextResponse.json(
      { error: "An error occurred while deleting your account. Please contact support." },
      { status: 500 }
    );
  }
}
