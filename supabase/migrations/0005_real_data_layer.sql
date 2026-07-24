-- Tally Insights migration 0005: real data layer
-- Rebuilds the product on live consumer app activity (weigh_ins) instead of
-- the simulated sentiment_ratings dataset. Additive only: the simulated views
-- from 0003 and 0004 stay in place but the app no longer reads them.
--
-- Real district ids include council sub districts like nyc-cc-4 that have no
-- row in districts. Aggregates roll sub districts up to their root (nyc), and
-- entitlement to a root district covers its sub districts.

create or replace function public.insights_root_district(p text)
returns text
language sql immutable
as $$
  select split_part(p, '-', 1);
$$;

-- Upgrade the entitlement check used by all insights views: entitlement to a
-- root district also grants its sub districts.
create or replace function public.insights_entitled_district(p_district text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from org_entitlements e
    join org_members m on m.org_id = e.org_id
    where m.user_id = auth.uid()
      and (e.district_id = p_district
           or e.district_id = public.insights_root_district(p_district))
  );
$$;

-- Watchlist over every rateable kind: topics, curated bills, synced bills
create table public.tracked_items (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('topic', 'bill', 'live_bill')),
  item_id text not null,
  district_id text not null,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (org_id, kind, item_id, district_id)
);
comment on table public.tracked_items is 'Org watchlist across topics, curated bills, and synced federal bills. Supersedes tracked_bills, which remains for compatibility.';

create table public.item_alert_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('topic', 'bill', 'live_bill')),
  item_id text not null,
  district_id text not null,
  threshold numeric not null check (threshold > 0),
  window_days integer not null default 7 check (window_days in (7, 30)),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.item_alert_rules is 'Fires when the mean rating of an item moves by threshold within window_days.';

create table public.item_alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.item_alert_rules(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  item_id text not null,
  district_id text not null,
  old_mean numeric,
  new_mean numeric,
  delta numeric,
  sample_n integer,
  fired_at timestamptz not null default now(),
  delivered_via text[] not null default '{in_app}',
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id)
);
comment on table public.item_alert_events is 'Alert firings. delivered_via is an array so an email sender can append its channel later.';

alter table public.tracked_items enable row level security;
alter table public.item_alert_rules enable row level security;
alter table public.item_alert_events enable row level security;
revoke all on public.tracked_items from anon;
revoke all on public.item_alert_rules from anon;
revoke all on public.item_alert_events from anon;

create policy "members read tracked items"
  on public.tracked_items for select to authenticated
  using (org_id in (select public.insights_user_orgs()));
create policy "admins add tracked items"
  on public.tracked_items for insert to authenticated
  with check (
    public.insights_is_org_admin(org_id)
    and public.insights_entitled_district(district_id)
  );
create policy "admins remove tracked items"
  on public.tracked_items for delete to authenticated
  using (public.insights_is_org_admin(org_id));

create policy "members read item alert rules"
  on public.item_alert_rules for select to authenticated
  using (org_id in (select public.insights_user_orgs()));
create policy "admins create item alert rules"
  on public.item_alert_rules for insert to authenticated
  with check (
    public.insights_is_org_admin(org_id)
    and public.insights_entitled_district(district_id)
  );
create policy "admins update item alert rules"
  on public.item_alert_rules for update to authenticated
  using (public.insights_is_org_admin(org_id))
  with check (public.insights_is_org_admin(org_id));
create policy "admins delete item alert rules"
  on public.item_alert_rules for delete to authenticated
  using (public.insights_is_org_admin(org_id));

create policy "members read item alert events"
  on public.item_alert_events for select to authenticated
  using (org_id in (select public.insights_user_orgs()));
create policy "members acknowledge item alert events"
  on public.item_alert_events for update to authenticated
  using (org_id in (select public.insights_user_orgs()))
  with check (org_id in (select public.insights_user_orgs()));

-- Aggregate views over real weigh ins.
-- Sample size is always exposed. Means are shown at every sample size: the
-- consumer app already publishes weigh in tallies publicly at the same grain,
-- so these views add no exposure beyond what the free product shows. The
-- low_sample flag (n below 50) drives interpret with caution labeling.
create view public.insights_item_sentiment as
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
  (count(*) < 50) as low_sample
from public.weigh_ins w
where public.insights_entitled_district(w.district_id)
group by w.kind, w.item_id, public.insights_root_district(w.district_id);

