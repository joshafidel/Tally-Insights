-- County granularity pushed insights_available_districts past PostgREST's
-- 1000 row page size. Return the whole set as one JSON payload instead.
create or replace function public.insights_available_districts_all()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'district_id', t.district_id,
      'root_district', t.root_district,
      'n', t.n
    ) order by t.district_id),
    '[]'::jsonb
  )
  from public.insights_available_districts t;
$$;

revoke all on function public.insights_available_districts_all() from public, anon;
grant execute on function public.insights_available_districts_all() to authenticated;
