-- Tally Insights migration 0009: full demographic breakdowns per item
-- A politician reading any bill or topic needs: the overall number, and the
-- breakdown by party, age, sex, and race. Party exists today; age comes from
-- profiles.birth_year (0007); sex and race columns are added here for the
-- consumer app to collect at signup or verification. Views render whatever
-- exists and grow as collection begins. Additive only.

alter table public.profiles add column if not exists sex text;
alter table public.profiles add column if not exists race text;

create view public.insights_item_age_bracket as
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
where public.insights_entitled_district(w.district_id)
group by 1, 2, 3, 4;

create view public.insights_item_sex as
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
where public.insights_entitled_district(w.district_id)
group by 1, 2, 3, 4;

create view public.insights_item_race as
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
where public.insights_entitled_district(w.district_id)
group by 1, 2, 3, 4;

revoke all on public.insights_item_age_bracket from public, anon;
revoke all on public.insights_item_sex from public, anon;
revoke all on public.insights_item_race from public, anon;
grant select on public.insights_item_age_bracket to authenticated;
grant select on public.insights_item_sex to authenticated;
grant select on public.insights_item_race to authenticated;