create view public.insights_item_party as
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  coalesce(p.party, 'U') as party,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where public.insights_entitled_district(w.district_id)
group by w.kind, w.item_id, public.insights_root_district(w.district_id), coalesce(p.party, 'U');

create view public.insights_item_trend as
with daily as (
  select
    w.kind,
    w.item_id,
    public.insights_root_district(w.district_id) as district_id,
    w.rated_at::date as day,
    count(*) as day_n,
    sum(w.value) as day_sum
  from public.weigh_ins w
  where public.insights_entitled_district(w.district_id)
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

-- Official alignment against real weigh in sentiment on curated bills.
-- Alignment is scored from 5 responses; below that the vote is not_scored.
create view public.insights_official_alignment_live as
with s as (
  select
    w.item_id,
    public.insights_root_district(w.district_id) as district_id,
    count(*)::int as n,
    avg(w.value) as avg_value
  from public.weigh_ins w
  where w.kind = 'bill'
  group by w.item_id, public.insights_root_district(w.district_id)
)
select
  o.id as official_id,
  o.name as official_name,
  o.party as official_party,
  o.role as official_role,
  o.photo_url,
  o.district_id,
  v.bill_id,
  b.title as bill_title,
  b.agree_direction,
  v.vote,
  v.voted_at,
  coalesce(s.n, 0) as sample_n,
  case when s.n >= 1 then round(s.avg_value, 2) end as district_avg,
  case when s.n >= 5 and v.vote in ('yea', 'nay') then
    case when b.agree_direction::text = v.vote::text then 5 else 1 end
  end as official_position,
  case when s.n >= 5 and v.vote in ('yea', 'nay') then
    round(abs(s.avg_value - case when b.agree_direction::text = v.vote::text then 5 else 1 end), 2)
  end as gap,
  case
    when coalesce(s.n, 0) < 5 or v.vote not in ('yea', 'nay') then 'not_scored'
    when s.avg_value = 3 then 'district_neutral'
    when (s.avg_value > 3) = (b.agree_direction::text = v.vote::text) then 'aligned'
    when s.avg_value > 3 then 'against_district_support'
    else 'with_what_district_opposes'
  end as alignment
from public.official_votes v
join public.officials o on o.id = v.official_id
join public.bills b on b.id = v.bill_id
left join s on s.item_id = v.bill_id
  and s.district_id = public.insights_root_district(o.district_id)
where public.insights_entitled_district(o.district_id);

revoke all on public.insights_item_sentiment from public, anon;
revoke all on public.insights_item_party from public, anon;
revoke all on public.insights_item_trend from public, anon;
revoke all on public.insights_official_alignment_live from public, anon;
grant select on public.insights_item_sentiment to authenticated;
grant select on public.insights_item_party to authenticated;
grant select on public.insights_item_trend to authenticated;
grant select on public.insights_official_alignment_live to authenticated;

-- Alert engine: compares each active rule's current mean against the mean as
-- of window_days ago and fires at most one event per rule per day.
create or replace function public.insights_evaluate_alert_rules()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  cur_mean numeric;
  cur_n integer;
  past_mean numeric;
  fired integer := 0;
begin
  for r in select * from item_alert_rules where active loop
    select round(avg(value), 2), count(*)
      into cur_mean, cur_n
      from weigh_ins w
      where w.kind = r.kind and w.item_id = r.item_id
        and insights_root_district(w.district_id) = insights_root_district(r.district_id);

    select round(avg(value), 2)
      into past_mean
      from weigh_ins w
      where w.kind = r.kind and w.item_id = r.item_id
        and insights_root_district(w.district_id) = insights_root_district(r.district_id)
        and w.rated_at <= now() - make_interval(days => r.window_days);

    if cur_mean is not null and past_mean is not null
       and abs(cur_mean - past_mean) >= r.threshold
       and not exists (
         select 1 from item_alert_events e
         where e.rule_id = r.id and e.fired_at::date = current_date
       )
    then
      insert into item_alert_events
        (rule_id, org_id, kind, item_id, district_id, old_mean, new_mean, delta, sample_n)
      values
        (r.id, r.org_id, r.kind, r.item_id, r.district_id,
         past_mean, cur_mean, round(cur_mean - past_mean, 2), cur_n);
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;

revoke execute on function public.insights_evaluate_alert_rules() from public, anon, authenticated;

select cron.schedule(
  'insights-alert-eval',
  '0 6 * * *',
  'select public.insights_evaluate_alert_rules()'
);
