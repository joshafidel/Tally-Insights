-- Tally Insights migration 0007: premium dimensions and party filtering
-- Adds paid feature gating for finer grained cuts: exact age (by year) and
-- exact district (council sub districts un-rolled). Feature gates control
-- which dimensions an org can see, never the numbers themselves.
-- Additive only.

-- Birth year lands on profiles so the consumer app can populate it at ID
-- verification. Nullable, nothing existing changes.
alter table public.profiles add column if not exists birth_year integer;

create table public.org_features (
  org_id uuid not null references public.organizations(id) on delete cascade,
  feature text not null check (feature in ('age_exact', 'district_exact')),
  created_at timestamptz not null default now(),
  primary key (org_id, feature)
);
comment on table public.org_features is 'Paid dimension unlocks per org. Managed by Tally staff via service role.';

alter table public.org_features enable row level security;
revoke all on public.org_features from anon;
create policy "members read own features"
  on public.org_features for select to authenticated
  using (org_id in (select public.insights_user_orgs()));

create or replace function public.insights_has_feature(p_feature text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from org_features f
    join org_members m on m.org_id = f.org_id
    where m.user_id = auth.uid() and f.feature = p_feature
  );
$$;
revoke execute on function public.insights_has_feature(text) from public, anon;
grant execute on function public.insights_has_feature(text) to authenticated;

-- Party view gains the full 1 to 5 distribution (appended column keeps
-- create or replace valid).
create or replace view public.insights_item_party as
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  coalesce(p.party, 'U') as party,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample,
  array[
    (count(*) filter (where w.value = 1))::int,
    (count(*) filter (where w.value = 2))::int,
    (count(*) filter (where w.value = 3))::int,
    (count(*) filter (where w.value = 4))::int,
    (count(*) filter (where w.value = 5))::int
  ] as distribution
from public.weigh_ins w
left join public.profiles p on p.id = w.user_id
where public.insights_entitled_district(w.district_id)
group by w.kind, w.item_id, public.insights_root_district(w.district_id), coalesce(p.party, 'U');

-- Exact age by year. Requires the age_exact feature. Ages come from
-- profiles.birth_year, which the consumer app fills at verification.
create view public.insights_item_age_year as
select
  w.kind,
  w.item_id,
  public.insights_root_district(w.district_id) as district_id,
  (extract(year from current_date)::int - p.birth_year) as age_years,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample
from public.weigh_ins w
join public.profiles p on p.id = w.user_id and p.birth_year is not null
where public.insights_entitled_district(w.district_id)
  and public.insights_has_feature('age_exact')
group by w.kind, w.item_id, public.insights_root_district(w.district_id),
  (extract(year from current_date)::int - p.birth_year);

-- Exact district: no roll up, council sub districts stand alone.
-- Requires the district_exact feature.
create view public.insights_item_district_exact as
select
  w.kind,
  w.item_id,
  w.district_id,
  public.insights_root_district(w.district_id) as root_district,
  count(*)::int as n,
  round(avg(w.value), 2) as avg_value,
  (count(*) < 50) as low_sample
from public.weigh_ins w
where public.insights_entitled_district(w.district_id)
  and public.insights_has_feature('district_exact')
group by w.kind, w.item_id, w.district_id;

revoke all on public.insights_item_age_year from public, anon;
revoke all on public.insights_item_district_exact from public, anon;
grant select on public.insights_item_age_year to authenticated;
grant select on public.insights_item_district_exact to authenticated;
