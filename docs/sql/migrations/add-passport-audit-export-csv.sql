-- ============================================================================
-- Add export_csv action to passport_access_audit
-- ============================================================================
-- Extends passport_access_audit.action CHECK constraint to allow 'export_csv'
-- for auditing CSV export operations.

-- Drop existing constraint
ALTER TABLE passport_access_audit
  DROP CONSTRAINT IF EXISTS passport_access_audit_action_check;

-- Add new constraint with export_csv action
ALTER TABLE passport_access_audit
  ADD CONSTRAINT passport_access_audit_action_check
  CHECK (action IN ('view_text', 'view_image', 'decrypt_number', 'export_csv'));
