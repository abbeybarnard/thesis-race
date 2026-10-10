"""Collect counts from racers who report automatically.

The reporting script (tools/thesis-race.sh) keeps a public gist on the racer's
own account with a single file, thesis-race.json: {"words": 12345, "updated": "..."}.
Only that number ever leaves their machine.
"""
import json
import os
import urllib.request

from common import all_racers, local_date, save_racer

FILE = "thesis-race.json"


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    if token := os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


for racer in all_racers():
    if racer.get("method") != "auto":
        continue
    login = racer["login"]
    try:
        gists = get(f"https://api.github.com/users/{login}/gists?per_page=100")
        gist = next((g for g in gists if FILE in g["files"]), None)
        if gist is None:
            print(f"{login}: no {FILE} gist yet")
            continue
        report = get(gist["files"][FILE]["raw_url"])
        words = int(report["words"])
        day = local_date(report.get("updated") or gist["updated_at"])
    except Exception as exc:  # one racer's broken gist shouldn't stop the race
        print(f"{login}: skipped ({exc})")
        continue
    if not 0 <= words <= 500_000:
        print(f"{login}: ignored implausible count {words}")
        continue
    if racer["history"].get(day) != words:
        racer["history"][day] = words
        save_racer(racer)
        print(f"{login}: {words} words on {day}")
