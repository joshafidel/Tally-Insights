-- Each customer org names its home district; the dashboard scopes to it.
-- A New York senate office sets 'ny' and gets the statewide rundown.
alter table public.organizations
  add column if not exists primary_district_id text;

update public.organizations
  set primary_district_id = 'nyc'
  where primary_district_id is null;
