-- Tally Insights migration 0012: cross filtered stats for the sidebar
-- One security definer function serves the left hand filter toolbar: item
-- aggregates under any combination of district (root or exact), party, age
-- bracket, sex, and race, with movement baked in. Entitlement is the same
-- set based check as the views. Also: distribution arrays on the age, sex,
-- and race views (for the tabbed distribution display) and a view listing
-- the districts available to the caller. Additive only.

create or replace view public.insights_item_age_bracket as
with ent as (
  select e.district_id from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  case
    when p.birth_year is null then 'unknown'
    when extract(year from current_date)::int - p.birth_year < 30 then '18-29'
    when extract(year from current_date)::int - p.birth_year < 45 then '30-44'
    when extract(year from current_date)::int - p.birth_year < 65 then '45-64'
    else '65+'
  end as age_bucket,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample,
  array[
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int
  ] as distribution
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create or replace view public.insights_item_sex as
with ent as (
  select e.district_id from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  coalesce(p.sex, 'unknown') as sex,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample,
  array[
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int
  ] as distribution
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create or replace view public.insights_item_race as
with ent as (
  select e.district_id from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  coalesce(p.race, 'unknown') as race,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample,
  array[
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int
  ] as distribution
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create view public.insights_available_districts as
with ent as (
  select e.district_id from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.district_id,
  public.insights_root_district(w.district_id) as root_district,
  count(*)::int as n
from public.weigh_ins w
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by w.district_id;

revoke all on public.insights_available_districts from public, anon;
grant select on public.insights_available_districts to authenticated;

create or replace function public.insights_filtered_item_stats(
  p_district text default null,
  p_exact boolean default false,
  p_party text[] default null,
  p_age text[] default null,
  p_sex text[] default null,
  p_race text[] default null
)
returns table (
  kind text,
  item_id text,
  n integer,
  avg_value numeric,
  distribution integer[],
  avg_7d_ago numeric,
  avg_30d_ago numeric,
  title text
)
language sql stable security definer
set search_path = public
as $$
  with ent as (
    select e.district_id from org_entitlements e
    join org_members m on m.org_id = e.org_id
    where m.user_id = auth.uid()
  )
  select
    w.kind,
    w.item_id,
    count(*)::int as n,
    round(avg(w.value), 2) as avg_value,
    array[
      (count(*) filter (where w.value = 1))::int,
      (count(*) filter (where w.value = 2))::int,
      (count(*) filter (where w.value = 3))::int,
      (count(*) filter (where w.value = 4))::int,
      (count(*) filter (where w.value = 5))::int
    ] as distribution,
    round(avg(w.value) filter (where w.rated_at <= now() - interval '7 days'), 2) as avg_7d_ago,
    round(avg(w.value) filter (where w.rated_at <= now() - interval '30 days'), 2) as avg_30d_ago,
    max(w.title) as title
  from weigh_ins w
  left join profiles p on p.id = w.user_id
  where (w.district_id in (select district_id from ent)
         or insights_root_district(w.district_id) in (select district_id from ent))
    and (p_district is null or (
          case when p_exact then w.district_id = p_district
               else insights_root_district(w.district_id) = p_district end))
    and (not p_exact or insights_has_feature('district_exact'))
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
  group by w.kind, w.item_id
$$;

revoke execute on function public.insights_filtered_item_stats(text, boolean, text[], text[], text[], text[]) from public, anon;
grant execute on function public.insights_filtered_item_stats(text, boolean, text[], text[], text[], text[]) to authenticated;
