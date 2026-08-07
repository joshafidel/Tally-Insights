-- Demo only: scale up simulated sample sizes across every state and
-- district. Each existing simulated voter rates more of the catalog; new
-- rows sample from the item's existing state and party distribution so
-- means and partisan patterns hold, land in the voter's home district,
-- and fall inside their existing activity window. Guarded by the marker
-- table. Run per batch: replace __BATCH__ with 0..3.
do $$ begin
  if to_regclass('public.simulated_environment') is null then
    raise exception 'refusing: not the simulated environment';
  end if;
end $$;

with voters as (
  select w.user_id,
         min(w.rated_at) as t0,
         max(w.rated_at) as t1,
         mode() within group (order by w.district_id) as home,
         split_part(mode() within group (order by w.district_id), '-', 1) as root
  from public.weigh_ins w
  group by w.user_id
  having abs(hashtext(w.user_id::text)) % 4 = __BATCH__
),
items as (
  select 'topic'::text as kind, t.id, t.title, null::text as st from public.topics t
  union all
  select 'bill', b.id, b.title, lower(d.st)
  from public.demo_state_bills d join public.bills b on b.id = d.id
  union all
  select 'bill', b.id, b.title, 'nyc'
  from public.bills b where b.id like 'nyc-%' or b.id like 'rb-%'
  union all
  select 'live_bill', lb.id, lb.title, null from public.live_bills lb
),
cand as (
  select v.user_id, i.kind, i.id as item_id, i.title, v.home, v.root, v.t0, v.t1,
         p.party
  from voters v
  join public.profiles p on p.id = v.user_id
  join items i on (i.st is null or i.st = v.root)
  where (abs(hashtext(v.user_id::text || i.kind || i.id || 'grow')) % 1000) / 1000.0
        < case when v.root = 'nyc' then 0.06
               when v.root = 'us' then 0.10
               else 0.33 end
    and not exists (
      select 1 from public.weigh_ins w2
      where w2.user_id = v.user_id and w2.kind = i.kind and w2.item_id = i.id
    )
),
dist as (
  select w.kind, w.item_id,
         public.insights_root_district(w.district_id) as root,
         coalesce(p.party, 'U') as party,
         count(*) filter (where w.value = 1)::int as c1,
         count(*) filter (where w.value = 2)::int as c2,
         count(*) filter (where w.value = 3)::int as c3,
         count(*) filter (where w.value = 4)::int as c4,
         count(*)::int as total
  from public.weigh_ins w
  left join public.profiles p on p.id = w.user_id
  group by 1, 2, 3, 4
)
insert into public.weigh_ins (user_id, kind, item_id, value, title, district_id, rated_at)
select
  c.user_id, c.kind, c.item_id,
  case
    when d.total is null or d.total = 0 then
      case
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % 100 < 10 then 1
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % 100 < 30 then 2
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % 100 < 65 then 3
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % 100 < 90 then 4
        else 5
      end
    else
      case
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % d.total < d.c1 then 1
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % d.total < d.c1 + d.c2 then 2
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % d.total < d.c1 + d.c2 + d.c3 then 3
        when abs(hashtext(c.user_id::text || c.item_id || 'v')) % d.total < d.c1 + d.c2 + d.c3 + d.c4 then 4
        else 5
      end
  end,
  c.title, c.home,
  c.t0 + (c.t1 - c.t0) * ((abs(hashtext(c.user_id::text || c.item_id || 't')) % 1000) / 1000.0)
from cand c
left join dist d
  on d.kind = c.kind and d.item_id = c.item_id and d.root = c.root
 and d.party = coalesce(c.party, 'U')
on conflict do nothing;
