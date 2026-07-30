-- Simulated dataset for the DEMO project only.
-- Guard: this script aborts unless the simulated_environment marker table
-- exists, which is created only here and never in production. Every
-- simulated profile is named Simulated Constituent so nothing can be
-- mistaken for a real person.

create table if not exists public.simulated_environment (ok boolean primary key default true);
insert into public.simulated_environment values (true) on conflict do nothing;

do $$
begin
  if not exists (select 1 from public.simulated_environment) then
    raise exception 'refusing to seed: not a simulated environment';
  end if;
end $$;

-- 3000 simulated verified constituents with full demographics
insert into public.profiles (id, name, party, birth_year, sex, race, id_on_file, state, created_at)
select
  gen_random_uuid(),
  'Simulated Constituent ' || i,
  case when r1 < 0.42 then 'D' when r1 < 0.68 then 'R' when r1 < 0.88 then 'I' else null end,
  1943 + floor(random() * 64)::int,
  case when r2 < 0.49 then 'f' when r2 < 0.97 then 'm' when r2 < 0.985 then 'x' else null end,
  case when r3 < 0.38 then 'White' when r3 < 0.60 then 'Hispanic' when r3 < 0.80 then 'Black'
       when r3 < 0.92 then 'Asian' when r3 < 0.97 then 'Other' else null end,
  true,
  'NY',
  now() - make_interval(secs => random() * 200 * 86400)
from (select i, random() r1, random() r2, random() r3 from generate_series(1, 3000) i) s;

-- Weigh ins: every topic, curated bill, and federal bill gets a response
-- rate, a base sentiment, and a party polarization factor. Ratings spread
-- over 120 days across the city, its council districts, and the national
-- district.
with params as (
  select 'topic' as kind, id as item_id,
         0.08 + random() * 0.20 as rate,
         random() * 2 - 1 as party_split,
         2.2 + random() * 1.6 as base_mean
  from public.topics
  union all
  select 'bill', id, 0.05 + random() * 0.40, random() * 2 - 1, 2.2 + random() * 1.6
  from public.bills
  union all
  select 'live_bill', id, 0.005 + random() * 0.05, random() * 2 - 1, 2.2 + random() * 1.6
  from public.live_bills
)
insert into public.weigh_ins (user_id, kind, item_id, value, district_id, rated_at)
select
  p.id,
  pr.kind,
  pr.item_id,
  least(5, greatest(1, round(
    pr.base_mean
    + case p.party
        when 'D' then pr.party_split * 1.3
        when 'R' then -pr.party_split * 1.3
        when 'I' then pr.party_split * 0.2
        else 0 end
    + (random() * 2.4 - 1.2)
  )))::int,
  case
    when random() < 0.40 then 'nyc'
    when random() < 0.70 then 'nyc-cc-' || (1 + floor(random() * 10))::int
    else 'us'
  end,
  now() - make_interval(secs => random() * 120 * 86400)
from public.profiles p
join params pr on random() < pr.rate
where p.name like 'Simulated Constituent %'
on conflict do nothing;

-- Inject movement so movers, trends, and alerts have a story:
-- the two most rated topics slide down over the last 12 days, and the most
-- rated curated bill surges up.
with hot_topics as (
  select item_id from public.weigh_ins where kind = 'topic'
  group by item_id order by count(*) desc limit 2
)
update public.weigh_ins w
set value = greatest(1, w.value - 2)
where w.kind = 'topic'
  and w.item_id in (select item_id from hot_topics)
  and w.rated_at > now() - interval '12 days'
  and random() < 0.8;

with hot_bill as (
  select item_id from public.weigh_ins where kind = 'bill'
  group by item_id order by count(*) desc limit 1
)
update public.weigh_ins w
set value = least(5, w.value + 2)
where w.kind = 'bill'
  and w.item_id in (select item_id from hot_bill)
  and w.rated_at > now() - interval '10 days'
  and random() < 0.8;
