-- Tally Insights migration 0003: aggregate views with sample floors
-- Additive only. Consumer views are untouched; all new objects use the insights_ prefix.
--
-- Access model: these views intentionally run with owner privileges (the
-- Postgres default) so they can aggregate over sentiment_ratings, which has no
-- SELECT policy for clients. Raw rows stay unreachable. Every view revokes
-- anon entirely and filters by the caller entitlements, so a leaked anon key
-- returns permission denied and a logged in buyer only sees entitled districts.
--
-- Sample floors:
--   Top line district numbers suppress below 50 responses (methodology page rule).
--   Demographic cells display from 5 responses so breakdowns are not hidden,
--   with the floor of 5 protecting any cell small enough to expose an
--   individual rating. Sample size n is always exposed for every cell.

-- Top line sentiment per bill per district
create view public.insights_bill_sentiment as
select
  bill_id,
  district_id,
  count(*)::int as n,
  case when count(*) >= 50 then round(avg(value), 2) end as avg_value,
  case when count(*) >= 50 then array[
    (count(*) filter (where value = 1))::int,
    (count(*) filter (where value = 2))::int,
    (count(*) filter (where value = 3))::int,
    (count(*) filter (where value = 4))::int,
    (count(*) filter (where value = 5))::int
  ] end as distribution,
  (count(*) < 50) as suppressed
from public.sentiment_ratings
where public.insights_entitled_district(district_id)
group by bill_id, district_id;

-- Demographic breakdowns: one view per dimension, cells display from n >= 5
create view public.insights_bill_sentiment_by_party as
select
  bill_id,
  district_id,
  party,
  count(*)::int as n,
  case when count(*) >= 5 then round(avg(value), 2) end as avg_value,
  case when count(*) >= 5 then array[
    (count(*) filter (where value = 1))::int,
    (count(*) filter (where value = 2))::int,
    (count(*) filter (where value = 3))::int,
    (count(*) filter (where value = 4))::int,
    (count(*) filter (where value = 5))::int
  ] end as distribution,
  (count(*) < 5) as suppressed
from public.sentiment_ratings
where public.insights_entitled_district(district_id)
group by bill_id, district_id, party;

create view public.insights_bill_sentiment_by_age as
select
  bill_id,
  district_id,
  age_bucket,
  count(*)::int as n,
  case when count(*) >= 5 then round(avg(value), 2) end as avg_value,
  case when count(*) >= 5 then array[
    (count(*) filter (where value = 1))::int,
    (count(*) filter (where value = 2))::int,
    (count(*) filter (where value = 3))::int,
    (count(*) filter (where value = 4))::int,
    (count(*) filter (where value = 5))::int
  ] end as distribution,
  (count(*) < 5) as suppressed
from public.sentiment_ratings
where public.insights_entitled_district(district_id)
group by bill_id, district_id, age_bucket;

create view public.insights_bill_sentiment_by_sex as
select
  bill_id,
  district_id,
  sex,
  count(*)::int as n,
  case when count(*) >= 5 then round(avg(value), 2) end as avg_value,
  case when count(*) >= 5 then array[
    (count(*) filter (where value = 1))::int,
    (count(*) filter (where value = 2))::int,
    (count(*) filter (where value = 3))::int,
    (count(*) filter (where value = 4))::int,
    (count(*) filter (where value = 5))::int
  ] end as distribution,
  (count(*) < 5) as suppressed
from public.sentiment_ratings
where public.insights_entitled_district(district_id)
group by bill_id, district_id, sex;

-- Cumulative daily trend: mean of all ratings up to each day.
-- Cumulative counts grow over time, so suppression only affects early days.
create view public.insights_bill_trend as
with daily as (
  select
    bill_id,
    district_id,
    created_at::date as day,
    count(*) as day_n,
    sum(value) as day_sum
  from public.sentiment_ratings
  group by bill_id, district_id, created_at::date
),
cumulative as (
  select
    bill_id,
    district_id,
    day,
    sum(day_n) over w as cum_n,
    sum(day_sum) over w as cum_sum
  from daily
  window w as (partition by bill_id, district_id order by day)
)
select
  bill_id,
  district_id,
  day,
  cum_n::int as n,
  case when cum_n >= 50 then round(cum_sum::numeric / cum_n, 2) end as avg_value,
  (cum_n < 50) as suppressed
from cumulative
where public.insights_entitled_district(district_id);

-- State and national rollups for side by side comparison.
-- Coarser than district level, so visible to any member of any org.
create view public.insights_bill_sentiment_state as
select
  s.bill_id,
  d.state,
  count(*)::int as n,
  case when count(*) >= 50 then round(avg(s.value), 2) end as avg_value,
  (count(*) < 50) as suppressed
from public.sentiment_ratings s
join public.districts d on d.id = s.district_id
where public.insights_in_any_org()
group by s.bill_id, d.state;

create view public.insights_bill_sentiment_national as
select
  bill_id,
  count(*)::int as n,
  case when count(*) >= 50 then round(avg(value), 2) end as avg_value,
  (count(*) < 50) as suppressed
from public.sentiment_ratings
where public.insights_in_any_org()
group by bill_id;

-- Grants: nothing for anon, select only for signed in users.
revoke all on public.insights_bill_sentiment from public, anon;
revoke all on public.insights_bill_sentiment_by_party from public, anon;
revoke all on public.insights_bill_sentiment_by_age from public, anon;
revoke all on public.insights_bill_sentiment_by_sex from public, anon;
revoke all on public.insights_bill_trend from public, anon;
revoke all on public.insights_bill_sentiment_state from public, anon;
revoke all on public.insights_bill_sentiment_national from public, anon;

grant select on public.insights_bill_sentiment to authenticated;
grant select on public.insights_bill_sentiment_by_party to authenticated;
grant select on public.insights_bill_sentiment_by_age to authenticated;
grant select on public.insights_bill_sentiment_by_sex to authenticated;
grant select on public.insights_bill_trend to authenticated;
grant select on public.insights_bill_sentiment_state to authenticated;
grant select on public.insights_bill_sentiment_national to authenticated;
