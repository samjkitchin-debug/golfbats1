-- Enable RLS on members and add basic policies
-- Goal:
-- - Only authenticated users can access members
-- - Any authenticated user can read all members (app-level middleware already restricts routes)
-- - Users can insert/update only their own member row

-- Enable row level security
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all members
CREATE POLICY members_select_all_authenticated
  ON members
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow a user to insert their own member row
CREATE POLICY members_insert_self
  ON members
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id);

-- Allow a user to update their own member row
CREATE POLICY members_update_self
  ON members
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND auth.uid() = id)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id);



