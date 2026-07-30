-- Tally Insights migration 0010: performance layer and topic dates
-- The overview, dashboard, and officials pages were shipping thousands of
-- raw trend and vote rows per request. These pre aggregated views cut each
-- page to a handful of small queries, and the indexes support them.
-- Also adds topics.created_at (the date a topic was added to Tally) for the
-- spreadsheet style filters. Additive only.

create index if not exists weigh_ins_item_idx on public.weigh_ins (kind, item_id);
create index if not exists weigh_ins_district_idx on public.weigh_ins (district_id);
create index if not exists weigh_ins_rated_at_idx on public.weigh_ins (rated_at);
create index if not exists official_votes_live_member_idx
  on public.official_votes_live (member_key, vote_date desc);

alter table public.topics add column if not exists created_at timestamptz not null default now();

-- Movement per item: current mean plus the cumulative mean as it stood 7 and
-- 30 days ago, so the app computes the two deltas from one small row.
create view public.insights_item_movement as
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_now,
  round(avg(w.value) filter (where w.rated_at <= now() - interval '7 days'), 2) as avg_7d_ago,
  round(avg(w.value) filter (where w.rated_at <= now() - interval '30 days'), 2) as avg_30d_ago
from public.weigh_ins w
where public.insights_entitled_district(w.district_id)
group by w.kind, w.item_id, public.insights_root_district(w.district_id);

-- Daily response volume for the dashboard activity chart.
create view public.insights_daily_volume as
select
  public.insights_root_district(w.district_id) as district_id,
  w.rated_at::date as day,
  count(*)::int as responses
from public.weigh_ins w
where public.insights_entitled_district(w.district_id)
group by public.insights_root_district(w.district_id), w.rated_at::date;

-- Five most recent votes per member, so the officials page stops fetching
-- the full roll call table.
create view public.insights_member_recent_votes as
select member_key, chamber, vote_date, question, bill_label, bill_title, vote_cast, result
from (
  select *,
    row_number() over (partition by member_key order by vote_date desc, roll desc) as rn
  from public.official_votes_live
  where member_key is not null
) v
where rn <= 5 and public.insights_in_any_org();

revoke all on public.insights_item_movement from public, anon;
revoke all on public.insights_daily_volume from public, anon;
revoke all on public.insights_member_recent_votes from public, anon;
grant select on public.insights_item_movement to authenticated;
grant select on public.insights_daily_volume to authenticated;
grant select on public.insights_member_recent_votes to authenticated;
