-- Dashboard sources move onto cron refreshed rollups: item sentiment,
-- movement, alignment sampling, party engagement, and daily volume no
-- longer aggregate raw responses per request. Applied to both projects.

create table if not exists public.insights_engagement_rollup (
  party text primary key,
  constituents integer not null,
  engaged_this_month integer not null,
  engaged_last_month integer not null,
  new_this_month integer not null
);
revoke all on public.insights_engagement_rollup from public, anon, authenticated;

create table if not exists public.insights_volume_rollup (
  district_id text not null,
  day date not null,
  responses integer not null,
  primary key (district_id, day)
);
revoke all on public.insights_volume_rollup from public, anon, authenticated;

create or replace function public.insights_refresh_rollup()
returns void
language plpgsql security definer
set search_path = public
as $fn$
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

  delete from insights_engagement_rollup;
  insert into insights_engagement_rollup
  with cur as (
    select distinct user_id from weigh_ins
    where rated_at >= date_trunc('month', now())
  ), prev as (
    select distinct user_id from weigh_ins
    where rated_at >= date_trunc('month', now()) - interval '1 month'
      and rated_at < date_trunc('month', now())
  )
  select coalesce(p.party, 'U'),
    count(*)::int,
    (count(*) filter (where p.id in (select user_id from cur)))::int,
    (count(*) filter (where p.id in (select user_id from prev)))::int,
    (count(*) filter (where p.created_at >= date_trunc('month', now())))::int
  from profiles p
  where p.id_on_file
  group by 1;

  delete from insights_volume_rollup;
  insert into insights_volume_rollup
  select w.root_district, w.rated_at::date, count(*)::int
  from weigh_ins w
  group by 1, 2;
end;
$fn$;
revoke all on function public.insights_refresh_rollup() from public, anon, authenticated;

create or replace view public.insights_item_sentiment as
with ent as (
  select e.district_id from org_entitlements e
  join org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select r.kind, r.item_id, r.district_id,
  r.n,
  round(r.sum_value::numeric / nullif(r.n, 0), 2) as avg_value,
  array[r.c1, r.c2, r.c3, r.c4, r.c5] as distribution,
  r.n < 50 as low_sample,
  r.title
from insights_rollup r
where r.scope = 'root'
  and r.district_id in (select ent.district_id from ent);

create or replace view public.insights_item_movement as
with ent as (
  select e.district_id from org_entitlements e
  join org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select r.kind, r.item_id, r.district_id,
  r.n,
  round(r.sum_value::numeric / nullif(r.n, 0), 2) as avg_now,
  round(r.sum7::numeric / nullif(r.n7, 0), 2) as avg_7d_ago,
  round(r.sum30::numeric / nullif(r.n30, 0), 2) as avg_30d_ago
from insights_rollup r
where r.scope = 'root'
  and r.district_id in (select ent.district_id from ent);

create or replace view public.insights_daily_volume as
with ent as (
  select e.district_id from org_entitlements e
  join org_members m on m.org_id = e.org_id
  where m.user_id = auth.uid()
)
select v.district_id, v.day, v.responses
from insights_volume_rollup v
where v.district_id in (select ent.district_id from ent);

create or replace view public.insights_party_engagement as
select party, constituents, engaged_this_month, engaged_last_month, new_this_month
from insights_engagement_rollup
where insights_in_any_org();

create or replace view public.insights_official_alignment_live as
 WITH s AS (
         SELECT r.item_id,
            r.district_id,
            r.n,
            r.sum_value::numeric / nullif(r.n, 0) AS avg_value
           FROM insights_rollup r
          WHERE r.scope = 'root' AND r.kind = 'bill'
        )
 SELECT o.id AS official_id,
    o.name AS official_name,
    o.party AS official_party,
    o.role AS official_role,
    o.photo_url,
    o.district_id,
    v.bill_id,
    b.title AS bill_title,
    b.agree_direction,
    v.vote,
    v.voted_at,
    COALESCE(s.n, 0) AS sample_n,
        CASE
            WHEN s.n >= 1 THEN round(s.avg_value, 2)
            ELSE NULL::numeric
        END AS district_avg,
        CASE
            WHEN s.n >= 5 AND (v.vote = ANY (ARRAY['yea'::vote_value, 'nay'::vote_value])) THEN
            CASE
                WHEN b.agree_direction::text = v.vote::text THEN 5
                ELSE 1
            END
            ELSE NULL::integer
        END AS official_position,
        CASE
            WHEN s.n >= 5 AND (v.vote = ANY (ARRAY['yea'::vote_value, 'nay'::vote_value])) THEN round(abs(s.avg_value -
            CASE
                WHEN b.agree_direction::text = v.vote::text THEN 5
                ELSE 1
            END::numeric), 2)
            ELSE NULL::numeric
        END AS gap,
        CASE
            WHEN COALESCE(s.n, 0) < 5 OR (v.vote <> ALL (ARRAY['yea'::vote_value, 'nay'::vote_value])) THEN 'not_scored'::text
            WHEN s.avg_value = 3::numeric THEN 'district_neutral'::text
            WHEN (s.avg_value > 3::numeric) = (b.agree_direction::text = v.vote::text) THEN 'aligned'::text
            WHEN s.avg_value > 3::numeric THEN 'against_district_support'::text
            ELSE 'with_what_district_opposes'::text
        END AS alignment
   FROM official_votes v
     JOIN officials o ON o.id = v.official_id
     JOIN bills b ON b.id = v.bill_id
     LEFT JOIN s ON s.item_id = v.bill_id AND s.district_id = split_part(o.district_id, '-'::text, 1)
  WHERE insights_entitled_district(o.district_id);

select public.insights_refresh_rollup();
