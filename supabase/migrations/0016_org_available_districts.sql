-- Org scoped available districts for the service role content cache. The
-- per user rpc stays for interactive fallback; this variant takes the org
-- explicitly so cached server renders skip the weigh_ins scan per request.
create or replace function public.insights_available_districts_for_org(p_org uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with ent as (
    select district_id from public.org_entitlements where org_id = p_org
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'district_id', s.district_id,
      'root_district', s.root,
      'n', s.n
    ) order by s.district_id),
    '[]'::jsonb
  )
  from (
    select
      w.district_id,
      public.insights_root_district(w.district_id) as root,
      count(*)::int as n
    from public.weigh_ins w
    where w.district_id in (select district_id from ent)
       or public.insights_root_district(w.district_id) in (select district_id from ent)
    group by 1, 2
  ) s;
$$;

revoke all on function public.insights_available_districts_for_org(uuid)
  from public, anon, authenticated;
grant execute on function public.insights_available_districts_for_org(uuid)
  to service_role;
