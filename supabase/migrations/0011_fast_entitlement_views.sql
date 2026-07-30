-- Tally Insights migration 0011: set based entitlement checks
-- The aggregate views filtered rows with insights_entitled_district(), a
-- security definer function evaluated once per weigh in row. At simulated
-- data volume (261k rows) that meant 261k subqueries per page query, blowing
-- the statement timeout and rendering every item as no responses yet.
-- These replacements compute the caller's entitled district set once and let
-- the planner hash join it. Column lists are unchanged. Additive only.

create or replace view public.insights_item_sentiment as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  array[
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int
  ] as distribution,
  (count(*) < 50) as low_sample,
  max(w.title) as title
from public.weigh_ins w
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by w.kind, w.item_id, public.insights_root_district(w.district_id);

create or replace view public.insights_item_party as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  coalesce(p.party, 'U') as party,
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
group by w.kind, w.item_id, public.insights_root_district(w.district_id), coalesce(p.party, 'U');

create or replace view public.insights_item_trend as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
),
daily as (
  select
    w.kind,
    w.item_id,
    public.insights_root_district(w.district_id) as district_id,
    w.rated_at::date as day,
    count(*) as day_n,
    sum(w.value) as day_sum
  from public.weigh_ins w
  where w.district_id in (select district_id from ent)
     or public.insights_root_district(w.district_id) in (select district_id from ent)
  group by w.kind, w.item_id, public.insights_root_district(w.district_id), w.rated_at::date
)
select
  kind,
  item_id,
  district_id,
  day,
  (sum(day_n) over w)::int as n,
  round((sum(day_sum) over w)::numeric / (sum(day_n) over w), 2) as avg_value
from daily
window w as (partition by kind, item_id, district_id order by day);

create or replace view public.insights_item_movement as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_now,
  round(avg(w.value) filter (where w.rated_at <= now() - interval '7 days'), 2) as avg_7d_ago,
  round(avg(w.value) filter (where w.rated_at <= now() - interval '30 days'), 2) as avg_30d_ago
from public.weigh_ins w
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by w.kind, w.item_id, public.insights_root_district(w.district_id);

create or replace view public.insights_daily_volume as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  public.insights_root_district(w.district_id) as district_id,
  w.rated_at::date as day,
  count(*)::int as responses
from public.weigh_ins w
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by public.insights_root_district(w.district_id), w.rated_at::date;

create or replace view public.insights_item_age_bracket as
with ent as (
  select e.district_id
  from public.org_entitlements e
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
  (count(*) < 50) as low_sample
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create or replace view public.insights_item_sex as
with ent as (
  select e.district_id
  from public.org_entitlements e
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
  (count(*) < 50) as low_sample
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create or replace view public.insights_item_race as
with ent as (
  select e.district_id
  from public.org_entitlements e
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
  (count(*) < 50) as low_sample
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent)
group by 1, 2, 3, 4;

create or replace view public.insights_item_age_year as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  (extract(year from current_date)::int - p.birth_year) as age_years,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample
from public.weigh_ins w
join public.profiles p on p.id = w.user_id and p.birth_year is not null
where (w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent))
  and public.insights_has_feature('age_exact')
group by w.kind, w.item_id, public.insights_root_district(w.district_id),
  (extract(year from current_date)::int - p.birth_year);

create or replace view public.insights_item_district_exact as
with ent as (
  select e.district_id
  from public.org_entitlements e
  join public.org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select
  w.kind,
  w.item_id,
  w.district_id,
  public.insights_root_district(w.district_id) as root_district,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample
from public.weigh_ins w
where (w.district_id in (select district_id from ent)
   or public.insights_root_district(w.district_id) in (select district_id from ent))
  and public.insights_has_feature('district_exact')
group by w.kind, w.item_id, w.district_id;
