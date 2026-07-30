-- Tally Insights migration 0013: constituency engagement stats
-- Dashboard tiles mirroring the consumer app district header: verified
-- constituent counts, share of each party that weighed in this month with
-- month over month movement, and new verified registrations. Additive only.

create view public.insights_registrations as
select
  date_trunc('month', p.created_at)::date as month,
  count(*)::int as registrations
from public.profiles p
where p.id_on_file and public.insights_in_any_org()
group by 1;

create view public.insights_party_engagement as
with cur as (
  select distinct user_id from public.weigh_ins
  where rated_at >= date_trunc('month', now())
),
prev as (
  select distinct user_id from public.weigh_ins
  where rated_at >= date_trunc('month', now()) - interval '1 month'
    and rated_at < date_trunc('month', now())
)
select
  coalesce(p.party, 'U') as party,
  count(*)::int as constituents,
  (count(*) filter (where p.id in (select user_id from cur)))::int as engaged_this_month,
  (count(*) filter (where p.id in (select user_id from prev)))::int as engaged_last_month,
  (count(*) filter (where p.created_at >= date_trunc('month', now())))::int as new_this_month
from public.profiles p
where p.id_on_file and public.insights_in_any_org()
group by 1;

revoke all on public.insights_registrations from public, anon;
revoke all on public.insights_party_engagement from public, anon;
grant select on public.insights_registrations to authenticated;
grant select on public.insights_party_engagement to authenticated;
