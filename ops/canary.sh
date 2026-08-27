#!/bin/sh
set -eu

# Watch the live sites for the injection coming back.
#
# On 27 August a HAR from debeeshive.nl showed a script nobody put there:
# Yandex Metrika session-recording the admin login page, and `eth_call`
# requests to BNB Smart Chain testnet contracts whose payload decoded to an IP
# address. That last part is a technique called EtherHiding — the next stage of
# the malware is kept in a smart contract, so there is no domain to seize and no
# server to take offline.
#
# Redeploying the container made it go away, which is worth being precise about:
# a redeploy replaces the application container and leaves Postgres, the proxy
# and DNS untouched. So it removed the symptom and told us where the symptom
# lived. It did not tell us how anybody got in, and it did not close whatever
# they used. Until that is known, the honest assumption is that it can come
# back, and the thing that matters is finding out in minutes rather than when a
# guest mentions it.
#
# WHERE TO RUN THIS. Somewhere other than the machine it is watching. A canary
# that lives on the host it is watching can be switched off by whoever got into
# that host, and it would then go quiet in exactly the way that looks like good
# news. A laptop, a phone with Termux, a free tier box, anything — it only needs
# curl and outbound HTTPS.
#
#   ./ops/canary.sh                          check the built-in list once
#   ./ops/canary.sh https://example.nl ...   check the URLs you name instead
#
# Silent and exit 0 when everything is clean, so cron only mails you when there
# is something to say. Exit 1 on a detection, exit 2 when a site could not be
# reached at all. Those are deliberately different: unreachable is not clean,
# and a canary that reports "fine" about a site it never actually saw is worse
# than no canary.
#
#   */5 * * * * /path/to/canary.sh >> /var/log/canary.log 2>&1
#
# Set CANARY_WEBHOOK to have a detection POSTed somewhere as plain text — an
# ntfy.sh topic is the least-effort option that reaches a phone:
#
#   CANARY_WEBHOOK=https://ntfy.sh/some-topic-only-you-know ./ops/canary.sh

SITES="${*:-https://debeeshive.nl/ https://debeeshive.nl/admin/login}"

# What was actually seen, taken from the HAR rather than from a threat feed.
# Matching these is fast and certain, and it is the half of the check that will
# stop working first: the operator can change a hostname or redeploy a contract
# any afternoon. Hence the second check below, which does not depend on knowing
# what the payload looks like.
#
# One entry has been taken out, and why is worth more than the entry was.
#
# This list carried 45.86.176.242, described as the address the EtherHiding
# contract decoded to. It is not. It is the OWNERS' OFFICE address, and it is
# in the HAR because the HAR was recorded at the office. On 27 August 2026 it
# was read back against the server's auth log, matched two entirely ordinary
# root logins, and produced a confident conclusion that the host had been taken
# over. A rebuild was minutes away.
#
# So: an address that appears in a capture is not thereby the attacker's, and
# an indicator is only as good as its provenance. Anything added below needs to
# say where it came from and how that was established — a hostname the payload
# fetched, a contract address, a string from the script itself. Not "an IP that
# was in the file".
MARKERS="mc\.yandex|metrika|bnbchain\.org|binance\.org|drpc\.org|publicnode\.com|onfinality\.io|isGoalReached|0xf4a32588|0xE75744C5|0x4a0e8aC0|use\.fontawesome\.com"

# Every host these pages are allowed to load a script from. Anything else in a
# <script src> is reported, whatever it is called — which is what catches the
# next variant, since a new payload still has to come from somewhere.
#
# Deliberately short. Add a host here only when you know why it is there; an
# allowlist that grows by reflex every time it complains is a list that has
# stopped saying anything.
ALLOWED="^(debeeshive\.nl|cloud\.umami\.is|stats\.debeeshive\.nl)$"

alert() {
  printf '%s\n' "$1"
  [ -n "${CANARY_WEBHOOK:-}" ] && curl -fsS -m 15 -d "$1" "$CANARY_WEBHOOK" >/dev/null 2>&1 || true
}

status=0

for url in $SITES; do
  body=$(curl -fsS -m 25 -A 'beeshive-canary/1' "$url" 2>/dev/null) || {
    alert "CANARY: could not reach $url"
    [ "$status" = 0 ] && status=2
    continue
  }

  # 1. The known payload.
  hits=$(printf '%s' "$body" | grep -oiE "$MARKERS" | sort -u | tr '\n' ' ')
  if [ -n "$hits" ]; then
    alert "CANARY: INJECTION at $url -- $hits"
    status=1
  fi

  # 2. Any script from a host that is not on the list. Protocol-relative srcs
  #    (//host/x.js) are included on purpose: they are a normal way to write a
  #    third-party tag and a normal way to hide one.
  foreign=$(printf '%s' "$body" \
    | grep -oiE '<script[^>]+src=["'"'"']((https?:)?//)[^"'"'"']+' \
    | sed -E 's|.*(https?:)?//||; s|[/"'"'"'].*||' \
    | grep -viE "$ALLOWED" | sort -u | tr '\n' ' ')
  if [ -n "$foreign" ]; then
    alert "CANARY: unexpected script host at $url -- $foreign"
    status=1
  fi
done

exit "$status"
