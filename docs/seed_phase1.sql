-- BEGIN docs/seed_phase1.sql ---

begin;

-- 0) Wipe tenant-scoped tables (defensive: only truncate if table exists)
do $$
begin
  if to_regclass('public.result_rows') is not null then execute 'truncate table public.result_rows cascade'; end if;
  if to_regclass('public.trip_results') is not null then execute 'truncate table public.trip_results cascade'; end if;
  if to_regclass('public.trip_flight_slots') is not null then execute 'truncate table public.trip_flight_slots cascade'; end if;
  if to_regclass('public.trip_flights') is not null then execute 'truncate table public.trip_flights cascade'; end if;
  if to_regclass('public.trip_events') is not null then execute 'truncate table public.trip_events cascade'; end if;
  if to_regclass('public.trip_attendees') is not null then execute 'truncate table public.trip_attendees cascade'; end if;
  if to_regclass('public.trips') is not null then execute 'truncate table public.trips cascade'; end if;
end $$;

-- 1) Wipe course data (global)
truncate table public.provider_course_map cascade;
truncate table public.tee_holes cascade;
truncate table public.tees cascade;
truncate table public.courses cascade;

-- 2) Seed ONE "golden" course with 2 tees and 18 holes.
do $$
declare
  v_club_id uuid;
  v_course_id uuid;
  v_tee_blue uuid;
  v_tee_white uuid;
begin
  select id into v_club_id from public.clubs limit 1;
  if v_club_id is null then
    raise exception 'No rows in public.clubs. Create a club first, then re-run this seed.';
  end if;

  insert into public.courses (club_id, name, location, website)
  values (v_club_id, 'Demo National Golf Club', 'Singapore', 'https://example.com')
  returning id into v_course_id;

  insert into public.tees (course_id, label, meters, par, slope, rating)
  values (v_course_id, 'Blue', 6400, 72, 125, 72.0)
  returning id into v_tee_blue;

  insert into public.tees (course_id, label, meters, par, slope, rating)
  values (v_course_id, 'White', 6100, 72, 120, 71.0)
  returning id into v_tee_white;

  insert into public.tee_holes (tee_id, hole_number, par, meters, stroke_index)
  values
    (v_tee_blue, 1,4,380,9),(v_tee_blue, 2,5,510,1),(v_tee_blue, 3,3,165,13),(v_tee_blue, 4,4,400,7),
    (v_tee_blue, 5,4,360,15),(v_tee_blue, 6,4,410,5),(v_tee_blue, 7,3,190,11),(v_tee_blue, 8,5,520,3),
    (v_tee_blue, 9,4,370,17),(v_tee_blue,10,4,390,8),(v_tee_blue,11,5,500,2),(v_tee_blue,12,3,175,12),
    (v_tee_blue,13,4,405,6),(v_tee_blue,14,4,355,16),(v_tee_blue,15,3,200,10),(v_tee_blue,16,5,530,4),
    (v_tee_blue,17,4,365,18),(v_tee_blue,18,4,405,14);

  insert into public.tee_holes (tee_id, hole_number, par, meters, stroke_index)
  values
    (v_tee_white, 1,4,360,9),(v_tee_white, 2,5,490,1),(v_tee_white, 3,3,150,13),(v_tee_white, 4,4,380,7),
    (v_tee_white, 5,4,340,15),(v_tee_white, 6,4,390,5),(v_tee_white, 7,3,175,11),(v_tee_white, 8,5,500,3),
    (v_tee_white, 9,4,350,17),(v_tee_white,10,4,370,8),(v_tee_white,11,5,480,2),(v_tee_white,12,3,160,12),
    (v_tee_white,13,4,385,6),(v_tee_white,14,4,335,16),(v_tee_white,15,3,185,10),(v_tee_white,16,5,510,4),
    (v_tee_white,17,4,345,18),(v_tee_white,18,4,385,14);

end $$;

commit;

-- END docs/seed_phase1.sql ---
