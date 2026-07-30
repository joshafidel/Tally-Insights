-- Demo only: state level simulated electorate. Voter counts follow real 2020
-- census populations and party mix follows each state's approximate recent
-- partisan lean, so per state sentiment differs in a believable way. All
-- rows are clearly simulated. Guarded by the marker table.
do $$
begin
  if not exists (select 1 from public.simulated_environment) then
    raise exception 'refusing to seed: not a simulated environment';
  end if;
end $$;

create temporary table state_facts (abbr text, name text, pop numeric, dem numeric);
insert into state_facts values
 ('CA','California',39.5,0.60),('TX','Texas',29.1,0.43),('FL','Florida',21.5,0.44),
 ('NY','New York',20.2,0.57),('PA','Pennsylvania',13.0,0.49),('IL','Illinois',12.8,0.56),
 ('OH','Ohio',11.8,0.45),('GA','Georgia',10.7,0.49),('NC','North Carolina',10.4,0.48),
 ('MI','Michigan',10.1,0.49),('NJ','New Jersey',9.3,0.53),('VA','Virginia',8.6,0.53),
 ('WA','Washington',7.7,0.59),('AZ','Arizona',7.2,0.48),('MA','Massachusetts',7.0,0.62),
 ('TN','Tennessee',6.9,0.38),('IN','Indiana',6.8,0.40),('MO','Missouri',6.2,0.41),
 ('MD','Maryland',6.2,0.63),('WI','Wisconsin',5.9,0.49),('CO','Colorado',5.8,0.55),
 ('MN','Minnesota',5.7,0.52),('SC','South Carolina',5.1,0.42),('AL','Alabama',5.0,0.36),
 ('LA','Louisiana',4.7,0.40),('KY','Kentucky',4.5,0.35),('OR','Oregon',4.2,0.57),
 ('OK','Oklahoma',4.0,0.33),('CT','Connecticut',3.6,0.56),('UT','Utah',3.3,0.38),
 ('IA','Iowa',3.2,0.44),('NV','Nevada',3.1,0.48),('AR','Arkansas',3.0,0.34),
 ('MS','Mississippi',3.0,0.39),('KS','Kansas',2.9,0.41),('NM','New Mexico',2.1,0.53),
 ('NE','Nebraska',2.0,0.39),('ID','Idaho',1.8,0.31),('WV','West Virginia',1.8,0.29),
 ('HI','Hawaii',1.5,0.62),('NH','New Hampshire',1.4,0.52),('ME','Maine',1.4,0.53),
 ('MT','Montana',1.1,0.40),('RI','Rhode Island',1.1,0.58),('DE','Delaware',1.0,0.56),
 ('SD','South Dakota',0.9,0.35),('ND','North Dakota',0.8,0.32),('AK','Alaska',0.7,0.43),
 ('VT','Vermont',0.6,0.64),('WY','Wyoming',0.6,0.28),('DC','District of Columbia',0.7,0.90);

insert into public.districts (id, name, state, type)
select lower(abbr), name, abbr, 'state'::public.district_type
from state_facts
where lower(abbr) not in (select id from public.districts)
on conflict (id) do nothing;

insert into public.org_entitlements (org_id, district_id)
select '2b422643-a75c-45c5-87b0-8424dcd3230e', lower(abbr) from state_facts
on conflict do nothing;

-- 6000 simulated voters allocated by population, party by state lean
with total as (select sum(pop) t from state_facts),
alloc as (
  select sf.abbr, sf.dem, greatest(8, round(6000 * sf.pop / total.t))::int as seats
  from state_facts sf, total
)
insert into public.profiles (id, name, party, birth_year, sex, race, id_on_file, state, created_at)
select
  gen_random_uuid(),
  'Simulated Voter ' || a.abbr || '-' || g.i,
  case
    when r1 < a.dem * 0.86 then 'D'
    when r1 < a.dem * 0.86 + (1 - a.dem) * 0.86 then 'R'
    when r1 < 0.95 then 'I'
    else null end,
  1943 + floor(r2 * 64)::int,
  case when r3 < 0.49 then 'f' when r3 < 0.97 then 'm' when r3 < 0.985 then 'x' else null end,
  case when r4 < 0.38 then 'White' when r4 < 0.60 then 'Hispanic' when r4 < 0.80 then 'Black'
       when r4 < 0.92 then 'Asian' when r4 < 0.97 then 'Other' else null end,
  true,
  a.abbr,
  now() - make_interval(secs => r5 * 200 * 86400)
from alloc a
cross join lateral (
  select i, random() r1, random() r2, random() r3, random() r4, random() r5
  from generate_series(1, a.seats) i
) g;

-- Their weigh ins: same per item polarization model, district = their state
with params as (
  select 'topic' as kind, id as item_id, 0.10 + random() * 0.15 as rate,
         random() * 2 - 1 as party_split, 2.2 + random() * 1.6 as base_mean
  from public.topics
  union all
  select 'bill', id, 0.06 + random() * 0.25, random() * 2 - 1, 2.2 + random() * 1.6
  from public.bills
  union all
  select 'live_bill', id, 0.02 + random() * 0.05, random() * 2 - 1, 2.2 + random() * 1.6
  from public.live_bills
)
insert into public.weigh_ins (user_id, kind, item_id, value, district_id, rated_at)
select
  p.id, pr.kind, pr.item_id,
  least(5, greatest(1, round(
    pr.base_mean
    + case p.party
        when 'D' then pr.party_split * 1.3
        when 'R' then -pr.party_split * 1.3
        when 'I' then pr.party_split * 0.2
        else 0 end
    + (random() * 2.4 - 1.2)
  )))::int,
  lower(p.state),
  now() - make_interval(secs => random() * 120 * 86400)
from public.profiles p
join params pr
  on (abs(hashtext(p.id::text || pr.kind || pr.item_id)) % 100000) / 100000.0 < pr.rate
where p.name like 'Simulated Voter %'
on conflict do nothing;

select count(*) total_weigh_ins,
  count(distinct insights_root_district(district_id)) roots
from public.weigh_ins;
