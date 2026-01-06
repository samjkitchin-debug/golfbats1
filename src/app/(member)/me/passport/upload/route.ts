import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import sharp from "sharp";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const JPEG_QUALITY = 80; // Quality 0-100, 80 is a good balance

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

    // Validate file size (10MB before compression)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 10MB." },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Compress and resize image
    let processedBuffer: Buffer;
    let contentType: string;
    let fileExt: string;

    const isPng = file.type === "image/png";

    try {
      const sharpImage = sharp(inputBuffer)
        .resize(MAX_WIDTH, MAX_HEIGHT, {
          fit: "inside",
          withoutEnlargement: true,
        });

      if (isPng) {
        // Convert PNG to JPEG for better compression (or keep PNG with compression)
        processedBuffer = await sharpImage
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toBuffer();
        contentType = "image/jpeg";
        fileExt = "jpg";
      } else {
        // JPEG: compress and optimize
        processedBuffer = await sharpImage
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toBuffer();
        contentType = "image/jpeg";
        fileExt = "jpg";
      }
    } catch (compressError: any) {
      console.error("Image compression error:", compressError);
      return NextResponse.json(
        { error: "Failed to process image. Please try a different file." },
        { status: 500 }
      );
    }

    // Generate file path: {user_id}/{uuid}.jpg (relative to bucket)
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Upload compressed image to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("passport-images")
      .upload(filePath, processedBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Best-effort cleanup: remove older passport images for this user so only the latest is kept.
    try {
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("passport-images")
        .list(user.id, { limit: 100 });

      if (!listError && existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles
          .map((f) => `${user.id}/${f.name}`)
          .filter((fullPath) => fullPath !== filePath);

        if (filesToDelete.length > 0) {
          const { error: removeError } = await supabase.storage
            .from("passport-images")
            .remove(filesToDelete);

          if (removeError) {
            console.warn("Failed to clean up old passport images:", removeError);
          }
        }
      }
    } catch (cleanupError) {
      console.warn("Passport image cleanup error:", cleanupError);
      // Non-fatal – continue.
    }

    // Return full path including bucket name for database storage
    return NextResponse.json({ path: `passport-images/${filePath}`, ok: true });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}

