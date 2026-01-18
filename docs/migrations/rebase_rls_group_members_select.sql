-- Rebase: eliminate recursive RLS policy and consolidate group_members SELECT

-- 1) Drop the recursive policy that causes "infinite recursion detected"
drop policy if exists group_members_select_for_group_members on public.group_members;

-- 2) Drop legacy / conflicting SELECT policies to remove ambiguity
drop policy if exists gm_select on public.group_members;

-- 3) Drop any previous "canonical" policy names we might reintroduce
drop policy if exists group_members_select_canonical on public.group_members;
drop policy if exists "group members can read group members" on public.group_members;

-- 4) Create one canonical SELECT policy (approved members OR admins)
create policy "group members can read group members"
on public.group_members
as permissive
for select
to authenticated
using (
  is_group_admin(group_id)
  or is_approved_group_member(group_id)
);

COMMENT ON POLICY "group members can read group members" ON public.group_members
IS 'Rebase canonical: approved members (or admins) can read group membership rows; removes recursive and self-only policies.';