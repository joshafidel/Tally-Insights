-- Tally Insights migration 0002: watchlist, alerts, audit log
-- Additive only. No consumer app object is dropped, renamed, or altered.

create table public.tracked_bills (
  org_id uuid not null references public.organizations(id) on delete cascade,
  bill_id text not null references public.bills(id),
  district_id text not null references public.districts(id),
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (org_id, bill_id, district_id)
);
comment on table public.tracked_bills is 'An org watchlist entry: this bill in this district.';

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bill_id text references public.bills(id),
  district_id text not null references public.districts(id),
  threshold numeric not null check (threshold > 0),
  window_days integer not null default 7 check (window_days in (7, 30)),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.alert_rules is 'Fires when mean sentiment moves by threshold within window_days. Null bill_id means every tracked bill in the district.';

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.alert_rules(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  bill_id text not null references public.bills(id),
  district_id text not null references public.districts(id),
  old_mean numeric,
  new_mean numeric,
  delta numeric,
  sample_n integer,
  fired_at timestamptz not null default now(),
  delivered_via text[] not null default '{in_app}',
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id)
);
comment on table public.alert_events is 'Alert firings. delivered_via is an array so an email sender can append its channel later.';

create table public.access_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  action text not null,
  resource text not null,
  detail jsonb,
  at timestamptz not null default now()
);
comment on table public.access_log is 'Audit trail of who viewed or exported what. Insert only from the app, readable by org owners and admins.';

-- Row level security

alter table public.tracked_bills enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.access_log enable row level security;

revoke all on public.tracked_bills from anon;
revoke all on public.alert_rules from anon;
revoke all on public.alert_events from anon;
revoke all on public.access_log from anon;

-- tracked_bills: all org members read. Owners and admins add or remove,
-- and only for districts the org is entitled to.
create policy "members read watchlist"
  on public.tracked_bills for select to authenticated
  using (org_id in (select public.insights_user_orgs()));

create policy "admins add to watchlist"
  on public.tracked_bills for insert to authenticated
  with check (
    public.insights_is_org_admin(org_id)
    and public.insights_entitled_district(district_id)
  );

create policy "admins remove from watchlist"
  on public.tracked_bills for delete to authenticated
  using (public.insights_is_org_admin(org_id));

-- alert_rules: all org members read. Owners and admins manage,
-- and only for districts the org is entitled to.
create policy "members read alert rules"
  on public.alert_rules for select to authenticated
  using (org_id in (select public.insights_user_orgs()));

create policy "admins create alert rules"
  on public.alert_rules for insert to authenticated
  with check (
    public.insights_is_org_admin(org_id)
    and public.insights_entitled_district(district_id)
  );

create policy "admins update alert rules"
  on public.alert_rules for update to authenticated
  using (public.insights_is_org_admin(org_id))
  with check (
    public.insights_is_org_admin(org_id)
    and public.insights_entitled_district(district_id)
  );

create policy "admins delete alert rules"
  on public.alert_rules for delete to authenticated
  using (public.insights_is_org_admin(org_id));

-- alert_events: members read their org events and may acknowledge them.
-- No client side insert: only the evaluation job (service role) fires alerts.
create policy "members read alert events"
  on public.alert_events for select to authenticated
  using (org_id in (select public.insights_user_orgs()));

create policy "members acknowledge alert events"
  on public.alert_events for update to authenticated
  using (org_id in (select public.insights_user_orgs()))
  with check (org_id in (select public.insights_user_orgs()));

-- access_log: any member writes their own rows. Owners and admins read.
-- No updates or deletes from clients: an audit log is append only.
create policy "members write own access log"
  on public.access_log for insert to authenticated
  with check (
    user_id = auth.uid()
    and org_id in (select public.insights_user_orgs())
  );

create policy "admins read access log"
  on public.access_log for select to authenticated
  using (public.insights_is_org_admin(org_id));
