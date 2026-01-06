-- ============================================================================
-- GolfBats: Secure Passport Storage Migration
-- ============================================================================
-- This migration creates secure passport storage for members with:
-- - Encrypted passport number storage
-- - RLS policies for user-only access
-- - Admin audit logging
-- - Optional retention/cleanup support
-- ============================================================================

-- ============================================================================
-- SECTION 1: TABLES + INDEXES
-- ============================================================================

-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Member passports table
CREATE TABLE IF NOT EXISTS member_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passport_full_name text NOT NULL,
  passport_number_encrypted bytea NOT NULL, -- Encrypted passport number
  passport_country text NOT NULL,
  passport_expiry_date date NOT NULL,
  passport_photo_path text, -- Path to file in Supabase Storage (bucket: passport-photos)
  delete_after timestamp with time zone, -- Optional retention: delete row after this date
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT member_passports_user_id_key UNIQUE (user_id) -- One passport per user
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_passports_user_id ON member_passports(user_id);
CREATE INDEX IF NOT EXISTS idx_member_passports_delete_after ON member_passports(delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_passports_expiry_date ON member_passports(passport_expiry_date);

-- Audit log table for admin access tracking
CREATE TABLE IF NOT EXISTS passport_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('view_text', 'view_image', 'decrypt_number')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_passport_access_audit_viewer ON passport_access_audit(viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_passport_access_audit_target ON passport_access_audit(target_user_id);
CREATE INDEX IF NOT EXISTS idx_passport_access_audit_created_at ON passport_access_audit(created_at DESC);

-- ============================================================================
-- SECTION 2: HELPER FUNCTIONS (ENCRYPTION)
-- ============================================================================

-- Function to get encryption key from vault (assumes key named 'passport_encryption_key')
-- Note: This requires the key to be stored in Supabase Vault first:
-- SELECT vault.create_secret('your-encryption-key-here', 'passport_encryption_key');

CREATE OR REPLACE FUNCTION get_passport_encryption_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Attempt to retrieve from vault
  SELECT decrypted_secret INTO encryption_key
  FROM vault.decrypted_secrets
  WHERE name = 'passport_encryption_key'
  LIMIT 1;

  -- Fallback: if vault not available, use environment variable approach
  -- In production, ensure the key is stored securely in Supabase Vault
  IF encryption_key IS NULL THEN
    -- This will need to be set via Supabase Dashboard > Settings > Vault
    RAISE EXCEPTION 'Passport encryption key not found in vault. Please configure vault.secrets.';
  END IF;

  RETURN encryption_key;
END;
$$;

-- Function to encrypt passport number
CREATE OR REPLACE FUNCTION encrypt_passport_number(passport_number text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := get_passport_encryption_key();
  RETURN pgp_sym_encrypt(passport_number, encryption_key);
END;
$$;

-- Function to decrypt passport number (SECURITY DEFINER for server-side admin use only)
CREATE OR REPLACE FUNCTION decrypt_passport_number(passport_number_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := get_passport_encryption_key();
  RETURN pgp_sym_decrypt(passport_number_encrypted, encryption_key);
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_member_passports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_member_passports_updated_at
  BEFORE UPDATE ON member_passports
  FOR EACH ROW
  EXECUTE FUNCTION update_member_passports_updated_at();

-- ============================================================================
-- SECTION 3: RLS ENABLE + POLICIES
-- ============================================================================

-- Enable RLS on member_passports table
ALTER TABLE member_passports ENABLE ROW LEVEL SECURITY;

-- Enable RLS on passport_access_audit table
ALTER TABLE passport_access_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own passport row
CREATE POLICY "Users can view own passport"
  ON member_passports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can INSERT their own passport row
CREATE POLICY "Users can insert own passport"
  ON member_passports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own passport row
CREATE POLICY "Users can update own passport"
  ON member_passports
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own passport row
CREATE POLICY "Users can delete own passport"
  ON member_passports
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: No direct RLS access for admins (they must use server-side functions)
-- This ensures admin access is always logged via audit table

-- Audit table: Users can view their own audit entries (when they are the target)
CREATE POLICY "Users can view own audit entries"
  ON passport_access_audit
  FOR SELECT
  TO authenticated
  USING (auth.uid() = target_user_id);

-- Audit table: Service role can insert audit entries (for admin actions)
-- Note: Service role bypasses RLS, so this is for explicit admin access logging
-- Admins will use server-side functions that insert into this table

-- ============================================================================
-- SECTION 4: CLEANUP FUNCTION (RETENTION)
-- ============================================================================

-- Function to delete expired passport rows (based on delete_after)
CREATE OR REPLACE FUNCTION cleanup_expired_passports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM member_passports
  WHERE delete_after IS NOT NULL
    AND delete_after < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- SECTION 5: USAGE NOTES
-- ============================================================================

-- SETUP REQUIRED:
-- 1. Store encryption key in Supabase Vault:
--    SELECT vault.create_secret('your-strong-random-key-here', 'passport_encryption_key');
--
-- 2. Create Supabase Storage bucket 'passport-photos' with:
--    - Public: false
--    - File size limit: 5MB (recommended)
--    - Allowed MIME types: image/jpeg, image/png
--
-- 3. Set Storage RLS policies (separate SQL file recommended):
--    - Users can upload/read their own passport photo
--    - Admins can read via service role only
--
-- 4. Schedule cleanup job (optional, via pg_cron or external scheduler):
--    SELECT cron.schedule('cleanup-expired-passports', '0 2 * * *', 'SELECT cleanup_expired_passports()');
--
-- ADMIN ACCESS (Server-side only):
-- Example server-side function for admins to view passport data:
-- 
-- CREATE OR REPLACE FUNCTION admin_view_passport(target_user_uuid uuid)
-- RETURNS TABLE (
--   passport_full_name text,
--   passport_number text,
--   passport_country text,
--   passport_expiry_date date,
--   passport_photo_path text
-- )
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- BEGIN
--   -- Log the access
--   INSERT INTO passport_access_audit (viewer_user_id, target_user_id, action)
--   VALUES (auth.uid(), target_user_uuid, 'view_text');
--
--   -- Return decrypted data
--   RETURN QUERY
--   SELECT 
--     mp.passport_full_name,
--     decrypt_passport_number(mp.passport_number_encrypted),
--     mp.passport_country,
--     mp.passport_expiry_date,
--     mp.passport_photo_path
--   FROM member_passports mp
--   WHERE mp.user_id = target_user_uuid;
-- END;
-- $$;



