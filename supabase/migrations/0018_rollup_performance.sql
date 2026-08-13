-- Precomputed rollups fix statement timeouts at 1.2M responses on small
-- instances. A cron refreshed table carries per item aggregates at root
-- and exact district grain with linearly combinable sums, the filtered
-- stats function serves demographic free requests from it, and the
-- available districts readers do the same. Demographic slices still scan
-- raw rows, scoped by the indexed root column. Applied to both projects.

create table if not exists public.insights_rollup (
  scope text not null,
  district_id text not null,
  kind text not null,
  item_id text not null,
  n integer not null,
  sum_value bigint not null,
  c1 integer not null, c2 integer not null, c3 integer not null,
  c4 integer not null, c5 integer not null,
  n7 integer not null, sum7 bigint not null,
  n30 integer not null, sum30 bigint not null,
  title text,
  primary key (scope, district_id, kind, item_id)
);
revoke all on public.insights_rollup from public, anon, authenticated;

create or replace function public.insights_refresh_rollup()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  delete from insights_rollup;
  insert into insights_rollup
  select 'root', w.root_district, w.kind, w.item_id,
    count(*)::int, sum(w.value)::bigint,
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int,
    (count(*) filter (where w.rated_at <= now() - interval '7 days'))::int,
    coalesce(sum(w.value) filter (where w.rated_at <= now() - interval '7 days'), 0)::bigint,
    (count(*) filter (where w.rated_at <= now() - interval '30 days'))::int,
    coalesce(sum(w.value) filter (where w.rated_at <= now() - interval '30 days'), 0)::bigint,
    max(w.title)
  from weigh_ins w
  group by 1, 2, 3, 4;

  insert into insights_rollup
  select 'exact', w.district_id, w.kind, w.item_id,
    count(*)::int, sum(w.value)::bigint,
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int,
    (count(*) filter (where w.rated_at <= now() - interval '7 days'))::int,
    coalesce(sum(w.value) filter (where w.rated_at <= now() - interval '7 days'), 0)::bigint,
    (count(*) filter (where w.rated_at <= now() - interval '30 days'))::int,
    coalesce(sum(w.value) filter (where w.rated_at <= now() - interval '30 days'), 0)::bigint,
    max(w.title)
  from weigh_ins w
  where w.district_id <> w.root_district
  group by 1, 2, 3, 4;
end;
$$;
revoke all on function public.insights_refresh_rollup() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('insights-rollup');
exception when others then null;
end $$;
select cron.schedule('insights-rollup', '*/10 * * * *', 'select public.insights_refresh_rollup()');
select public.insights_refresh_rollup();

-- Filtered stats: rollup fast path when no demographic filter is applied
create or replace function public.insights_filtered_item_stats(
  p_district text default null,
  p_exact boolean default false,
  p_party text[] default null,
  p_age text[] default null,
  p_sex text[] default null,
  p_race text[] default null
)
returns table (
  kind text, item_id text, n integer, avg_value numeric,
  distribution integer[], avg_7d_ago numeric, avg_30d_ago numeric, title text
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_exact and not insights_has_feature('district_exact') then
    return;
  end if;

  if p_party is null and p_age is null and p_sex is null and p_race is null then
    return query
    with ent as (
      select e.district_id from org_entitlements e
      join org_members m on m.org_id = e.org_id
      where m.user_id = auth.uid()
    )
    select r.kind, r.item_id,
      sum(r.n)::int,
      round(sum(r.sum_value)::numeric / nullif(sum(r.n), 0), 2),
      array[sum(r.c1)::int, sum(r.c2)::int, sum(r.c3)::int, sum(r.c4)::int, sum(r.c5)::int],
      round(sum(r.sum7)::numeric / nullif(sum(r.n7), 0), 2),
      round(sum(r.sum30)::numeric / nullif(sum(r.n30), 0), 2),
      max(r.title)
    from insights_rollup r
    where case
      when p_district is null then
        r.scope = 'root' and r.district_id in (select ent.district_id from ent)
      when p_exact then
        r.scope = 'exact' and r.district_id = p_district
        and (r.district_id in (select ent.district_id from ent)
             or split_part(r.district_id, '-', 1) in (select ent.district_id from ent))
      else
        r.scope = 'root' and r.district_id = p_district
        and r.district_id in (select ent.district_id from ent)
    end
    group by r.kind, r.item_id;
    return;
  end if;

  return query
  with ent as (
    select e.district_id from org_entitlements e
    join org_members m on m.org_id = e.org_id
    where m.user_id = auth.uid()
  )
  select
    w.kind, w.item_id,
    count(*)::int,
    round(avg(w.value), 2),
    array[
      (count(*) filter (where w.value = 1))::int,
      (count(*) filter (where w.value = 2))::int,
      (count(*) filter (where w.value = 3))::int,
      (count(*) filter (where w.value = 4))::int,
      (count(*) filter (where w.value = 5))::int
    ],
    round(avg(w.value) filter (where w.rated_at <= now() - interval '7 days'), 2),
    round(avg(w.value) filter (where w.rated_at <= now() - interval '30 days'), 2),
    max(w.title)
  from weigh_ins w
  left join profiles p on p.id = w.user_id
  where (w.district_id in (select ent.district_id from ent)
         or w.root_district in (select ent.district_id from ent))
    and (p_district is null or (
          case when p_exact then w.district_id = p_district
               else w.root_district = p_district end))
    and (p_party is null or coalesce(p.party, 'U') = any(p_party))
    and (p_age is null or (
          case
            when p.birth_year is null then 'unknown'
            when extract(year from current_date)::int - p.birth_year < 30 then '18-29'
            when extract(year from current_date)::int - p.birth_year < 45 then '30-44'
            when extract(year from current_date)::int - p.birth_year < 65 then '45-64'
            else '65+'
          end) = any(p_age))
    and (p_sex is null or coalesce(p.sex, 'unknown') = any(p_sex))
    and (p_race is null or coalesce(p.race, 'unknown') = any(p_race))
  group by w.kind, w.item_id;
end;
$$;

-- Available district counts come from the rollup too
create or replace view public.insights_available_districts as
with ent as (
  select e.district_id from org_entitlements e
  join org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select r.district_id,
  case when r.scope = 'root' then r.district_id
       else split_part(r.district_id, '-', 1) end as root_district,
  sum(r.n)::int as n
from insights_rollup r
where (r.district_id in (select ent.district_id from ent)
       or split_part(r.district_id, '-', 1) in (select ent.district_id from ent))
group by r.district_id, r.scope;

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
    select r.district_id,
      case when r.scope = 'root' then r.district_id
           else split_part(r.district_id, '-', 1) end as root,
      sum(r.n)::int as n
    from insights_rollup r
    where (r.district_id in (select district_id from ent)
           or split_part(r.district_id, '-', 1) in (select district_id from ent))
    group by r.district_id, r.scope
  ) s;
$$;
revoke all on function public.insights_available_districts_for_org(uuid)
  from public, anon, authenticated;
grant execute on function public.insights_available_districts_for_org(uuid)
  to service_role;

-- Backstop while raw demographic scans warm on small instances
alter role authenticated set statement_timeout = '20s';
