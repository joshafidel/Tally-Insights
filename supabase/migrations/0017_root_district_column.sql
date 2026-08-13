-- Root district becomes a stored generated column with indexes, and
-- every view and function that called insights_root_district per row now
-- reads the column. Fixes statement timeouts at 1.2M responses.
alter table public.weigh_ins
  add column if not exists root_district text
  generated always as (split_part(district_id, '-', 1)) stored;

create index if not exists weigh_ins_root_kind_item_idx
  on public.weigh_ins (root_district, kind, item_id);
create index if not exists weigh_ins_root_rated_idx
  on public.weigh_ins (root_district, rated_at);
analyze public.weigh_ins;

create or replace view public.insights_available_districts as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT district_id,
    root_district AS root_district,
    count(*)::integer AS n
   FROM weigh_ins w
  WHERE (district_id IN ( SELECT ent.district_id
           FROM ent)) OR (root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY district_id, root_district;

create or replace view public.insights_daily_volume as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT root_district AS district_id,
    rated_at::date AS day,
    count(*)::integer AS responses
   FROM weigh_ins w
  WHERE (district_id IN ( SELECT ent.district_id
           FROM ent)) OR (root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY (root_district), (rated_at::date);

create or replace view public.insights_item_age_bracket as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT w.kind,
    w.item_id,
    w.root_district AS district_id,
        CASE
            WHEN p.birth_year IS NULL THEN 'unknown'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 30 THEN '18-29'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 45 THEN '30-44'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 65 THEN '45-64'::text
            ELSE '65+'::text
        END AS age_bucket,
    count(*)::integer AS n,
    round(avg(w.value), 2) AS avg_value,
    count(*) < 50 AS low_sample,
    ARRAY[count(*) FILTER (WHERE w.value = 1)::integer, count(*) FILTER (WHERE w.value = 2)::integer, count(*) FILTER (WHERE w.value = 3)::integer, count(*) FILTER (WHERE w.value = 4)::integer, count(*) FILTER (WHERE w.value = 5)::integer] AS distribution
   FROM weigh_ins w
     LEFT JOIN profiles p ON p.id = w.user_id
  WHERE (w.district_id IN ( SELECT ent.district_id
           FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY w.kind, w.item_id, (w.root_district), (
        CASE
            WHEN p.birth_year IS NULL THEN 'unknown'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 30 THEN '18-29'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 45 THEN '30-44'::text
            WHEN (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year) < 65 THEN '45-64'::text
            ELSE '65+'::text
        END);

create or replace view public.insights_item_age_year as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT w.kind,
    w.item_id,
    w.root_district AS district_id,
    EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year AS age_years,
    count(*)::integer AS n,
    round(avg(w.value), 2) AS avg_value,
    count(*) < 50 AS low_sample
   FROM weigh_ins w
     JOIN profiles p ON p.id = w.user_id AND p.birth_year IS NOT NULL
  WHERE ((w.district_id IN ( SELECT ent.district_id
           FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
           FROM ent))) AND insights_has_feature('age_exact'::text)
  GROUP BY w.kind, w.item_id, (w.root_district), (EXTRACT(year FROM CURRENT_DATE)::integer - p.birth_year);

create or replace view public.insights_item_district_exact as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT kind,
    item_id,
    district_id,
    root_district AS root_district,
    count(*)::integer AS n,
    round(avg(value), 2) AS avg_value,
    count(*) < 50 AS low_sample
   FROM weigh_ins w
  WHERE ((district_id IN ( SELECT ent.district_id
           FROM ent)) OR (root_district IN ( SELECT ent.district_id
           FROM ent))) AND insights_has_feature('district_exact'::text)
  GROUP BY kind, item_id, district_id, root_district;

create or replace view public.insights_item_movement as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT kind,
    item_id,
    root_district AS district_id,
    count(*)::integer AS n,
    round(avg(value), 2) AS avg_now,
    round(avg(value) FILTER (WHERE rated_at <= (now() - '7 days'::interval)), 2) AS avg_7d_ago,
    round(avg(value) FILTER (WHERE rated_at <= (now() - '30 days'::interval)), 2) AS avg_30d_ago
   FROM weigh_ins w
  WHERE (district_id IN ( SELECT ent.district_id
           FROM ent)) OR (root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY kind, item_id, (root_district);

create or replace view public.insights_item_party as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT w.kind,
    w.item_id,
    w.root_district AS district_id,
    COALESCE(p.party, 'U'::text) AS party,
    count(*)::integer AS n,
    round(avg(w.value), 2) AS avg_value,
    count(*) < 50 AS low_sample,
    ARRAY[count(*) FILTER (WHERE w.value = 1)::integer, count(*) FILTER (WHERE w.value = 2)::integer, count(*) FILTER (WHERE w.value = 3)::integer, count(*) FILTER (WHERE w.value = 4)::integer, count(*) FILTER (WHERE w.value = 5)::integer] AS distribution
   FROM weigh_ins w
     LEFT JOIN profiles p ON p.id = w.user_id
  WHERE (w.district_id IN ( SELECT ent.district_id
           FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY w.kind, w.item_id, (w.root_district), (COALESCE(p.party, 'U'::text));

create or replace view public.insights_item_race as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT w.kind,
    w.item_id,
    w.root_district AS district_id,
    COALESCE(p.race, 'unknown'::text) AS race,
    count(*)::integer AS n,
    round(avg(w.value), 2) AS avg_value,
    count(*) < 50 AS low_sample,
    ARRAY[count(*) FILTER (WHERE w.value = 1)::integer, count(*) FILTER (WHERE w.value = 2)::integer, count(*) FILTER (WHERE w.value = 3)::integer, count(*) FILTER (WHERE w.value = 4)::integer, count(*) FILTER (WHERE w.value = 5)::integer] AS distribution
   FROM weigh_ins w
     LEFT JOIN profiles p ON p.id = w.user_id
  WHERE (w.district_id IN ( SELECT ent.district_id
           FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY w.kind, w.item_id, (w.root_district), (COALESCE(p.race, 'unknown'::text));

create or replace view public.insights_item_sentiment as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT kind,
    item_id,
    root_district AS district_id,
    count(*)::integer AS n,
    round(avg(value), 2) AS avg_value,
    ARRAY[count(*) FILTER (WHERE value = 1)::integer, count(*) FILTER (WHERE value = 2)::integer, count(*) FILTER (WHERE value = 3)::integer, count(*) FILTER (WHERE value = 4)::integer, count(*) FILTER (WHERE value = 5)::integer] AS distribution,
    count(*) < 50 AS low_sample,
    max(title) AS title
   FROM weigh_ins w
  WHERE (district_id IN ( SELECT ent.district_id
           FROM ent)) OR (root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY kind, item_id, (root_district);

create or replace view public.insights_item_sex as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        )
 SELECT w.kind,
    w.item_id,
    w.root_district AS district_id,
    COALESCE(p.sex, 'unknown'::text) AS sex,
    count(*)::integer AS n,
    round(avg(w.value), 2) AS avg_value,
    count(*) < 50 AS low_sample,
    ARRAY[count(*) FILTER (WHERE w.value = 1)::integer, count(*) FILTER (WHERE w.value = 2)::integer, count(*) FILTER (WHERE w.value = 3)::integer, count(*) FILTER (WHERE w.value = 4)::integer, count(*) FILTER (WHERE w.value = 5)::integer] AS distribution
   FROM weigh_ins w
     LEFT JOIN profiles p ON p.id = w.user_id
  WHERE (w.district_id IN ( SELECT ent.district_id
           FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
           FROM ent))
  GROUP BY w.kind, w.item_id, (w.root_district), (COALESCE(p.sex, 'unknown'::text));

create or replace view public.insights_item_trend as
 WITH ent AS (
         SELECT e.district_id
           FROM org_entitlements e
             JOIN org_members m ON m.org_id = e.org_id
          WHERE m.user_id = auth.uid()
        ), daily AS (
         SELECT w.kind,
            w.item_id,
            w.root_district AS district_id,
            w.rated_at::date AS day,
            count(*) AS day_n,
            sum(w.value) AS day_sum
           FROM weigh_ins w
          WHERE (w.district_id IN ( SELECT ent.district_id
                   FROM ent)) OR (w.root_district IN ( SELECT ent.district_id
                   FROM ent))
          GROUP BY w.kind, w.item_id, (w.root_district), (w.rated_at::date)
        )
 SELECT kind,
    item_id,
    district_id,
    day,
    sum(day_n) OVER w::integer AS n,
    round(sum(day_sum) OVER w / sum(day_n) OVER w, 2) AS avg_value
   FROM daily
  WINDOW w AS (PARTITION BY kind, item_id, district_id ORDER BY day);

create or replace view public.insights_official_alignment_live as
 WITH s AS (
         SELECT w.item_id,
            w.root_district AS district_id,
            count(*)::integer AS n,
            avg(w.value) AS avg_value
           FROM weigh_ins w
          WHERE w.kind = 'bill'::text
          GROUP BY w.item_id, (w.root_district)
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
     LEFT JOIN s ON s.item_id = v.bill_id AND s.district_id = split_part(o.district_id, '-', 1)
  WHERE insights_entitled_district(o.district_id);

CREATE OR REPLACE FUNCTION public.insights_available_districts_for_org(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ent as (
    select district_id from public.org_entitlements where org_id = p_org
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'district_id', s.district_id,
      'root_district', s.root,
      'n', s.n
    ) order by s.district_id),
    '[]'::jsonb
  )
  from (
    select
      w.district_id,
      w.root_district as root,
      count(*)::int as n
    from public.weigh_ins w
    where w.district_id in (select district_id from ent)
       or w.root_district in (select district_id from ent)
    group by 1, 2
  ) s;
$function$
;

CREATE OR REPLACE FUNCTION public.insights_filtered_item_stats(p_district text DEFAULT NULL::text, p_exact boolean DEFAULT false, p_party text[] DEFAULT NULL::text[], p_age text[] DEFAULT NULL::text[], p_sex text[] DEFAULT NULL::text[], p_race text[] DEFAULT NULL::text[])
 RETURNS TABLE(kind text, item_id text, n integer, avg_value numeric, distribution integer[], avg_7d_ago numeric, avg_30d_ago numeric, title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ent as (
    select e.district_id from org_entitlements e
    join org_members m on m.org_id = e.org_id
    where m.user_id = auth.uid()
  )
  select
    w.kind,
    w.item_id,
    count(*)::int as n,
    round(avg(w.value), 2) as avg_value,
    array[
      (count(*) filter (where w.value = 1))::int,
      (count(*) filter (where w.value = 2))::int,
      (count(*) filter (where w.value = 3))::int,
      (count(*) filter (where w.value = 4))::int,
      (count(*) filter (where w.value = 5))::int
    ] as distribution,
    round(avg(w.value) filter (where w.rated_at <= now() - interval '7 days'), 2) as avg_7d_ago,
    round(avg(w.value) filter (where w.rated_at <= now() - interval '30 days'), 2) as avg_30d_ago,
    max(w.title) as title
  from weigh_ins w
  left join profiles p on p.id = w.user_id
  where (w.district_id in (select district_id from ent)
         or w.root_district in (select district_id from ent))
    and (p_district is null or (
          case when p_exact then w.district_id = p_district
               else w.root_district = p_district end))
    and (not p_exact or insights_has_feature('district_exact'))
    and (p_party is null or coalesce(p.party, 'U') = any(p_party))
    and (p_age is null or (
          case
            when p.birth_year is null then 'unknown'
            when extract(year from current_date)::int - p.birth_year < 30 then '18-29'
            when extract(year from current_date)::int - p.birth_year < 45 then '30-44'
            when extract(year from current_date)::int - p.birth_year < 65 then '45-64'
            else '65+'
          end) = any(p_age))
    and (p_sex is null or coalesce(p.sex, 'unknown') = any(p_sex))
    and (p_race is null or coalesce(p.race, 'unknown') = any(p_race))
  group by w.kind, w.item_id
$function$
;
