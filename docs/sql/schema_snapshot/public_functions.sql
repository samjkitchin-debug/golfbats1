CREATE OR REPLACE FUNCTION public._seed_allowed_values(p_table regclass, p_column text)
 RETURNS text[]
 LANGUAGE plpgsql
AS $function$
declare
  typ_oid oid;
  typ_kind "char";
  enum_vals text[];
begin
  -- detect column type
  select atttypid into typ_oid
  from pg_attribute
  where attrelid = p_table
    and attname = p_column
    and attnum > 0
    and not attisdropped;

  if typ_oid is null then
    return array[]::text[];
  end if;

  -- is enum?
  select t.typtype into typ_kind
  from pg_type t
  where t.oid = typ_oid;

  if typ_kind = 'e' then
    select array_agg(e.enumlabel order by e.enumsortorder)
      into enum_vals
    from pg_enum e
    where e.enumtypid = typ_oid;

    return coalesce(enum_vals, array[]::text[]);
  end if;

  return array[]::text[];
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_delete_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- delete all rows owned by this user (member)
  delete from public.trip_attendees where member_id = v_uid;
  delete from public.trip_flights where created_by = v_uid;
  delete from public.trip_decisions where created_by = v_uid;
  delete from public.trip_approvals where created_by = v_uid;
  delete from public.user_profiles where id = v_uid;
  delete from public.members where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_passports()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_count integer;
begin
  update public.trip_attendees
  set
    passport_number_encrypted = null,
    passport_number_last4 = null,
    passport_expires_at = null,
    passport_expires_at_utc = null
  where passport_expires_at_utc is not null
    and passport_expires_at_utc < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_passport_number(passport_number_encrypted bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_key text;
begin
  v_key := current_setting('app.passport_key', true);
  if v_key is null or v_key = '' then
    raise exception 'Missing app.passport_key';
  end if;

  if passport_number_encrypted is null then
    return null;
  end if;

  return convert_from(pgp_sym_decrypt(passport_number_encrypted, v_key), 'utf8');
end;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_passport_number(passport_number text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_key text;
begin
  v_key := current_setting('app.passport_key', true);
  if v_key is null or v_key = '' then
    raise exception 'Missing app.passport_key';
  end if;

  if passport_number is null or passport_number = '' then
    return null;
  end if;

  return pgp_sym_encrypt(passport_number, v_key);
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_is_admin(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.member_id = coalesce(p_user_id, auth.uid())
    and gm.is_admin = true
);
$function$;

CREATE OR REPLACE FUNCTION public.group_is_member(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.member_id = coalesce(p_user_id, auth.uid())
);
$function$;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select public.group_is_admin(p_group_id, auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_host_or_admin(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_group_id uuid;
  v_created_by uuid;
begin
  select t.group_id, t.created_by
    into v_group_id, v_created_by
  from public.trips t
  where t.id = p_trip_id;

  if v_group_id is not null then
    return public.group_is_admin(v_group_id, auth.uid());
  end if;

  return v_created_by = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid, p_member_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.trip_attendees ta
  where ta.trip_id = p_trip_id
    and ta.member_id = coalesce(p_member_id, auth.uid())
);
$function$;

CREATE OR REPLACE FUNCTION public.is_trip_participant(p_trip_id uuid, p_member_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.trip_attendees ta
  where ta.trip_id = p_trip_id
    and ta.member_id = coalesce(p_member_id, auth.uid())
    and coalesce(ta.rsvp, '') <> 'declined'
);
$function$;

CREATE OR REPLACE FUNCTION public.normalize_handicap(p_handicap text)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
declare
  v numeric;
begin
  if p_handicap is null then
    return null;
  end if;

  begin
    v := nullif(trim(p_handicap), '')::numeric;
  exception when others then
    return null;
  end;

  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_group_trip_member(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id
  from public.trips
  where id = p_trip_id;

  if v_group_id is null then
    return false;
  end if;

  return public.group_is_member(v_group_id, auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_group_trip_write(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id
  from public.trips
  where id = p_trip_id;

  if v_group_id is null then
    return false;
  end if;

  return public.group_is_admin(v_group_id, auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_hosted_trip_member(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.trips t
  join public.trip_attendees ta on ta.trip_id = t.id
  where t.id = p_trip_id
    and t.group_id is null
    and ta.member_id = auth.uid()
);
$function$;

CREATE OR REPLACE FUNCTION public.rls_hosted_trip_write(p_trip_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
select exists (
  select 1
  from public.trips t
  where t.id = p_trip_id
    and t.group_id is null
    and t.created_by = auth.uid()
);
$function$;

CREATE OR REPLACE FUNCTION public.set_app_passport_key(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  perform set_config('app.passport_key', p_key, true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.trip_phase_from_dates(p_trip_date date, p_cutoff_at timestamptz, p_scoring_started boolean, p_results_published boolean, p_phase_override text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_now date := (now() at time zone 'Asia/Singapore')::date;
  v_open date;
  v_close date;
begin
  if p_results_published then
    return 'completed';
  end if;

  if p_scoring_started then
    return 'in_play';
  end if;

  if p_phase_override is not null and p_phase_override <> '' then
    return p_phase_override;
  end if;

  v_open := p_trip_date - 30;
  v_close := (coalesce(p_cutoff_at, (p_trip_date - 4)::timestamptz) at time zone 'Asia/Singapore')::date;

  if v_now < v_open then
    return 'scheduled';
  elsif v_now >= v_open and v_now < v_close then
    return 'signups_open';
  else
    return 'locked';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trip_set_passport_number(p_trip_id uuid, p_passport_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_last4 text;
  v_encrypted bytea;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_last4 := right(regexp_replace(coalesce(p_passport_number,''), '\s+', '', 'g'), 4);
  v_encrypted := public.encrypt_passport_number(p_passport_number);

  update public.trip_attendees
  set
    passport_number_encrypted = v_encrypted,
    passport_number_last4 = nullif(v_last4,''),
    passport_expires_at_utc = now() + interval '30 days'
  where trip_id = p_trip_id
    and member_id = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_user_profile(p_display_name text DEFAULT NULL::text, p_handicap text DEFAULT NULL::text)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_uid uuid;
  v_profile public.user_profiles;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_profiles (id, display_name, handicap)
  values (v_uid, nullif(trim(p_display_name),''), nullif(trim(p_handicap),''))
  on conflict (id)
  do update set
    display_name = coalesce(nullif(trim(excluded.display_name),''), public.user_profiles.display_name),
    handicap = coalesce(nullif(trim(excluded.handicap),''), public.user_profiles.handicap)
  returning * into v_profile;

  return v_profile;
end;
$function$;
