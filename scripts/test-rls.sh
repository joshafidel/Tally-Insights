#!/usr/bin/env bash
# RLS test suite for Tally Insights.
# Verifies that raw sentiment rows are unreachable, that insights views are
# invisible to the anon key, and that entitlements gate every aggregate.
# Requires .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY) and the QA users created during checkpoint B.
set -u
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
U="$NEXT_PUBLIC_SUPABASE_URL"
ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"

PASS=0; FAIL=0

login() {
  curl -sS -X POST "$U/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))"
}

# get TOKEN PATH: curl a REST path, print "HTTPCODE ROWCOUNT_OR_ERRCODE"
get() {
  local token="$1" path="$2"
  local out code body
  out=$(curl -sS -w $'\n%{http_code}' "$U/rest/v1/$path" -H "apikey: $ANON" ${token:+-H "Authorization: Bearer $token"})
  code=$(echo "$out" | tail -1)
  body=$(echo "$out" | sed '$d')
  local n
  n=$(echo "$body" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(len(d) if isinstance(d, list) else d.get('code', 'obj'))
except Exception:
    print('parse')
" 2>/dev/null)
  echo "$code $n"
}

check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); echo "PASS: $name ($got)"
  else FAIL=$((FAIL+1)); echo "FAIL: $name (got: $got, want: $want)"; fi
}

# rowcount comparators for cases where exact counts may drift with data
check_rows_gt0() {
  local name="$1" got="$2"
  local code n; code=${got% *}; n=${got#* }
  if [ "$code" = "200" ] && [ "$n" -gt 0 ] 2>/dev/null; then PASS=$((PASS+1)); echo "PASS: $name ($got)"
  else FAIL=$((FAIL+1)); echo "FAIL: $name (got: $got, want: 200 with rows)"; fi
}

OWNER=$(login insights-qa-owner@tallycivic.com 'Qa-Owner-Testing-2026!')
VIEWER=$(login insights-qa-viewer@tallycivic.com 'Qa-Viewer-Testing-2026!')
OUTSIDER=$(login insights-qa-outsider@tallycivic.com 'Qa-Outsider-Testing-2026!')
[ -n "$OWNER" ] && [ -n "$VIEWER" ] && [ -n "$OUTSIDER" ] || { echo "login failed"; exit 1; }

echo "== anon key alone =="
check "anon cannot read raw sentiment_ratings"      "$(get '' 'sentiment_ratings?select=id&limit=5')" "200 0"
check "anon denied on insights_bill_sentiment"      "$(get '' 'insights_bill_sentiment?select=*&limit=1')" "401 42501"
check "anon denied on insights_official_alignment"  "$(get '' 'insights_official_alignment?select=*&limit=1')" "401 42501"
check "anon denied on national view"                "$(get '' 'insights_bill_sentiment_national?select=*&limit=1')" "401 42501"
check "anon cannot read organizations"              "$(get '' 'organizations?select=*')" "401 42501"

echo "== entitled member (owner role) =="
check "member still cannot read raw rows"           "$(get "$OWNER" 'sentiment_ratings?select=id&limit=5')" "200 0"
check_rows_gt0 "member reads district aggregates"   "$(get "$OWNER" 'insights_bill_sentiment?select=*&district_id=eq.nyc&limit=100')"
check_rows_gt0 "member reads party breakdown"       "$(get "$OWNER" 'insights_bill_sentiment_by_party?select=*&limit=100')"
check_rows_gt0 "member reads trend"                 "$(get "$OWNER" 'insights_bill_trend?select=*&limit=100')"
check_rows_gt0 "member reads alignment"             "$(get "$OWNER" 'insights_official_alignment?select=*&limit=100')"
check_rows_gt0 "member reads national rollup"       "$(get "$OWNER" 'insights_bill_sentiment_national?select=*&limit=100')"
check "member sees only entitled districts"         "$(get "$OWNER" 'insights_bill_sentiment?select=*&district_id=neq.nyc')" "200 0"
check_rows_gt0 "member reads own org"               "$(get "$OWNER" 'organizations?select=*')"
check_rows_gt0 "member reads own roster"            "$(get "$OWNER" 'org_members?select=*')"

echo "== signed in user with no org =="
check "outsider sees no district aggregates"        "$(get "$OUTSIDER" 'insights_bill_sentiment?select=*&limit=5')" "200 0"
check "outsider sees no national rollup"            "$(get "$OUTSIDER" 'insights_bill_sentiment_national?select=*&limit=5')" "200 0"
check "outsider sees no alignment"                  "$(get "$OUTSIDER" 'insights_official_alignment?select=*&limit=5')" "200 0"
check "outsider sees no orgs"                       "$(get "$OUTSIDER" 'organizations?select=*')" "200 0"

echo "== write permissions =="
ins() {
  local token="$1" body="$2"
  curl -sS -o /dev/null -w "%{http_code}" -X POST "$U/rest/v1/tracked_bills" \
    -H "apikey: $ANON" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body"
}
ORG_ID=$(curl -sS "$U/rest/v1/org_members?select=org_id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $OWNER" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['org_id'])")
BILL_ID=$(curl -sS "$U/rest/v1/bills?select=id&limit=1" -H "apikey: $ANON" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
check "viewer cannot add to watchlist"   "$(ins "$VIEWER" "{\"org_id\":\"$ORG_ID\",\"bill_id\":\"$BILL_ID\",\"district_id\":\"nyc\"}")" "403"
check "owner adds entitled district"     "$(ins "$OWNER"  "{\"org_id\":\"$ORG_ID\",\"bill_id\":\"$BILL_ID\",\"district_id\":\"nyc\"}")" "201"
check "owner denied non entitled add"    "$(ins "$OWNER"  "{\"org_id\":\"$ORG_ID\",\"bill_id\":\"$BILL_ID\",\"district_id\":\"us\"}")" "403"
# clean up the row created by the positive test
curl -sS -o /dev/null -X DELETE "$U/rest/v1/tracked_bills?org_id=eq.$ORG_ID&bill_id=eq.$BILL_ID&district_id=eq.nyc" -H "apikey: $ANON" -H "Authorization: Bearer $OWNER"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
