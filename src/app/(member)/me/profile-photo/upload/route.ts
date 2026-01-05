import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import sharp from "sharp";

const MAX_WIDTH = 400;
const MAX_HEIGHT = 400;
const JPEG_QUALITY = 85;

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG and PNG images are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (5MB before compression)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 5MB." },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Compress and resize image (square crop for profile photos)
    let processedBuffer: Buffer;

    try {
      processedBuffer = await sharp(inputBuffer)
        .resize(MAX_WIDTH, MAX_HEIGHT, {
          fit: "cover", // Square crop
          position: "center",
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (compressError: any) {
      console.error("Image compression error:", compressError);
      return NextResponse.json(
        { error: "Failed to process image. Please try a different file." },
        { status: 500 }
      );
    }

    // Generate file path: {user_id}/profile.jpg (relative to bucket)
    const filePath = `${user.id}/profile.jpg`;

    // Upload compressed image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, processedBuffer, {
        contentType: "image/jpeg",
        upsert: true, // Allow overwriting existing profile photo
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Update members table with photo path
    const photoPath = `profile-photos/${filePath}`;
    const { error: updateError } = await supabase
      .from("members")
      .update({ profile_photo_path: photoPath })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to update member profile photo path:", updateError);
      // Continue anyway - photo is uploaded
    }

    // Return full path including bucket name for database storage
    return NextResponse.json({ path: photoPath, ok: true });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}

