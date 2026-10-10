# 🚀 First: The Thesis Race

A friendly word-count race for our DPhil year group.
**Leaderboard:** https://abbeybarnard.github.io/thesis-race/

Only word counts are ever shared. Nobody's thesis text leaves their own computer or repo.

## Join

You'll need a GitHub account.

| You write in… | How your count gets here |
|---|---|
| **Overleaf** | Open the [Log my words](../../issues/new?template=log.yml) form whenever you like and paste the number from *Menu → Word Count*. |
| **VS Code or any local LaTeX** | A small script counts with `texcount` and reports just the number. Set it up once and forget it. |
| **A thesis repo on GitHub** (including Overleaf's GitHub sync) | A GitHub Action in your own repo reports the count on every push. Your repo can stay private. |

**Step 1 for everyone:** fill in the [Join the race](../../issues/new?template=join.yml) form. Abbey approves new racers, and the bot replies on your form as soon as you're on the leaderboard. Add your thesis title if you'd like a silly racing nickname; the title itself is never saved.

### VS Code or local LaTeX

```sh
gh auth login && gh auth refresh -s gist      # GitHub CLI, once
curl -fsSLO https://raw.githubusercontent.com/abbeybarnard/thesis-race/main/tools/thesis-race.sh
bash thesis-race.sh main.tex --hook           # report now, and after every git commit
```

Not using git? Run `bash thesis-race.sh main.tex` whenever you like, or add it as a VS Code task:

```json
{ "label": "Thesis Race", "type": "shell", "command": "bash thesis-race.sh main.tex" }
```

Want to see your count without sending it? `bash thesis-race.sh main.tex --dry-run`.

The script keeps a public gist on your account with one file, `thesis-race.json`, holding `{"words": 23410, "updated": "…"}`. The leaderboard reads it every three hours.

### Thesis on GitHub

1. Make a [token with only the `gist` scope](https://github.com/settings/tokens/new?scopes=gist&description=Thesis%20Race) and add it to your thesis repo as a secret named `THESIS_RACE_TOKEN` (*Settings → Secrets and variables → Actions*).
2. Add `.github/workflows/thesis-race.yml` to your thesis repo:

```yaml
on: { push: {}, schedule: [{ cron: "0 22 * * *" }] }
jobs:
  count:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: abbeybarnard/thesis-race@main
        with:
          main: main.tex
          token: ${{ secrets.THESIS_RACE_TOKEN }}
```

## Fun stats

Everyone orbits a purple planet towards a finish gate that moves 10,000 words further out each time someone reaches it. There are no word targets. You'll also find weekly gains, writing streaks, a crystal ball that predicts your next milestone and your count on submission day, the group total in Very Hungry Caterpillars, a group writing calendar, and a trophy cabinet: furthest from Earth, fastest this week, longest streak, biggest single day, the editor's knife for the boldest cut, and more.

## Changing your details

Submit the join form again with new details. To leave, open an issue asking to be removed.

## How it works

- `data/racers/<github-username>.json` holds each racer's settings and daily counts.
- `.github/workflows/forms.yml` turns join and log forms into data commits, replies, and closes the issue.
- `.github/workflows/collect.yml` reads automatic racers' gists every three hours.
- `.github/workflows/pages.yml` builds `site/` and publishes it to GitHub Pages.

Inspired by the Oxford neutrino group's long-running ROOT-plot thesis race.
