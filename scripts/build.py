"""Bundle race settings and every racer's history into site/data.json."""
import json
import math
import os
from datetime import datetime, timezone

from common import ROOT, all_racers, race

PUBLIC_FIELDS = ("login", "name", "nickname", "emoji", "astro", "deadline", "method", "joined", "history", "note", "quiet")

settings = race()
# Racers' thesis repos run this repo's reporter, pinned to this exact commit, so later
# changes here can never reach into their repos without them choosing to update.
settings["action_ref"] = os.environ.get("GITHUB_SHA", "main")
out = {
    "race": settings,
    "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "racers": [{k: r[k] for k in PUBLIC_FIELDS if k in r} for r in all_racers()],
}
(ROOT / "site" / "data.json").write_text(json.dumps(out, ensure_ascii=False))
print(f"site/data.json: {len(out['racers'])} racers")

# On GitHub, fill in the link-preview tags (the card group chats show) for this copy only.
if os.environ.get("GITHUB_ACTIONS"):
    owner, _, name = out["race"]["repo"].partition("/")
    site_url = f"https://{owner.lower()}.github.io/" + ("" if name.lower() == f"{owner.lower()}.github.io" else f"{name}/")
    total = sum(r["history"][max(r["history"])] for r in out["racers"] if r.get("history"))
    count = len(out["racers"])
    desc = f"{total:,} words written by {count} {'racer' if count == 1 else 'racers'}."
    if out["race"].get("funding_end"):
        days = math.ceil((datetime.fromisoformat(out["race"]["funding_end"]) - datetime.now(timezone.utc)).total_seconds() / 86400)
        if days > 0:
            desc += f" The spaceship departs in {days} days."
    page = ROOT / "site" / "index.html"
    page.write_text(page.read_text().replace("__SITE_URL__", site_url).replace("__OG_DESC__", desc))
    print(f"preview tags: {site_url} / {desc}")
