"""Bundle race settings and every racer's history into site/data.json."""
import json
from datetime import datetime, timezone

from common import ROOT, all_racers, race

PUBLIC_FIELDS = ("login", "name", "nickname", "emoji", "astro", "deadline", "method", "joined", "history", "note")

out = {
    "race": race(),
    "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "racers": [{k: r[k] for k in PUBLIC_FIELDS if k in r} for r in all_racers()],
}
(ROOT / "site" / "data.json").write_text(json.dumps(out, ensure_ascii=False))
print(f"site/data.json: {len(out['racers'])} racers")
