-- Tally Insights migration 0001: organization model
-- Additive only. No consumer app object is dropped, renamed, or altered.

create type public.org_role as enum ('owner', 'admin', 'viewer');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
comment on table public.organizations is 'Paying Tally Insights accounts. Created by Tally staff via service role, never by clients.';

create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
comment on table public.org_members is 'User seats within an org. Role gates admin screens and write actions.';

create table public.org_entitlements (
  org_id uuid not null references public.organizations(id) on delete cascade,
  district_id text not null references public.districts(id),
  created_at timestamptz not null default now(),
  primary key (org_id, district_id)
);
comment on table public.org_entitlements is 'Districts an org has paid to view. Managed by Tally staff via service role.';

-- Helper functions. Security definer so RLS policies can consult membership
-- without recursive policy evaluation. Locked search_path.

create or replace function public.insights_user_orgs()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from org_members where user_id = auth.uid();
$$;

create or replace function public.insights_is_org_admin(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function public.insights_is_org_owner(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.insights_entitled_district(p_district text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from org_entitlements e
    join org_members m on m.org_id = e.org_id
    where m.user_id = auth.uid() and e.district_id = p_district
  );
$$;

create or replace function public.insights_in_any_org()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from org_members where user_id = auth.uid());
$$;

revoke execute on function public.insights_user_orgs() from public, anon;
revoke execute on function public.insights_is_org_admin(uuid) from public, anon;
revoke execute on function public.insights_is_org_owner(uuid) from public, anon;
revoke execute on function public.insights_entitled_district(text) from public, anon;
revoke execute on function public.insights_in_any_org() from public, anon;
grant execute on function public.insights_user_orgs() to authenticated;
grant execute on function public.insights_is_org_admin(uuid) to authenticated;
grant execute on function public.insights_is_org_owner(uuid) to authenticated;
grant execute on function public.insights_entitled_district(text) to authenticated;
grant execute on function public.insights_in_any_org() to authenticated;

-- Row level security

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_entitlements enable row level security;

revoke all on public.organizations from anon;
revoke all on public.org_members from anon;
revoke all on public.org_entitlements from anon;

-- organizations: members can see their own org. Owners can rename it.
-- No client side insert or delete: accounts are provisioned by Tally staff.
create policy "members read own org"
  on public.organizations for select to authenticated
  using (id in (select public.insights_user_orgs()));

create policy "owners rename org"
  on public.organizations for update to authenticated
  using (public.insights_is_org_owner(id))
  with check (public.insights_is_org_owner(id));

-- org_members: members see the roster of their own org.
-- Owners and admins manage seats, with two guards:
-- only an owner may grant or modify the owner role, and admins cannot touch owner rows.
create policy "members read own roster"
  on public.org_members for select to authenticated
  using (org_id in (select public.insights_user_orgs()));

create policy "admins add seats"
  on public.org_members for insert to authenticated
  with check (
    public.insights_is_org_admin(org_id)
    and (role <> 'owner' or public.insights_is_org_owner(org_id))
  );

create policy "admins change seats"
  on public.org_members for update to authenticated
  using (
    public.insights_is_org_admin(org_id)
    and (role <> 'owner' or public.insights_is_org_owner(org_id))
  )
  with check (
    public.insights_is_org_admin(org_id)
    and (role <> 'owner' or public.insights_is_org_owner(org_id))
  );

create policy "admins remove seats"
  on public.org_members for delete to authenticated
  using (
    public.insights_is_org_admin(org_id)
    and (role <> 'owner' or public.insights_is_org_owner(org_id))
  );

-- org_entitlements: members can read what their org is entitled to.
-- No client side writes: entitlements are sold, not self served.
create policy "members read own entitlements"
  on public.org_entitlements for select to authenticated
  using (org_id in (select public.insights_user_orgs()));
