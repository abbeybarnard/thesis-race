"""Turn a "Join the race" or "Log my words" issue into a data change.

Reads the GitHub event from $GITHUB_EVENT_PATH and writes the reply for the
issue to reply.md. Exits non-zero only on bugs; bad input gets a friendly reply.
"""
import json
import os
import re
import sys
from datetime import date

from common import ROOT, load_racer, save_racer, today
from nickname import nickname

event = json.load(open(os.environ["GITHUB_EVENT_PATH"]))
issue = event["issue"]
login = issue["user"]["login"]
labels = {l["name"] for l in issue["labels"]}


def fields(body):
    """Issue forms render as '### Label\\n\\nvalue' blocks."""
    out = {}
    for block in re.split(r"^### ", body or "", flags=re.M)[1:]:
        label, _, value = block.partition("\n")
        value = value.strip()
        out[label.strip().lower()] = "" if value == "_No response_" else value
    return out


def number(text):
    digits = re.sub(r"[,\s_.]", "", text or "")
    return int(digits) if digits.isdigit() else None


def iso_date(text):
    try:
        return date.fromisoformat(text.strip()).isoformat()
    except ValueError:
        return None


ASTRO_CHOICES = {
    "suit": ("suit colour", {"white", "lilac", "pink", "sunshine", "mint", "sky", "tangerine", "midnight"}),
    "visor": ("visor", {"gold", "rainbow", "mirror", "rose", "shadow"}),
    "top": ("helmet topper", {"none", "antenna", "bunny", "cat", "party", "halo", "bow", "crown"}),
    "pack": ("backpack", {"classic", "jetpack"}),
}


def astronaut(f):
    """Keep only recognised outfit choices; the site fills any gaps with a default."""
    out = {}
    for key, (label, allowed) in ASTRO_CHOICES.items():
        word = (f.get(label) or "").strip().lower().split(" ")[0]
        if word in allowed:
            out[key] = "flames" if word == "jetpack" else word
    return out


def finish(message, ok):
    (ROOT / "reply.md").write_text(message + "\n")
    (ROOT / "result.txt").write_text("ok" if ok else "rejected")
    sys.exit(0)


f = fields(issue["body"])
action = event.get("action", "opened")
owner = os.environ.get("RACE_OWNER", "").lower()

if action == "labeled":
    # Only the race owner adding the "approved" label lets a new racer in.
    if event.get("label", {}).get("name") != "approved" or event["sender"]["login"].lower() != owner or "join" not in labels:
        (ROOT / "result.txt").write_text("ignore")
        sys.exit(0)
elif "join" in labels and load_racer(login) is None:
    (ROOT / "reply.md").write_text(
        f"Thanks for signing up! 🚀 Your request is waiting for @{owner} to approve it. "
        "You'll get a notification here as soon as you're on the leaderboard.\n"
    )
    (ROOT / "result.txt").write_text("pending")
    sys.exit(0)

if "join" in labels:
    deadline_text = f.get("submission date (optional)", "").strip()
    deadline = iso_date(deadline_text) if deadline_text else None
    name = f.get("display name", "").strip()[:40] or login
    if deadline_text and not deadline:
        finish("I couldn't read the submission date. Please use the format `2027-09-30`, or leave it blank.", False)
    racer = load_racer(login) or {"login": login, "joined": today(), "history": {}}
    title = f.get("thesis title (optional)", "")
    racer.update(
        name=name,
        nickname=nickname(title or name, login),  # the title itself is never saved
        emoji=(f.get("mission patch emoji") or "⭐").strip()[:8],
        astro=astronaut(f),
        method="auto" if f.get("how will you track your words?", "").lower().startswith("automatic") else "manual",
    )
    racer.pop("target", None)
    if deadline:
        racer["deadline"] = deadline
    start = number(f.get("words so far"))
    if start is not None and not racer["history"]:
        racer["history"][today()] = start
    save_racer(racer)
    how = (
        "Your count will update itself once you run the reporting script. The README has the one-line setup."
        if racer["method"] == "auto"
        else "Log your words whenever you like with the **Log my words** form. Overleaf shows your count under *Menu → Word Count*."
    )
    finish(f"Welcome aboard, {name} {racer['emoji']}! Your racing name is **{racer['nickname']}**.\n\n{how}", True)

if "log" in labels:
    racer = load_racer(login)
    if racer is None:
        finish("You're not in the race yet. Open a **Join the race** form first, then log your words.", False)
    words = number(f.get("word count"))
    if words is None or words > 500_000:
        finish("I couldn't read that word count. Please open a new **Log my words** form with just the number, like `23410`.", False)
    day = iso_date(f.get("date (optional)", "")) or today()
    if day > today():
        finish("That date is in the future, so I haven't logged it.", False)
    racer["history"][day] = words
    note = f.get("note (optional, public)", "").strip()
    if note:
        racer["note"] = note[:120]
    save_racer(racer)
    previous = [w for d, w in racer["history"].items() if d < day]
    delta = words - previous[-1] if previous else None
    if delta is None:
        change = ""
    elif delta >= 0:
        change = f" That's **+{delta:,}** since last time. 🎉"
    else:
        change = f" That's **{delta:,}** since last time. Cutting counts as progress too. ✂️"
    finish(f"Logged **{words:,} words** for {day}.{change}", True)

finish("This issue isn't a race form, so I've left the data alone.", False)
