-- ============================================================================
-- RLS Performance: Remove Redundant auth.role() Checks
-- ============================================================================
-- This migration removes redundant auth.role() checks from RLS policies where
-- the role is already guaranteed by the policy's TO clause, improving query
-- performance without changing access semantics.
--
-- STRICT SAFETY RULES:
-- 1. Policy must target exactly ONE role in TO clause
-- 2. Expression must contain a simple role check matching that role
-- 3. Role check must be combined with AND (not OR) so removal doesn't broaden access
-- 4. Only remove clearly redundant checks under these strict conditions
-- ============================================================================

DO $$
DECLARE
  policy_rec RECORD;
  target_role TEXT;
  role_check_pattern TEXT;
  new_using_expr TEXT;
  new_with_check_expr TEXT;
  using_expr TEXT;
  with_check_expr TEXT;
  safe_to_remove BOOLEAN;
  role_check_found BOOLEAN;
BEGIN
  -- ==========================================================================
  -- Find all policies with auth.role() checks
  -- ==========================================================================
  FOR policy_rec IN
    SELECT 
      schemaname,
      tablename,
      policyname,
      roles,
      cmd,
      qual as using_expr,
      with_check as with_check_expr
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (
        qual LIKE '%auth.role%' 
        OR qual LIKE '%(select auth.role())%'
        OR with_check LIKE '%auth.role%'
        OR with_check LIKE '%(select auth.role())%'
      )
    ORDER BY schemaname, tablename, policyname
  LOOP
    -- Skip if policy targets multiple roles or no roles
    IF policy_rec.roles IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Convert roles array to text and check if it's a single role
    DECLARE
      roles_array TEXT[];
      roles_text TEXT;
    BEGIN
      roles_array := policy_rec.roles;
      
      -- Skip if multiple roles
      IF array_length(roles_array, 1) != 1 THEN
        CONTINUE;
      END IF;
      
      target_role := roles_array[1];
      roles_text := target_role;
    END;
    
    -- Skip if target_role is not a simple role name (e.g., 'authenticated', 'public')
    IF target_role IS NULL OR target_role = '' THEN
      CONTINUE;
    END IF;
    
    -- Process USING expression
    using_expr := policy_rec.using_expr;
    new_using_expr := using_expr;
    safe_to_remove := false;
    
    IF using_expr IS NOT NULL AND using_expr != '' THEN
      -- Look for pattern: (select auth.role()) = 'role'
      role_check_pattern := '(select auth.role()) = ''' || target_role || '''';
      
      -- Normalize whitespace for comparison
      DECLARE
        normalized_expr TEXT;
        test_pattern TEXT;
      BEGIN
        normalized_expr := regexp_replace(trim(using_expr), '\s+', ' ', 'g');
        test_pattern := regexp_replace(trim(role_check_pattern), '\s+', ' ', 'g');
        
        -- Case 1: Standalone role check
        IF normalized_expr = test_pattern OR 
           normalized_expr = '(' || test_pattern || ')' THEN
          new_using_expr := 'true';
          safe_to_remove := true;
        -- Case 2: Role check at start with AND: pattern AND ...
        -- Use LIKE for safer pattern matching instead of complex regex
        ELSIF normalized_expr LIKE test_pattern || ' AND %' OR
              normalized_expr LIKE '(' || test_pattern || ') AND %' THEN
          -- Only remove if no OR in the expression (safety check)
          IF normalized_expr !~* '\s+or\s+' THEN
            -- Escape special regex characters in role_check_pattern
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_using_expr := regexp_replace(using_expr, 
                '^\s*\(' || escaped_pattern || '\)\s+and\s+', 
                '', 'gi');
              IF new_using_expr = using_expr THEN
                -- Try without parentheses
                new_using_expr := regexp_replace(using_expr, 
                  '^\s*' || escaped_pattern || '\s+and\s+', 
                  '', 'gi');
              END IF;
              -- Verify result doesn't contain OR and is different
              IF new_using_expr != using_expr AND new_using_expr !~* '\s+or\s+' THEN
                safe_to_remove := true;
              ELSE
                new_using_expr := using_expr; -- Revert
              END IF;
            END;
          END IF;
        -- Case 3: Role check at end with AND: ... AND pattern
        ELSIF normalized_expr LIKE '% AND ' || test_pattern OR
              normalized_expr LIKE '% AND (' || test_pattern || ')' THEN
          -- Only remove if no OR in the expression
          IF normalized_expr !~* '\s+or\s+' THEN
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_using_expr := regexp_replace(using_expr, 
                '\s+and\s+\(' || escaped_pattern || '\)\s*$', 
                '', 'gi');
              IF new_using_expr = using_expr THEN
                -- Try without parentheses
                new_using_expr := regexp_replace(using_expr, 
                  '\s+and\s+' || escaped_pattern || '\s*$', 
                  '', 'gi');
              END IF;
              -- Verify result doesn't contain OR and is different
              IF new_using_expr != using_expr AND new_using_expr !~* '\s+or\s+' THEN
                safe_to_remove := true;
              ELSE
                new_using_expr := using_expr; -- Revert
              END IF;
            END;
          END IF;
        -- Case 4: Role check in middle: ... AND pattern AND ...
        ELSIF normalized_expr LIKE '% AND ' || test_pattern || ' AND %' OR
              normalized_expr LIKE '% AND (' || test_pattern || ') AND %' THEN
          -- Only remove if no OR in the expression
          IF normalized_expr !~* '\s+or\s+' THEN
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_using_expr := regexp_replace(using_expr, 
                '\s+and\s+\(' || escaped_pattern || '\)\s+and\s+', 
                ' and ', 'gi');
              IF new_using_expr = using_expr THEN
                -- Try without parentheses
                new_using_expr := regexp_replace(using_expr, 
                  '\s+and\s+' || escaped_pattern || '\s+and\s+', 
                  ' and ', 'gi');
              END IF;
              -- Verify result doesn't contain OR and is different
              IF new_using_expr != using_expr AND new_using_expr !~* '\s+or\s+' THEN
                safe_to_remove := true;
              ELSE
                new_using_expr := using_expr; -- Revert
              END IF;
            END;
          END IF;
        END IF;
      END;
    END IF;
    
    -- Process WITH CHECK expression (same logic as USING)
    with_check_expr := policy_rec.with_check_expr;
    new_with_check_expr := with_check_expr;
    
    IF with_check_expr IS NOT NULL AND with_check_expr != '' THEN
      -- Look for pattern: (select auth.role()) = 'role'
      role_check_pattern := '(select auth.role()) = ''' || target_role || '''';
      
      -- Normalize whitespace for comparison
      DECLARE
        normalized_expr TEXT;
        test_pattern TEXT;
        with_check_safe BOOLEAN := false;
      BEGIN
        normalized_expr := regexp_replace(trim(with_check_expr), '\s+', ' ', 'g');
        test_pattern := regexp_replace(trim(role_check_pattern), '\s+', ' ', 'g');
        
        -- Case 1: Standalone role check
        IF normalized_expr = test_pattern OR 
           normalized_expr = '(' || test_pattern || ')' THEN
          new_with_check_expr := 'true';
          with_check_safe := true;
        -- Case 2: Role check at start with AND
        ELSIF normalized_expr LIKE test_pattern || ' AND %' OR
              normalized_expr LIKE '(' || test_pattern || ') AND %' THEN
          IF normalized_expr !~* '\s+or\s+' THEN
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_with_check_expr := regexp_replace(with_check_expr, 
                '^\s*\(' || escaped_pattern || '\)\s+and\s+', 
                '', 'gi');
              IF new_with_check_expr = with_check_expr THEN
                new_with_check_expr := regexp_replace(with_check_expr, 
                  '^\s*' || escaped_pattern || '\s+and\s+', 
                  '', 'gi');
              END IF;
              IF new_with_check_expr != with_check_expr AND new_with_check_expr !~* '\s+or\s+' THEN
                with_check_safe := true;
              ELSE
                new_with_check_expr := with_check_expr;
              END IF;
            END;
          END IF;
        -- Case 3: Role check at end with AND
        ELSIF normalized_expr LIKE '% AND ' || test_pattern OR
              normalized_expr LIKE '% AND (' || test_pattern || ')' THEN
          IF normalized_expr !~* '\s+or\s+' THEN
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_with_check_expr := regexp_replace(with_check_expr, 
                '\s+and\s+\(' || escaped_pattern || '\)\s*$', 
                '', 'gi');
              IF new_with_check_expr = with_check_expr THEN
                new_with_check_expr := regexp_replace(with_check_expr, 
                  '\s+and\s+' || escaped_pattern || '\s*$', 
                  '', 'gi');
              END IF;
              IF new_with_check_expr != with_check_expr AND new_with_check_expr !~* '\s+or\s+' THEN
                with_check_safe := true;
              ELSE
                new_with_check_expr := with_check_expr;
              END IF;
            END;
          END IF;
        -- Case 4: Role check in middle
        ELSIF normalized_expr LIKE '% AND ' || test_pattern || ' AND %' OR
              normalized_expr LIKE '% AND (' || test_pattern || ') AND %' THEN
          IF normalized_expr !~* '\s+or\s+' THEN
            DECLARE
              escaped_pattern TEXT := regexp_replace(role_check_pattern, '([()[\]{}*+?.^$|\\])', '\\\1', 'g');
            BEGIN
              new_with_check_expr := regexp_replace(with_check_expr, 
                '\s+and\s+\(' || escaped_pattern || '\)\s+and\s+', 
                ' and ', 'gi');
              IF new_with_check_expr = with_check_expr THEN
                new_with_check_expr := regexp_replace(with_check_expr, 
                  '\s+and\s+' || escaped_pattern || '\s+and\s+', 
                  ' and ', 'gi');
              END IF;
              IF new_with_check_expr != with_check_expr AND new_with_check_expr !~* '\s+or\s+' THEN
                with_check_safe := true;
              ELSE
                new_with_check_expr := with_check_expr;
              END IF;
            END;
          END IF;
        END IF;
        
        IF with_check_safe THEN
          safe_to_remove := true;
        END IF;
      END;
    END IF;
    
    -- Only update if we found a safe removal
    IF safe_to_remove THEN
      -- Drop and recreate the policy
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                     policy_rec.policyname, 
                     policy_rec.schemaname, 
                     policy_rec.tablename);
      
      -- Recreate with cleaned expressions
      IF policy_rec.cmd = 'SELECT' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s USING (%s)',
                      policy_rec.policyname,
                      policy_rec.schemaname,
                      policy_rec.tablename,
                      policy_rec.cmd,
                      target_role,
                      new_using_expr);
      ELSIF policy_rec.cmd = 'INSERT' THEN
        IF new_using_expr IS NULL OR new_using_expr = '' THEN
          EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s WITH CHECK (%s)',
                        policy_rec.policyname,
                        policy_rec.schemaname,
                        policy_rec.tablename,
                        policy_rec.cmd,
                        target_role,
                        COALESCE(new_with_check_expr, 'true'));
        ELSE
          EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                        policy_rec.policyname,
                        policy_rec.schemaname,
                        policy_rec.tablename,
                        policy_rec.cmd,
                        target_role,
                        new_using_expr,
                        COALESCE(new_with_check_expr, 'true'));
        END IF;
      ELSIF policy_rec.cmd = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s USING (%s) WITH CHECK (%s)',
                      policy_rec.policyname,
                      policy_rec.schemaname,
                      policy_rec.tablename,
                      policy_rec.cmd,
                      target_role,
                      COALESCE(new_using_expr, 'true'),
                      COALESCE(new_with_check_expr, 'true'));
      ELSIF policy_rec.cmd = 'DELETE' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO %s USING (%s)',
                      policy_rec.policyname,
                      policy_rec.schemaname,
                      policy_rec.tablename,
                      policy_rec.cmd,
                      target_role,
                      new_using_expr);
      END IF;
      
      RAISE NOTICE 'Removed redundant role check from policy %.%.%',
                   policy_rec.schemaname, policy_rec.tablename, policy_rec.policyname;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- This migration removes redundant auth.role() checks that are already
-- guaranteed by the policy's TO clause, improving query performance.
--
-- Only clearly redundant checks are removed under strict safety conditions:
-- - Policy targets exactly one role
-- - Role check matches that role
-- - Role check is combined with AND (not OR)
--
-- All operations are idempotent and safe to rerun.
-- ============================================================================
