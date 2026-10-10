"""Shared helpers for the Thesis Race scripts (standard library only)."""
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RACERS = DATA / "racers"
LOGIN_RE = re.compile(r"^[A-Za-z0-9-]{1,39}$")


def race():
    return json.loads((DATA / "race.json").read_text())


def today():
    return datetime.now(ZoneInfo(race()["timezone"])).date().isoformat()


def local_date(iso_timestamp):
    """Turn an ISO timestamp into the race's local calendar date."""
    ts = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    return ts.astimezone(ZoneInfo(race()["timezone"])).date().isoformat()


def racer_path(login):
    if not LOGIN_RE.match(login):
        raise ValueError(f"not a GitHub username: {login!r}")
    return RACERS / f"{login.lower()}.json"


def load_racer(login):
    path = racer_path(login)
    return json.loads(path.read_text()) if path.exists() else None


def save_racer(racer):
    racer["history"] = dict(sorted(racer.get("history", {}).items()))
    racer_path(racer["login"]).write_text(
        json.dumps(racer, indent=2, ensure_ascii=False) + "\n"
    )


def all_racers():
    return [json.loads(p.read_text()) for p in sorted(RACERS.glob("*.json"))]
