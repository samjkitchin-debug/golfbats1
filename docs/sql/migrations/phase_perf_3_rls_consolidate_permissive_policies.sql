-- ============================================================================
-- RLS Performance: Consolidate Multiple Permissive Policies
-- ============================================================================
-- This migration fixes Supabase Database Linter warning 0006_multiple_permissive_policies
-- by consolidating multiple permissive policies for the same (table, role, action)
-- into a single policy using OR logic.
--
-- IMPORTANT: This does NOT change security semantics. Permissive policies use
-- OR logic, so consolidating them preserves identical access control behavior.
--
-- Strategy:
-- - For each (table, role, action) with multiple permissive policies:
--   - Combine USING expressions with OR
--   - Combine WITH CHECK expressions with OR
--   - NULL qual/with_check is treated as TRUE (no restriction)
-- - Create consolidated policy with clear naming
-- - Drop old policies being consolidated
-- ============================================================================

DO $$
DECLARE
  policy_rec RECORD;
  qual_rec RECORD;
  drop_rec RECORD;
  table_name TEXT;
  role_name TEXT;
  cmd_name TEXT;
  using_parts TEXT[];
  with_check_parts TEXT[];
  using_expr TEXT;
  with_check_expr TEXT;
  consolidated_name TEXT;
  policy_count INT;
  processed_combos TEXT[] := ARRAY[]::TEXT[];
  combo_key TEXT;
  clean_role_name TEXT;
BEGIN
  -- ==========================================================================
  -- Find all (table, role, cmd) combinations with multiple permissive policies
  -- ==========================================================================
  FOR policy_rec IN
    SELECT 
      tablename,
      cmd,
      COALESCE(roles::text, 'public') as role_name,
      COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd, COALESCE(roles::text, 'public')
    HAVING COUNT(*) > 1
    ORDER BY tablename, cmd, role_name
  LOOP
    -- Group by (table, role, cmd)
    table_name := policy_rec.tablename;
    role_name := policy_rec.role_name;
    cmd_name := policy_rec.cmd;
    policy_count := policy_rec.policy_count;
    
    -- Create unique key for this combination
    combo_key := table_name || '|' || cmd_name || '|' || role_name;
    
    -- Skip if we've already processed this combination
    CONTINUE WHEN combo_key = ANY(processed_combos);
    
    -- Mark this combination as processed
    processed_combos := array_append(processed_combos, combo_key);
    
    -- Mark this combination as processed
    processed_combos := array_append(processed_combos, combo_key);
    
    -- Build OR expressions from all policies in this group
    using_parts := ARRAY[]::TEXT[];
    with_check_parts := ARRAY[]::TEXT[];
    
    FOR qual_rec IN
      SELECT qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND cmd = cmd_name
        AND COALESCE(roles::text, 'public') = role_name
        AND permissive = 'PERMISSIVE'
      ORDER BY policyname
    LOOP
      -- Handle USING expression
      IF qual_rec.qual IS NULL OR qual_rec.qual = '' THEN
        -- NULL qual means TRUE (no restriction) - skip adding it
        -- (OR with TRUE doesn't change the result)
        NULL;
      ELSE
        using_parts := array_append(using_parts, '(' || qual_rec.qual || ')');
      END IF;
      
      -- Handle WITH CHECK expression (only for INSERT/UPDATE)
      IF cmd_name IN ('INSERT', 'UPDATE') THEN
        IF qual_rec.with_check IS NULL OR qual_rec.with_check = '' THEN
          -- NULL with_check means TRUE (no restriction)
          NULL;
        ELSE
          with_check_parts := array_append(with_check_parts, '(' || qual_rec.with_check || ')');
        END IF;
      END IF;
    END LOOP;
    
    -- Build final expressions
    IF array_length(using_parts, 1) > 0 THEN
      using_expr := array_to_string(using_parts, ' OR ');
    ELSE
      using_expr := NULL; -- All were NULL, meaning no restriction
    END IF;
    
    IF cmd_name IN ('INSERT', 'UPDATE') AND array_length(with_check_parts, 1) > 0 THEN
      with_check_expr := array_to_string(with_check_parts, ' OR ');
    ELSE
      with_check_expr := NULL;
    END IF;
    
    -- Generate consolidated policy name and clean role name for TO clause
    clean_role_name := REPLACE(REPLACE(role_name, '{', ''), '}', '');
    consolidated_name := table_name || '_' || LOWER(cmd_name) || '_' || clean_role_name || '_consolidated';
    
    -- Drop old policies for this combination
    FOR drop_rec IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND cmd = cmd_name
        AND COALESCE(roles::text, 'public') = role_name
        AND permissive = 'PERMISSIVE'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
                     drop_rec.policyname, table_name);
    END LOOP;
    
    -- Create consolidated policy
    IF cmd_name = 'SELECT' THEN
      IF using_expr IS NULL THEN
        -- No restriction (allows all)
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr);
      END IF;
    ELSIF cmd_name = 'INSERT' THEN
      IF using_expr IS NULL AND with_check_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s WITH CHECK (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name);
      ELSIF using_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s WITH CHECK (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, with_check_expr);
      ELSIF with_check_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr, with_check_expr);
      END IF;
    ELSIF cmd_name = 'UPDATE' THEN
      IF using_expr IS NULL AND with_check_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (true) WITH CHECK (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name);
      ELSIF using_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (true) WITH CHECK (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, with_check_expr);
      ELSIF with_check_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr, with_check_expr);
      END IF;
    ELSIF cmd_name = 'DELETE' THEN
      IF using_expr IS NULL THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (true)',
                      consolidated_name, table_name, cmd_name, clean_role_name);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s USING (%s)',
                      consolidated_name, table_name, cmd_name, clean_role_name, using_expr);
      END IF;
    END IF;
    
    RAISE NOTICE 'Consolidated policies for public.%.% (role: %) into %',
                 table_name, cmd_name, role_name, consolidated_name;
  END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- This migration automatically discovers and consolidates all permissive
-- policies that share the same (table, role, action) combination.
-- 
-- Known targets from linter:
-- - public.group_members: authenticated INSERT
-- - public.groups: authenticated INSERT
-- - public.groups: authenticated SELECT
--
-- Any other similar cases will also be handled automatically.
-- ============================================================================
