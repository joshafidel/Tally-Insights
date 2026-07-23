-- Tally Insights migration 0004: official alignment view
-- Additive only.
--
-- How alignment is computed:
--   bills.agree_direction says which roll call vote (yea or nay) matches
--   agreeing with the bill on the consumer 1 to 5 scale.
--   The official position is mapped onto that scale: voting the agree
--   direction counts as 5, voting against it counts as 1.
--   gap is the absolute distance between the district mean and the official
--   position, so it ranges 0 to 4 and bigger means further from the district.
--   alignment classifies each vote:
--     aligned: the official voted the way the district leans
--     against_district_support: district leans agree, official voted the other way
--     with_what_district_opposes: district leans disagree, official voted for it
--     district_neutral: district mean is exactly 3
--     not_scored: abstain or absent, or the sample is below the 50 floor
create view public.insights_official_alignment as
with district_sentiment as (
  select bill_id, district_id, count(*) as n, avg(value) as avg_value
  from public.sentiment_ratings
  group by bill_id, district_id
)
select
  o.id as official_id,
  o.name as official_name,
  o.party as official_party,
  o.role as official_role,
  o.district_id,
  v.bill_id,
  b.title as bill_title,
  b.agree_direction,
  v.vote,
  v.voted_at,
  coalesce(ds.n, 0)::int as sample_n,
  case when ds.n >= 50 then round(ds.avg_value, 2) end as district_avg,
  (coalesce(ds.n, 0) < 50) as suppressed,
  case when ds.n >= 50 and v.vote in ('yea', 'nay') then
    case when b.agree_direction::text = v.vote::text then 5 else 1 end
  end as official_position,
  case when ds.n >= 50 and v.vote in ('yea', 'nay') then
    round(abs(ds.avg_value - case when b.agree_direction::text = v.vote::text then 5 else 1 end), 2)
  end as gap,
  case
    when coalesce(ds.n, 0) < 50 or v.vote not in ('yea', 'nay') then 'not_scored'
    when ds.avg_value = 3 then 'district_neutral'
    when (ds.avg_value > 3) = (b.agree_direction::text = v.vote::text) then 'aligned'
    when ds.avg_value > 3 then 'against_district_support'
    else 'with_what_district_opposes'
  end as alignment
from public.official_votes v
join public.officials o on o.id = v.official_id
join public.bills b on b.id = v.bill_id
left join district_sentiment ds
  on ds.bill_id = v.bill_id and ds.district_id = o.district_id
where public.insights_entitled_district(o.district_id);

revoke all on public.insights_official_alignment from public, anon;
grant select on public.insights_official_alignment to authenticated;
