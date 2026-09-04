#!/bin/sh
# Registers the dev website in Umami under a fixed id so ANALYTICS_WEBSITE_ID in .env.example works
# without visiting the UI. Uses the default admin credentials; change them and this one-shot fails
# harmlessly (the rest of the stack keeps running).
set -eu
: "${UMAMI_URL:?}" "${WEBSITE_ID:?}"

token=$(curl -fsS -X POST "$UMAMI_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"umami"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$token" ] || { echo "umami: login failed (default credentials changed?)"; exit 1; }

existing=$(curl -fsS "$UMAMI_URL/api/websites/$WEBSITE_ID" -H "authorization: Bearer $token")
case "$existing" in
  *"\"id\":\"$WEBSITE_ID\""*)
    echo "umami: website $WEBSITE_ID already exists"
    exit 0
    ;;
esac

curl -fsS -X POST "$UMAMI_URL/api/websites" \
  -H 'content-type: application/json' -H "authorization: Bearer $token" \
  -d "{\"id\":\"$WEBSITE_ID\",\"name\":\"web-app-template\",\"domain\":\"localhost\"}" > /dev/null
echo "umami: website $WEBSITE_ID created"
