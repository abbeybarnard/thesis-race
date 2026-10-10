#!/usr/bin/env bash
# Thesis Race one-step setup for VS Code / local LaTeX. Run it from your thesis folder:
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/tools/setup.sh | bash
#
# It finds your main .tex file, signs you in to GitHub if needed, reports your
# count once, and then reports again by itself after every git commit (or,
# without git, whenever you open the folder in VS Code). Only the number is ever sent.
# Pass a file to skip the search: ... | bash -s -- thesis/main.tex
set -euo pipefail

RACE_REPO="${RACE_REPO:-abbeybarnard/thesis-race}"  # the race this copy belongs to
HOME_DIR="$HOME/.thesis-race"
say() { printf '%s\n' "$*"; }
tty_ok() { [ -r /dev/tty ] && (exec </dev/tty) 2>/dev/null; }

# 1. Find the main .tex file: the one with \documentclass and \begin{document}.
MAIN="${1:-}"
if [ -z "$MAIN" ]; then
  CANDIDATES=()
  while IFS= read -r f; do CANDIDATES+=("$f"); done < <(
    find . -maxdepth 3 -name '*.tex' -not -path '*/.*' -not -path '*/build/*' -not -path '*/out/*' -print 2>/dev/null |
      while IFS= read -r f; do grep -q '\\documentclass' "$f" && grep -q '\\begin{document}' "$f" && printf '%s\n' "${f#./}"; done)
  if [ "${#CANDIDATES[@]}" -eq 0 ]; then
    say "❌ No main .tex file here. Run this from your thesis folder, or name the file: ... | bash -s -- thesis.tex"; exit 1
  elif [ "${#CANDIDATES[@]}" -eq 1 ]; then
    MAIN="${CANDIDATES[0]}"
  else
    for f in "${CANDIDATES[@]}"; do case "$(basename "$f")" in main.tex|thesis.tex|Thesis.tex) MAIN="$f"; break;; esac; done
    if [ -z "$MAIN" ] && tty_ok; then
      say "Which file is your thesis?"
      i=1; for f in "${CANDIDATES[@]}"; do say "  $i) $f"; i=$((i + 1)); done
      read -r -p "Number: " pick </dev/tty
      MAIN="${CANDIDATES[$((pick - 1))]:-}"
    fi
    [ -n "$MAIN" ] || MAIN="${CANDIDATES[0]}"
  fi
fi
[ -f "$MAIN" ] || { say "❌ Can't find $MAIN"; exit 1; }
MAINABS="$(cd "$(dirname "$MAIN")" && pwd)/$(basename "$MAIN")"
say "📄 Thesis: $MAIN"

# 2. GitHub CLI, signed in with permission to write gists (that's all it needs).
if ! command -v gh >/dev/null; then
  if command -v brew >/dev/null; then say "📦 Installing the GitHub CLI with Homebrew..."; brew install gh
  else say "❌ Please install the GitHub CLI first (https://cli.github.com), then run this again."; exit 1; fi
fi
if ! gh auth status >/dev/null 2>&1; then
  say "🔑 Signing you in to GitHub. A code appears here; paste it into the browser page that opens."
  gh auth login --hostname github.com --git-protocol https --web --scopes gist </dev/tty
elif ! gh auth status 2>&1 | grep -q "'gist'"; then
  say "🔑 Asking GitHub for permission to post your count. Approve it in the browser page that opens."
  gh auth refresh --hostname github.com --scopes gist </dev/tty
fi

# 3. Keep the reporter outside the thesis folder so it never ends up in your thesis repo.
mkdir -p "$HOME_DIR"
curl -fsSL "https://raw.githubusercontent.com/$RACE_REPO/main/tools/thesis-race.sh" -o "$HOME_DIR/thesis-race.sh"
chmod +x "$HOME_DIR/thesis-race.sh"
REPORT="\"$HOME_DIR/thesis-race.sh\" \"$MAINABS\""

# 4. Report now.
bash "$HOME_DIR/thesis-race.sh" "$MAINABS"

# 5. Report automatically from now on.
if git -C "$(dirname "$MAINABS")" rev-parse --git-dir >/dev/null 2>&1; then
  HOOK="$(cd "$(dirname "$MAINABS")" && d="$(git rev-parse --git-path hooks)" && mkdir -p "$d" && cd "$d" && pwd)/post-commit"
  if ! grep -qs "Thesis Race" "$HOOK"; then
    [ -f "$HOOK" ] || printf '#!/bin/sh\n' > "$HOOK"
    printf '# Thesis Race: report the word count after each commit\n%s >/dev/null 2>&1 &\n' "$REPORT" >> "$HOOK"
    chmod +x "$HOOK"
  fi
  say "🔁 Reports after every git commit."
else
# No git, so let VS Code report whenever the thesis folder is opened.
TASKS=".vscode/tasks.json"
if [ ! -e "$TASKS" ]; then
  mkdir -p .vscode
  cat > "$TASKS" <<JSON
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Thesis Race: report word count",
      "type": "shell",
      "command": "bash \"$HOME_DIR/thesis-race.sh\" \"$MAINABS\"",
      "runOptions": { "runOn": "folderOpen" },
      "presentation": { "reveal": "silent", "close": true },
      "problemMatcher": []
    }
  ]
}
JSON
  say "🧩 VS Code reports whenever you open this folder. The first time, VS Code asks to allow automatic tasks: choose Allow."
elif ! grep -qs "Thesis Race" "$TASKS"; then
  say "ℹ️  You already have $TASKS, so I left it alone. Run 'Thesis Race' any time with: bash ~/.thesis-race/thesis-race.sh \"$MAINABS\""
fi
fi
say "✅ All set. You'll move on the leaderboard within three hours."
