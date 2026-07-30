-- Demo project bootstrap: mirrors the consumer app schema that Tally
-- Insights reads, minus auth.users foreign keys (demo raters are simulated
-- and have no auth accounts). Applied ONLY to the demo project, never to
-- production. The repo migrations 0001 through 0009 run on top of this.

create extension if not exists pg_cron;

create type public.bill_status as enum ('introduced', 'in_committee', 'floor', 'passed', 'failed', 'stalled');
create type public.district_type as enum ('federal', 'state', 'local');
create type public.vote_direction as enum ('yea', 'nay');
create type public.vote_value as enum ('yea', 'nay', 'abstain', 'absent');

create table public.districts (
  id text primary key,
  name text not null,
  state text not null,
  type public.district_type not null
);

create table public.topics (
  id text primary key,
  category text not null,
  title text not null,
  prompt text not null
);

create table public.bills (
  id text primary key,
  title text not null,
  plain_summary text not null,
  analysis text,
  full_text_url text,
  sponsor text not null,
  chamber text not null,
  status public.bill_status not null,
  vote_date date,
  topic_category text,
  related_topic_id text references public.topics(id),
  agree_direction public.vote_direction not null
);

create table public.live_bills (
  id text primary key,
  level text not null default 'federal',
  label text,
  congress integer,
  bill_type text,
  bill_number integer,
  title text not null,
  short_summary text,
  status text not null default 'introduced',
  latest_action text,
  latest_action_date date,
  introduced_date date,
  origin_chamber text,
  sponsor text,
  sponsor_party text,
  policy_area text,
  topic text not null default 'other',
  source_url text,
  synced_at timestamptz not null default now(),
  gen_summary text,
  lenses jsonb,
  outcome jsonb,
  gen_at timestamptz,
  gen_title text,
  gen_detail text
);

create table public.officials (
  id text primary key,
  name text not null,
  role text not null,
  party text not null,
  photo_url text,
  level text not null,
  district_id text not null references public.districts(id)
);

create table public.official_votes (
  id bigint generated always as identity primary key,
  bill_id text not null references public.bills(id),
  official_id text not null references public.officials(id),
  vote public.vote_value not null,
  voted_at date
);

create table public.official_votes_live (
  id text primary key,
  chamber text not null,
  congress integer not null,
  session integer not null,
  roll integer not null,
  vote_date date,
  question text,
  bill_label text,
  bill_title text,
  result text,
  member_key text not null,
  member_name text,
  party text,
  state text,
  vote_cast text,
  source_url text,
  synced_at timestamptz not null default now()
);

-- Simulated raters: no auth.users linkage on purpose
create table public.profiles (
  id uuid primary key,
  name text,
  state text,
  cd text,
  council_district integer,
  place text,
  district_label text,
  local_merged boolean not null default false,
  created_at timestamptz not null default now(),
  id_last4 text,
  id_on_file boolean not null default false,
  onboarded_at timestamptz,
  district_changed_at timestamptz,
  party text
);

create table public.weigh_ins (
  user_id uuid not null,
  kind text not null,
  item_id text not null,
  value integer not null,
  title text,
  district_id text not null default 'nyc',
  rated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

-- Referenced by repo migrations 0003 and 0004; stays empty in the demo.
create table public.sentiment_ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bill_id text not null references public.bills(id),
  value integer not null,
  district_id text not null references public.districts(id),
  party text not null,
  age_bucket text not null,
  sex text not null,
  created_at timestamptz not null default now()
);

alter table public.districts enable row level security;
alter table public.topics enable row level security;
alter table public.bills enable row level security;
alter table public.live_bills enable row level security;
alter table public.officials enable row level security;
alter table public.official_votes enable row level security;
alter table public.official_votes_live enable row level security;
alter table public.profiles enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.sentiment_ratings enable row level security;

create policy "public read districts" on public.districts for select using (true);
create policy "public read topics" on public.topics for select using (true);
create policy "public read bills" on public.bills for select using (true);
create policy "public read live bills" on public.live_bills for select using (true);
create policy "public read officials" on public.officials for select using (true);
create policy "public read official votes" on public.official_votes for select using (true);
create policy "public read live votes" on public.official_votes_live for select using (true);
-- profiles, weigh_ins, sentiment_ratings: RLS on, no client policies.
-- The insights views (owner privileged) are the only read path, same as prod.
