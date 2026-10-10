"""Draw site/og.png, the preview card shown when the race link is pasted into a group chat.

Rebuilt on every publish so it always shows the current total, leader and countdown.
Needs Pillow (the publish workflow installs it).
"""
import math
import random
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from common import ROOT, all_racers, race

W, H = 1200, 630
FONTS = ROOT / "tools" / "fonts"
INK, MUTED, STAR, MAGENTA, VIOLET, RED = "#f1ecff", "#a99ccc", "#ffd56b", "#ff5fb0", "#b18cff", "#ff5f6d"


def font(name, size, weight):
    f = ImageFont.truetype(str(FONTS / name), size)
    axes = f.get_variation_axes()
    f.set_variation_by_axes([weight] if len(axes) == 1 else [100, weight])
    return f


def latest(r):
    h = r.get("history") or {}
    return h[max(h)] if h else 0


def card():
    settings = race()
    racers = all_racers()
    total = sum(latest(r) for r in racers)
    leader = max(racers, key=latest, default=None)

    img = Image.new("RGB", (W, H))
    px = ImageDraw.Draw(img)
    for y in range(H):  # nebula purple fading to the void
        t = y / H
        px.line([(0, y), (W, y)], fill=(int(0x1B + (0x0C - 0x1B) * t), int(0x10 + (0x07 - 0x10) * t), int(0x40 + (0x20 - 0x40) * t)))
    rng = random.Random(7)
    for _ in range(160):
        x, y, s = rng.randrange(W), rng.randrange(H), rng.choice([1, 1, 1, 2])
        px.ellipse([x, y, x + s, y + s], fill=rng.choice(["#ffffff", "#d9ccff", STAR]))

    # Saturn on the right, with a soft glow behind it.
    cx, cy, r = 955, 300, 132
    glow = Image.new("RGBA", (W, H))
    ImageDraw.Draw(glow).ellipse([cx - r - 60, cy - r - 60, cx + r + 60, cy + r + 60], fill=(177, 140, 255, 90))
    img.paste(glow.filter(ImageFilter.GaussianBlur(50)), (0, 0), glow.filter(ImageFilter.GaussianBlur(50)))
    planet = Image.new("RGBA", (W, H))
    p = ImageDraw.Draw(planet)
    p.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#b18cff")
    for i, c in enumerate(["#c9adff", "#9d74f0", "#d8c4ff", "#8f63e6"]):
        band = cy - 70 + i * 42
        p.rectangle([cx - r, band, cx + r, band + 16], fill=c)
    mask = Image.new("L", (W, H))
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    rings = Image.new("RGBA", (W, H))
    rd = ImageDraw.Draw(rings)
    rd.ellipse([cx - 254, cy - 56, cx + 254, cy + 56], outline="#2a1a55", width=20)
    rd.ellipse([cx - 250, cy - 52, cx + 250, cy + 52], outline=STAR, width=12)
    rd.ellipse([cx - 222, cy - 41, cx + 222, cy + 41], outline="#2a1a55", width=9)
    rd.ellipse([cx - 220, cy - 39, cx + 220, cy + 39], outline="#f0b8ff", width=5)
    # Split the rings into the half behind the planet and the half in front, then tilt both.
    back, front = rings.copy(), rings.copy()
    ImageDraw.Draw(back).rectangle([0, cy, W, H], fill=(0, 0, 0, 0))
    ImageDraw.Draw(front).rectangle([0, 0, W, cy - 1], fill=(0, 0, 0, 0))
    back, front = (layer.rotate(14, center=(cx, cy), resample=Image.BICUBIC) for layer in (back, front))
    img.paste(back, (0, 0), back)
    img.paste(planet, (0, 0), mask)
    ImageDraw.Draw(img).ellipse([cx - r, cy - r, cx + r, cy + r], outline="#2a1a55", width=4)
    img.paste(front, (0, 0), front)

    d = ImageDraw.Draw(img)
    title = settings.get("title", "First: The Thesis Race")
    kick, _, rest = title.partition(":")
    x = 72
    if rest:
        d.text((x, 70), kick.upper() + ":", font=font("Unbounded.ttf", 40, 700), fill=STAR)
    big = font("Unbounded.ttf", 82, 900)
    words = (rest or title).strip().split()
    d.text((x, 122), " ".join(words[:2]), font=big, fill=INK)
    d.text((x, 222), " ".join(words[2:]), font=big, fill=INK)

    body = font("InstrumentSans.ttf", 36, 600)
    d.text((x, 360), f"{total:,} words written by {len(racers)} {'racer' if len(racers) == 1 else 'racers'}", font=body, fill=INK)
    if leader and latest(leader):
        who = leader.get("name", leader["login"]) + (f" · {leader['nickname']}" if leader.get("nickname") else "")
        d.text((x, 412), f"In the lead: {who}", font=font("InstrumentSans.ttf", 32, 500), fill=MAGENTA)

    end = settings.get("funding_end")
    if end:
        days = math.ceil((datetime.fromisoformat(end) - datetime.now(timezone.utc)).total_seconds() / 86400)
        if days > 0:
            label = f"SPACESHIP DEPARTS IN {days} DAYS"
            f = font("Unbounded.ttf", 26, 700)
            w = d.textlength(label, font=f)
            d.rounded_rectangle([x - 4, 500, x + w + 40, 560], radius=14, fill="#1a0408", outline=RED, width=2)
            d.text((x + 18, 513), label, font=f, fill=RED)
    img.save(ROOT / "site" / "og.png", optimize=True)
    print(f"site/og.png: {total:,} words, {len(racers)} racers")


if __name__ == "__main__":
    card()
