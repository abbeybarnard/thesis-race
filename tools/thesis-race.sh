#!/usr/bin/env bash
# Thesis Race reporter: counts your thesis and shares ONLY the number.
#
#   thesis-race.sh main.tex            count and report
#   thesis-race.sh main.tex --dry-run  count only, send nothing
#   thesis-race.sh main.tex --hook     also report after every git commit
#
# The count goes to a public gist on your own GitHub account holding one tiny
# file, thesis-race.json, e.g. {"words": 23410, "updated": "2026-10-10T21:00:00Z"}.
# Needs the GitHub CLI (gh) logged in with the "gist" scope: gh auth refresh -s gist
set -euo pipefail

MAIN="${1:-main.tex}"
MODE="${2:-}"
FILE="thesis-race.json"
[ -f "$MAIN" ] || { echo "Can't find $MAIN. Pass your main .tex file, e.g. thesis-race.sh thesis.tex" >&2; exit 1; }

count_words() {
  local texcount="${TEXCOUNT:-$(command -v texcount || true)}"
  if [ -n "$texcount" ]; then
    texcount="$(cd "$(dirname "$texcount")" && pwd)/$(basename "$texcount")"
    # -inc follows \input/\include, -sum adds text, headers and captions, -1 prints one number.
    (cd "$(dirname "$MAIN")" && perl "$texcount" -inc -sum -1 -q "$(basename "$MAIN")" 2>/dev/null) | grep -oE '^[0-9]+' | head -1
  else
    echo "texcount not found, using a rougher built-in count (install it with: tlmgr install texcount)" >&2
    python3 - "$MAIN" <<'PY'
import re, sys, pathlib
seen = set()
def read(p):
    p = p if p.suffix else p.with_suffix(".tex")
    if p in seen or not p.exists(): return ""
    seen.add(p)
    s = re.sub(r"(?<!\\)%.*", "", p.read_text(errors="ignore"))
    return re.sub(r"\\(?:input|include)\{([^}]*)\}", lambda m: read(p.parent / m.group(1)), s)
s = read(pathlib.Path(sys.argv[1]))
m = re.search(r"\\begin\{document\}(.*)\\end\{document\}", s, re.S)
s = m.group(1) if m else s
s = re.sub(r"\\begin\{(equation|align|figure|table|tikzpicture)\*?\}.*?\\end\{\1\*?\}", " ", s, flags=re.S)
s = re.sub(r"\$[^$]*\$|\\[a-zA-Z@]+\*?(\[[^\]]*\])?|[{}\\]", " ", s)
print(len(re.findall(r"[A-Za-z0-9][\w'’-]*", s)))
PY
  fi
}

WORDS="$(count_words)"
[ -n "$WORDS" ] || { echo "Couldn't count words in $MAIN" >&2; exit 1; }
echo "📝 $WORDS words"
[ "$MODE" = "--dry-run" ] && exit 0

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com" >&2; exit 1; }
JSON="{\"words\": $WORDS, \"updated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
GIST="$(gh api '/gists?per_page=100' --jq ".[] | select(.files[\"$FILE\"]) | .id" | head -1)"
if [ -n "$GIST" ]; then
  gh api -X PATCH "/gists/$GIST" -f "files[$FILE][content]=$JSON" --silent
else
  gh api -X POST /gists -F public=true -f description="My Thesis Race word count (just the number)" \
    -f "files[$FILE][content]=$JSON" --silent
fi
echo "🏁 Reported to the Thesis Race. The leaderboard picks it up within a few hours."

if [ "$MODE" = "--hook" ]; then
  HOOK="$(git -C "$(dirname "$MAIN")" rev-parse --git-path hooks)/post-commit"
  SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  MAINABS="$(cd "$(dirname "$MAIN")" && pwd)/$(basename "$MAIN")"
  grep -qs "Thesis Race" "$HOOK" || printf '#!/bin/sh\n# Thesis Race: report the word count after each commit\n"%s" "%s" >/dev/null 2>&1 &\n' "$SELF" "$MAINABS" >> "$HOOK"
  chmod +x "$HOOK"
  echo "🔁 Will report after every commit (hook: $HOOK)"
fi
