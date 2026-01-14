-- ============================================================================
-- Performance: Ensure Full (Non-Partial) Indexes on All Foreign Keys
-- ============================================================================
-- This migration ensures all FK columns have full btree indexes (no WHERE clause)
-- to guarantee optimal join performance, even for NULL values.
--
-- Strategy:
-- - For each FK column, check if canonical index idx_<table>_<column> exists
-- - If it exists and is partial (has WHERE clause), replace with full index
-- - If it doesn't exist, create full index
-- - If a full index already exists (any name), skip (no duplicate)
-- ============================================================================

DO $$
DECLARE
  fk_rec RECORD;
  idx_name TEXT;
  idx_exists BOOLEAN;
  idx_is_partial BOOLEAN;
  idx_def TEXT;
  table_oid OID;
  column_attnum SMALLINT;
  full_idx_exists BOOLEAN;
BEGIN
  -- ==========================================================================
  -- Process each FK column that needs full index coverage
  -- ==========================================================================
  FOR fk_rec IN
    SELECT 
      'public'::text as schema_name,
      'gameday_rounds'::text as table_name,
      'locked_course_id'::text as column_name
    UNION ALL
    SELECT 'public', 'gameday_rounds', 'locked_tee_id'
    UNION ALL
    SELECT 'public', 'gameday_scores', 'member_id'
    UNION ALL
    SELECT 'public', 'group_members', 'approved_by'
    UNION ALL
    SELECT 'public', 'groups', 'created_by'
    UNION ALL
    SELECT 'public', 'handicap_rounds', 'course_id'
    UNION ALL
    SELECT 'public', 'handicap_rounds', 'member_id'
    UNION ALL
    SELECT 'public', 'handicap_rounds', 'tee_id'
    UNION ALL
    SELECT 'public', 'handicap_rounds', 'trip_id'
    UNION ALL
    SELECT 'public', 'member_handicap_index', 'member_id'
    UNION ALL
    SELECT 'public', 'members', 'last_active_group_id'
    UNION ALL
    SELECT 'public', 'trip_flights', 'started_by_member_id'
    UNION ALL
    SELECT 'public', 'trips', 'tee_id'
  LOOP
    -- Generate canonical index name
    idx_name := 'idx_' || fk_rec.table_name || '_' || fk_rec.column_name;
    
    -- Check if canonical index exists and get its definition
    SELECT 
      EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = fk_rec.schema_name
          AND indexname = idx_name
      ),
      COALESCE(
        (SELECT indexdef FROM pg_indexes 
         WHERE schemaname = fk_rec.schema_name 
           AND indexname = idx_name 
         LIMIT 1),
        ''
      )
    INTO idx_exists, idx_def;
    
    -- Determine if existing index is partial (contains WHERE clause)
    idx_is_partial := idx_def LIKE '% WHERE %';
    
    -- Get table OID and column attribute number for existence checks
    SELECT oid INTO table_oid
    FROM pg_class
    WHERE relname = fk_rec.table_name
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = fk_rec.schema_name);
    
    IF table_oid IS NULL THEN
      RAISE NOTICE 'Table %.% does not exist, skipping', 
                   fk_rec.schema_name, fk_rec.table_name;
      CONTINUE;
    END IF;
    
    SELECT attnum INTO column_attnum
    FROM pg_attribute
    WHERE attrelid = table_oid
      AND attname = fk_rec.column_name;
    
    IF column_attnum IS NULL THEN
      RAISE NOTICE 'Column %.%.% does not exist, skipping', 
                   fk_rec.schema_name, fk_rec.table_name, fk_rec.column_name;
      CONTINUE;
    END IF;
    
    -- Check if a full (non-partial) index exists on this column (any name)
    SELECT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class ic ON i.indexrelid = ic.oid
      JOIN pg_namespace n ON ic.relnamespace = n.oid
      WHERE i.indrelid = table_oid
        AND column_attnum = ANY(i.indkey)
        AND n.nspname = fk_rec.schema_name
        AND (i.indpred IS NULL)  -- No WHERE clause (not partial)
        AND (NOT idx_exists OR ic.relname != idx_name)  -- Either canonical doesn't exist, or check other indexes
    ) INTO full_idx_exists;
    
    -- If canonical index exists and is partial, drop it
    IF idx_exists AND idx_is_partial THEN
      EXECUTE format('DROP INDEX IF EXISTS %I.%I', 
                     fk_rec.schema_name, idx_name);
      RAISE NOTICE 'Dropped partial index % on %.%', 
                   idx_name, fk_rec.table_name, fk_rec.column_name;
      idx_exists := false;  -- Mark as dropped so we can create new one
    END IF;
    
    -- Create canonical full index if:
    -- 1. Canonical index doesn't exist (or was just dropped), AND
    -- 2. No other full index already covers this column
    IF NOT idx_exists AND NOT full_idx_exists THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I(%I)',
                    idx_name, 
                    fk_rec.schema_name, 
                    fk_rec.table_name, 
                    fk_rec.column_name);
      RAISE NOTICE 'Created full index % on %.%', 
                   idx_name, fk_rec.table_name, fk_rec.column_name;
    ELSIF full_idx_exists AND NOT idx_exists THEN
      RAISE NOTICE 'Full index already exists on %.%, skipping canonical index creation',
                   fk_rec.table_name, fk_rec.column_name;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- This migration ensures all listed FK columns have full (non-partial) btree
-- indexes for optimal join performance, replacing any partial indexes created
-- in phase_perf_2_indexes.sql.
--
-- All operations are idempotent and safe to rerun.
-- ============================================================================
