#!/usr/bin/env bash
# Puts a desktop app build on OUR OWN update feed (the public "desktop-app" storage bucket), so installed apps and the Download buttons
# never depend on GitHub (the repository is private; GitHub refuses people without access, and updates then stop without any message).
#
#   scripts/publish-update-feed.sh <office|tracker> <folder with the build files>
#
# Needs REF (the project reference) and SERVICE_KEY in the environment (the workflows get them from the same secrets the other
# Supabase workflows use; the key is never printed). For tests: STORAGE_BASE replaces the storage address, DRY_RUN=1 only prints the plan.
#
# Order matters: the installers, zips and blockmaps go up first and the latest*.yml files (the ones that tell installed apps a new
# version exists) go up LAST, so an app can never be told about a version whose files are not there yet. Files are named with the
# version, so they never change once uploaded (cached for a year); the yml files are never cached. Files of older versions are removed
# afterwards (an app that cannot find the old blockmap simply downloads the whole new file). Then every file the yml files point to is
# fetched again, publicly, to prove the feed works for everybody.
set -euo pipefail

APP="${1:?usage: publish-update-feed.sh <office|tracker> <folder>}"
DIR="${2:?usage: publish-update-feed.sh <office|tracker> <folder>}"
case "$APP" in office|tracker) ;; *) echo "app must be office or tracker, not '$APP'"; exit 2 ;; esac
BUCKET="desktop-app"
PREFIX="updates/$APP"
BASE="${STORAGE_BASE:-https://${REF:?REF is not set}.supabase.co/storage/v1}"
DRY="${DRY_RUN:-0}"
[ "$DRY" = "1" ] || : "${SERVICE_KEY:?SERVICE_KEY is not set}"

shopt -s nullglob
YMLS=("$DIR"/latest*.yml)
[ ${#YMLS[@]} -gt 0 ] || { echo "No latest*.yml in $DIR: nothing tells installed apps about this build."; exit 1; }

# the file names the yml files point to (url: and path: lines), without quotes
refs() { for y in "${YMLS[@]}"; do grep -E '^[[:space:]]*(-[[:space:]]+)?(url|path):' "$y" | sed -E "s/^[[:space:]]*(-[[:space:]]+)?(url|path):[[:space:]]*//; s/^[\"']//; s/[\"'][[:space:]]*\$//"; done | sort -u; }

# every file a yml mentions must be in the folder (a half-built release must never go live)
MISSING=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ ! -f "$DIR/$f" ]; then echo "MISSING: $f is named in a latest*.yml but is not in $DIR"; MISSING=1; fi
done < <(refs)
[ "$MISSING" = "0" ] || exit 1

# nothing with a space in its name: the apps ask for the name exactly as the yml spells it
for f in "$DIR"/*; do case "$(basename "$f")" in *" "*) echo "File name has a space: $(basename "$f")"; exit 1 ;; esac; done

PAYLOAD=()
for f in "$DIR"/*; do
  [ -f "$f" ] || continue
  n="$(basename "$f")"
  case "$n" in latest*.yml) ;; *.exe|*.dmg|*.zip|*.AppImage|*.deb|*.blockmap) PAYLOAD+=("$n") ;; *) echo "skipping $n" ;; esac
done
[ ${#PAYLOAD[@]} -gt 0 ] || { echo "No installers in $DIR"; exit 1; }

echo "KD Ops $APP feed: ${#PAYLOAD[@]} files, then ${#YMLS[@]} yml"
up() { # file name, content type, cache-control
  local n="$1" ct="$2" cc="$3"
  echo "upload $PREFIX/$n ($(du -h "$DIR/$n" | cut -f1))"
  [ "$DRY" = "1" ] && return 0
  local code
  code=$(curl -sS -o /tmp/feed-resp.txt -w '%{http_code}' -X POST "$BASE/object/$BUCKET/$PREFIX/$n" \
    -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H "x-upsert: true" -H "cache-control: $cc" -H "Content-Type: $ct" --data-binary @"$DIR/$n")
  if [ "$code" != "200" ]; then echo "Upload of $n failed ($code):"; cat /tmp/feed-resp.txt; echo; exit 1; fi
}
for n in "${PAYLOAD[@]}"; do up "$n" application/octet-stream "max-age=31536000"; done
for y in "${YMLS[@]}"; do up "$(basename "$y")" text/yaml "no-cache"; done

# remove files of older versions (never the yml files, never anything outside this app's folder)
if [ "$DRY" != "1" ]; then
  KEEP=" $(printf '%s ' "${PAYLOAD[@]}") $(for y in "${YMLS[@]}"; do printf '%s ' "$(basename "$y")"; done)"
  LIST=$(curl -sS -X POST "$BASE/object/list/$BUCKET" -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H "Content-Type: application/json" \
    -d "{\"prefix\":\"$PREFIX\",\"limit\":200}" || echo '[]')
  OLD=$(echo "$LIST" | jq -r '.[]? | .name' 2>/dev/null | while IFS= read -r name; do
    [ -n "$name" ] || continue
    case "$KEEP" in *" $name "*) ;; *) echo "$PREFIX/$name" ;; esac
  done)
  if [ -n "$OLD" ]; then
    echo "removing older files:"; echo "$OLD"
    BODY=$(echo "$OLD" | jq -R . | jq -s '{prefixes: .}')
    curl -sS -X DELETE "$BASE/object/$BUCKET" -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H "Content-Type: application/json" -d "$BODY" >/dev/null || echo "(clean-up failed; harmless)"
  fi
fi

# prove it: everybody (no login) can fetch every file the yml files name, and the yml files themselves
if [ "$DRY" != "1" ]; then
  PUB="$BASE/object/public/$BUCKET/$PREFIX"
  FAIL=0
  for n in $(refs) $(for y in "${YMLS[@]}"; do basename "$y"; done); do
    ok=0
    for try in 1 2 3; do
      code=$(curl -sS -o /dev/null -I -w '%{http_code}' "$PUB/$n" || echo 000)
      [ "$code" = "200" ] && { ok=1; break; }
      sleep 2
    done
    echo "$n -> $code"
    [ "$ok" = "1" ] || FAIL=1
  done
  [ "$FAIL" = "0" ] || { echo "The feed is NOT complete."; exit 1; }
fi
echo "KD Ops $APP update feed is live at $BASE/object/public/$BUCKET/$PREFIX/"
