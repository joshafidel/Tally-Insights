-- Reseed weigh ins with per pair sampling (hash based, so the planner
-- cannot collapse it to per item) and minimum rates so every catalog item
-- carries responses. Demo project only, guarded by the marker table.
do $$
begin
  if not exists (select 1 from public.simulated_environment) then
    raise exception 'refusing to seed: not a simulated environment';
  end if;
end $$;

delete from public.item_alert_events;
delete from public.weigh_ins;

with params as (
  select 'topic' as kind, id as item_id,
         0.10 + random() * 0.18 as rate,
         random() * 2 - 1 as party_split,
         2.2 + random() * 1.6 as base_mean
  from public.topics
  union all
  select 'bill', id, 0.06 + random() * 0.30, random() * 2 - 1, 2.2 + random() * 1.6
  from public.bills
  union all
  select 'live_bill', id, 0.02 + random() * 0.06, random() * 2 - 1, 2.2 + random() * 1.6
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
join params pr
  on (abs(hashtext(p.id::text || pr.kind || pr.item_id)) % 100000) / 100000.0 < pr.rate
where p.name like 'Simulated Constituent %'
on conflict do nothing;

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

select public.insights_evaluate_alert_rules() as alerts_fired;
select count(*) as total, count(distinct (kind, item_id)) as distinct_items from public.weigh_ins;
