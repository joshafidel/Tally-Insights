-- Tally Insights migration 0008: congressional member directory
-- Every current senator (100) and representative (435) already exists in the
-- live synced roll call table. This view exposes them as a directory with
-- real vote counts, readable by any org member. Additive only.

create view public.insights_member_directory as
select
  member_key,
  max(member_name) as member_name,
  max(party) as party,
  max(state) as state,
  chamber,
  count(*)::int as votes_recorded,
  max(vote_date) as last_vote_date,
  count(*) filter (where vote_cast = 'Yea')::int as yea_votes,
  count(*) filter (where vote_cast = 'Nay')::int as nay_votes
from public.official_votes_live
where member_key is not null
  and public.insights_in_any_org()
group by member_key, chamber;

revoke all on public.insights_member_directory from public, anon;
grant select on public.insights_member_directory to authenticated;

-- Recent votes for one member, for the directory detail panel.
create view public.insights_member_votes as
select
  member_key,
  chamber,
  vote_date,
  question,
  bill_label,
  bill_title,
  vote_cast,
  result
from public.official_votes_live
where member_key is not null
  and public.insights_in_any_org();

revoke all on public.insights_member_votes from public, anon;
grant select on public.insights_member_votes to authenticated;
