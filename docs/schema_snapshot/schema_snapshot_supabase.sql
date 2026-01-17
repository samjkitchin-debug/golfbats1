-- Supabase SQL Editor: Schema Snapshot (public)
-- Run each SELECT and download result sets as CSV.
-- Minimum: columns, constraints, indexes, policies.
select now() as extracted_at_utc, current_database() as db, current_user as db_user, version() as postgres_version;

select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

select
  con.conname as constraint_name,
  con.conrelid::regclass::text as table_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_namespace n on n.oid = con.connamespace
where n.nspname = 'public'
order by table_name, constraint_name;

select
  t.relname as table_name,
  i.relname as index_name,
  ix.indisunique as is_unique,
  ix.indisprimary as is_primary,
  pg_get_indexdef(ix.indexrelid) as index_def
from pg_class t
join pg_index ix on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relkind = 'r'
order by t.relname, i.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by function_name, args;
