-- Demo only: every state gets at least 220 simulated voters so small
-- states carry meaningful sample sizes. New voters follow each state's
-- partisan lean, live in a real county sampled by population, and rate a
-- wide slice of the catalog with values drawn from the item's existing
-- state and party distribution. Guarded by the marker table.
do $$ begin
  if to_regclass('public.simulated_environment') is null then
    raise exception 'refusing: not the simulated environment';
  end if;
end $$;

create temporary table sf (abbr text, dem numeric);
insert into sf values
 ('CA',0.60),('TX',0.43),('FL',0.44),('NY',0.57),('PA',0.49),('IL',0.56),
 ('OH',0.45),('GA',0.49),('NC',0.48),('MI',0.49),('NJ',0.53),('VA',0.53),
 ('WA',0.59),('AZ',0.48),('MA',0.62),('TN',0.38),('IN',0.40),('MO',0.41),
 ('MD',0.63),('WI',0.49),('CO',0.55),('MN',0.52),('SC',0.42),('AL',0.36),
 ('LA',0.40),('KY',0.35),('OR',0.57),('OK',0.33),('CT',0.56),('UT',0.38),
 ('IA',0.44),('NV',0.48),('AR',0.34),('MS',0.39),('KS',0.41),('NM',0.53),
 ('NE',0.39),('ID',0.31),('WV',0.29),('HI',0.62),('NH',0.52),('ME',0.53),
 ('MT',0.40),('RI',0.58),('DE',0.56),('SD',0.35),('ND',0.32),('AK',0.43),
 ('VT',0.64),('WY',0.28),('DC',0.90);

-- Top up each state to 220 voters, tagged via place for the second step
with have as (
  select state, count(*) as cnt from public.profiles
  where state is not null group by state
),
need as (
  select s.abbr, s.dem, greatest(0, 220 - coalesce(h.cnt, 0))::int as missing
  from sf s left join have h on h.state = s.abbr
)
insert into public.profiles (id, name, party, birth_year, sex, race, id_on_file, state, place, created_at)
select
  gen_random_uuid(),
  'Simulated Voter ' || n.abbr || '-x' || g.i,
  case
    when r1 < n.dem * 0.86 then 'D'
    when r1 < n.dem * 0.86 + (1 - n.dem) * 0.86 then 'R'
    when r1 < 0.95 then 'I'
    else null end,
  1943 + floor(r2 * 64)::int,
  case when r3 < 0.49 then 'f' when r3 < 0.97 then 'm' when r3 < 0.985 then 'x' else null end,
  case when r4 < 0.38 then 'White' when r4 < 0.60 then 'Hispanic' when r4 < 0.80 then 'Black'
       when r4 < 0.92 then 'Asian' when r4 < 0.97 then 'Other' else null end,
  true,
  n.abbr,
  'sim-topup',
  now() - make_interval(secs => r5 * 300 * 86400)
from need n
cross join lateral (
  select i, random() r1, random() r2, random() r3, random() r4, random() r5
  from generate_series(1, n.missing) i
) g
where n.missing > 0;

-- Their responses: county assigned by population, values match the item's
-- existing state and party distribution, timestamps follow a personal
-- activity window so monthly active shares stay believable.
with newbies as (
  select p.id, p.state, p.party,
         now() - make_interval(secs => power(random(), 2) * 240 * 86400) as last_active
  from public.profiles p
  where p.place = 'sim-topup'
),
county as (
  select state, slug,
    sum(pop) over (partition by state order by slug rows between unbounded preceding and 1 preceding) as lo,
    sum(pop) over (partition by state order by slug) as hi,
    sum(pop) over (partition by state) as total
  from public.demo_counties
),
homed as (
  select n.*, lower(n.state) || '-co-' || c.slug as home
  from newbies n
  join county c on c.state = n.state
   and (abs(hashtext(n.id::text))::bigint % c.total) >= coalesce(c.lo, 0)
   and (abs(hashtext(n.id::text))::bigint % c.total) < c.hi
),
items as (
  select 'topic'::text as kind, t.id, t.title, null::text as st, 0.45 as p from public.topics t
  union all
  select 'bill', b.id, b.title, lower(d.st), 0.60
  from public.demo_state_bills d join public.bills b on b.id = d.id
  union all
  select 'live_bill', lb.id, lb.title, null, 0.15 from public.live_bills lb
),
dist as (
  select w.kind, w.item_id,
         public.insights_root_district(w.district_id) as root,
         coalesce(pr.party, 'U') as party,
         count(*) filter (where w.value = 1)::int as c1,
         count(*) filter (where w.value = 2)::int as c2,
         count(*) filter (where w.value = 3)::int as c3,
         count(*) filter (where w.value = 4)::int as c4,
         count(*)::int as total
  from public.weigh_ins w
  left join public.profiles pr on pr.id = w.user_id
  group by 1, 2, 3, 4
)
insert into public.weigh_ins (user_id, kind, item_id, value, title, district_id, rated_at)
select
  h.id, i.kind, i.id,
  case
    when d.total is null or d.total = 0 then
      case
        when abs(hashtext(h.id::text || i.id || 'v')) % 100 < 10 then 1
        when abs(hashtext(h.id::text || i.id || 'v')) % 100 < 30 then 2
        when abs(hashtext(h.id::text || i.id || 'v')) % 100 < 65 then 3
        when abs(hashtext(h.id::text || i.id || 'v')) % 100 < 90 then 4
        else 5
      end
    else
      case
        when abs(hashtext(h.id::text || i.id || 'v')) % d.total < d.c1 then 1
        when abs(hashtext(h.id::text || i.id || 'v')) % d.total < d.c1 + d.c2 then 2
        when abs(hashtext(h.id::text || i.id || 'v')) % d.total < d.c1 + d.c2 + d.c3 then 3
        when abs(hashtext(h.id::text || i.id || 'v')) % d.total < d.c1 + d.c2 + d.c3 + d.c4 then 4
        else 5
      end
  end,
  i.title, h.home,
  h.last_active - make_interval(secs =>
    ((abs(hashtext(h.id::text || i.id || 't')) % 1000) / 1000.0) * 120 * 86400)
from homed h
join items i on (i.st is null or i.st = lower(h.state))
left join dist d
  on d.kind = i.kind and d.item_id = i.id and d.root = lower(h.state)
 and d.party = coalesce(h.party, 'U')
where (abs(hashtext(h.id::text || i.kind || i.id || 'floor')) % 1000) / 1000.0 < i.p
on conflict do nothing;
