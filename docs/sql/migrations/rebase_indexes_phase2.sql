-- Accelerate group member status queries (pending counts, approved lists)
CREATE INDEX IF NOT EXISTS idx_group_members_group_status
ON public.group_members (group_id, status);
