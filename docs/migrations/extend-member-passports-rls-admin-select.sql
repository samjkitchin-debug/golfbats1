-- Allow designated admin to read all passport records for admin tools
-- This complements existing per-user policies on member_passports.
-- Adjust the email address if you change your primary admin.

CREATE POLICY member_passports_select_admin
  ON member_passports
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND auth.jwt()->>'email' = 'sam.j.kitchin@gmail.com'
  );


