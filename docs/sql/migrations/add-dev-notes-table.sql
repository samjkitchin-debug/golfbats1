-- Create dev_notes table for storing developer notes
CREATE TABLE IF NOT EXISTS dev_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_dev_notes_user_id ON dev_notes(user_id);

-- Create index for faster queries by created_at (for sorting)
CREATE INDEX IF NOT EXISTS idx_dev_notes_created_at ON dev_notes(created_at DESC);

-- Enable RLS
ALTER TABLE dev_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own notes
CREATE POLICY "Users can view their own notes"
  ON dev_notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own notes
CREATE POLICY "Users can insert their own notes"
  ON dev_notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own notes
CREATE POLICY "Users can update their own notes"
  ON dev_notes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
  ON dev_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dev_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update function
CREATE TRIGGER update_dev_notes_updated_at
  BEFORE UPDATE ON dev_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_dev_notes_updated_at();


