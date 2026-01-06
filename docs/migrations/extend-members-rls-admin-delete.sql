-- Extend RLS on members to allow admin deletes
-- NOTE: This mirrors the admin update policy you added for approvals.
-- Adjust the email address if you change your primary admin.

CREATE POLICY members_delete_admin
  ON members
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND auth.jwt()->>'email' = 'sam.j.kitchin@gmail.com'
  );


