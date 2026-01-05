-- ============================================================================
-- GolfBats: Secure Passport Image Storage
-- ============================================================================
-- This migration creates a private Supabase Storage bucket for passport photos
-- with strict access controls:
-- - Users can upload/read only their own files
-- - Admins require server-side signed URLs (no direct bucket access)
-- - File constraints: JPEG/PNG only, max 10MB
-- ============================================================================

-- ============================================================================
-- SECTION 1: BUCKET CREATION
-- ============================================================================

-- Create private bucket for passport images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'passport-images',
  'passport-images',
  false, -- Private bucket (requires authentication)
  10485760, -- 10MB limit (10 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/jpg', 'image/png'] -- JPEG/PNG only
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 2: STORAGE RLS POLICIES
-- ============================================================================

-- Enable RLS on storage.objects for this bucket
-- (RLS is typically enabled by default on storage.objects, but ensure it's on)

-- Policy: Users can INSERT (upload) files only under their own user_id prefix
-- Path format: passport-images/{user_id}/{uuid}.jpg
CREATE POLICY "Users can upload own passport images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (name ~ '\.(jpg|jpeg|png)$')
  );

-- Policy: Users can SELECT (read/download) files only under their own user_id prefix
CREATE POLICY "Users can read own passport images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can UPDATE (replace) files only under their own user_id prefix
CREATE POLICY "Users can update own passport images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (name ~ '\.(jpg|jpeg|png)$')
  );

-- Policy: Users can DELETE files only under their own user_id prefix
CREATE POLICY "Users can delete own passport images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: No policies for admin direct access
-- Admins must use server-side signed URL generation (see integration notes below)

-- ============================================================================
-- SECTION 3: INTEGRATION NOTES
-- ============================================================================

-- FILE PATH CONVENTION:
-- passport-images/{user_id}/{uuid}.jpg
-- Example: passport-images/123e4567-e89b-12d3-a456-426614174000/550e8400-e29b-41d4-a716-446655440000.jpg
--
-- The user_id prefix ensures RLS policies can enforce user isolation.
-- The UUID filename prevents collisions and guessing.

-- UPLOAD (Client-side - User uploads own image):
-- 
-- import { createSupabaseBrowserClient } from '@/app/lib/supabaseBrowser';
-- 
-- const supabase = createSupabaseBrowserClient();
-- const userId = (await supabase.auth.getUser()).data.user?.id;
-- const filePath = `passport-images/${userId}/${crypto.randomUUID()}.jpg`;
-- 
-- const { data, error } = await supabase.storage
--   .from('passport-images')
--   .upload(filePath, file, {
--     contentType: 'image/jpeg',
--     upsert: false // Prevent overwriting
--   });
--
-- Note: File type and size validation should be done client-side before upload
-- for better UX, but server-side policies enforce the constraints.

-- READ (Client-side - User reads own image):
--
-- const { data } = await supabase.storage
--   .from('passport-images')
--   .getPublicUrl(filePath);
--
-- OR for authenticated access (recommended for private bucket):
--
-- const { data } = await supabase.storage
--   .from('passport-images')
--   .createSignedUrl(filePath, 3600); // 1 hour expiry
--
-- The getPublicUrl() won't work for private buckets, so use createSignedUrl()
-- even for the owner.

-- ADMIN ACCESS (Server-side only - Generate signed URLs):
--
-- Create a server action or route handler:
--
-- import { createSupabaseServerClient } from '@/app/lib/supabaseServer';
-- import { createSupabaseBrowserClient } from '@supabase/ssr';
-- 
-- export async function getPassportImageSignedUrl(userId: string, filePath: string) {
--   // Verify admin status server-side
--   const supabase = await createSupabaseServerClient();
--   const { data: { user } } = await supabase.auth.getUser();
--   
--   if (!user) throw new Error('Not authenticated');
--   
--   // Check admin status (server-side only)
--   const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
--   if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
--     throw new Error('Admin access required');
--   }
--   
--   // Log admin access (to passport_access_audit table)
--   await supabase.from('passport_access_audit').insert({
--     viewer_user_id: user.id,
--     target_user_id: userId,
--     action: 'view_image'
--   });
--   
--   // Generate short-lived signed URL (15 minutes recommended)
--   const { data, error } = await supabase.storage
--     .from('passport-images')
--     .createSignedUrl(filePath, 900); // 15 minutes
--   
--   if (error) throw error;
--   return data.signedUrl;
-- }
--
-- Note: Admins cannot list or browse the bucket directly. They must know
-- the exact file path (which should be stored in member_passports.passport_photo_path).

-- FILE VALIDATION (Client-side pre-upload):
--
-- function validatePassportImage(file: File): { valid: boolean; error?: string } {
--   // Check file type
--   const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
--   if (!allowedTypes.includes(file.type)) {
--     return { valid: false, error: 'Only JPEG and PNG images are allowed' };
--   }
--   
--   // Check file size (10MB)
--   const maxSize = 10 * 1024 * 1024; // 10MB in bytes
--   if (file.size > maxSize) {
--     return { valid: false, error: 'File size must be less than 10MB' };
--   }
--   
--   return { valid: true };
-- }
--
-- Note: Server-side policies enforce these constraints, but client-side
-- validation provides better UX.

-- CLEANUP (Optional - Delete old images when passport is deleted):
--
-- When a user deletes their passport or it expires:
--
-- const supabase = createSupabaseBrowserClient();
-- const userId = (await supabase.auth.getUser()).data.user?.id;
-- 
-- // List all files under user's prefix
-- const { data: files } = await supabase.storage
--   .from('passport-images')
--   .list(`${userId}/`, { limit: 1000 });
-- 
-- // Delete all files
-- if (files) {
--   const filePaths = files.map(f => `${userId}/${f.name}`);
--   await supabase.storage
--     .from('passport-images')
--     .remove(filePaths);
-- }
--
-- Or use server-side cleanup if needed for admin-initiated deletions.

-- SIGNED URL LIFETIME RECOMMENDATIONS:
-- - User viewing own image: 1 hour (3600 seconds)
-- - Admin viewing user image: 15 minutes (900 seconds) - shorter for security
-- - Travel agent export: 24 hours (86400 seconds) - if generating batch exports

-- SECURITY NOTES:
-- 1. The bucket is private - all access requires authentication
-- 2. RLS policies enforce that users can only access files under their own user_id prefix
-- 3. Admins have no direct bucket access - they must use server-side signed URLs
-- 4. Signed URLs should be short-lived, especially for admin access
-- 5. All admin access should be logged to passport_access_audit table
-- 6. File paths include user_id prefix to prevent path traversal attacks
-- 7. File type constraints are enforced at both client and server level

