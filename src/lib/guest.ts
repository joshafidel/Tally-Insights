/*
  Public guest access. Visitors without a session are silently signed in as
  this shared read-only viewer seat, so the site opens with no login screen.
  The credentials are intentionally public: the account is a viewer with no
  write permissions, and everything it can see is enforced by RLS exactly
  like any other seat. Team members sign in with their own accounts for
  write access.
*/
export const GUEST_EMAIL = "insights-guest@tallycivic.com";
export const GUEST_PASSWORD = "tally-insights-guest-2026";

export function isGuestEmail(email: string | undefined | null): boolean {
  return (email ?? "").toLowerCase() === GUEST_EMAIL;
}
