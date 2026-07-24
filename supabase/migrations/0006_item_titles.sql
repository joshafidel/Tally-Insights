-- Tally Insights migration 0006: carry item titles through the aggregate view
-- Some rated items (roll call votes, newly synced bills) exist only as weigh in
-- rows, whose titles the consumer app stores on the row itself. The app cannot
-- read weigh_ins directly (RLS: raters only), so the aggregate view carries a
-- representative title. Appending a column keeps create or replace valid.

create or replace view public.insights_item_sentiment as
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
  (count(*) < 50) as low_sample,
  max(w.title) as title
from public.weigh_ins w
where public.insights_entitled_district(w.district_id)
group by w.kind, w.item_id, public.insights_root_district(w.district_id);
