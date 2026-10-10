"""Give each racer a silly nickname inspired by their thesis title.

Rule-based on purpose: it runs in GitHub Actions with no API keys, and the same
title always gives the same nickname. Racers who want a different one can
rejoin with a reworded title.
"""
import hashlib
import re

THEMES = [
    (r"neutrino|\bnu\b|ν", ["The Ghost Whisperer", "Captain Barely-There", "Passes Through Walls", "Flavour Flipper", "The Unbothered", "Weakly Interacting Legend"]),
    (r"oscillat", ["Flavour Flipper", "Indecisive Particle Wrangler", "The Shapeshifter"]),
    (r"dark matter|wimp|axion", ["Professor of Nothing", "Chief Invisible Officer", "Searcher of the Void", "The Missing Mass"]),
    (r"majorana", ["Own Antiparticle, Own Rules", "Self-Annihilating Superstar", "Double Beta Daredevil"]),
    (r"millicharg|fractional charge", ["Small Change", "Charge Card Declined", "A Little Bit Charged"]),
    (r"higgs", ["Mass Effect", "The Weight Giver", "Field Marshal Higgs"]),
    (r"muon", ["Heavy Electron Enthusiast", "Muon Rouge", "Fat Electron Fan Club"]),
    (r"quark|qcd|hadron|jet", ["Three Quarks for Muster Mark", "Colour Confined", "Jet Setter", "Gluon Gobbler"]),
    (r"electron|\be\b|positron", ["Negative Nancy", "Charge of the Light Brigade"]),
    (r"cosmic|astro|galax|universe|cosmolog|gravitational", ["Space Cadet", "Cosmic Cowboy", "Lost in Space", "Star Child"]),
    (r"lhc|atlas|cms|lhcb|alice|collider", ["Lord of the Rings", "Ring Leader", "Smasher-in-Chief", "27 km Club"]),
    (r"detector|calorimet|chamber|tpc|argon|scintillat|photomultiplier|pmt", ["Wire Chamber Wrangler", "Argon Aficionado", "Photon Catcher", "Keeper of the Big Tank"]),
    (r"monte carlo|simulat|generator", ["Casino Royale", "Random Number Royalty", "The Simulation Hypothesis"]),
    (r"cross[- ]section", ["The Cross Examiner", "Barn Door Inspector"]),
    (r"machine learning|neural|deep learning|\bml\b|\bai\b|transformer", ["Robot Whisperer", "Gradient Descender", "Overfit Olympian"]),
    (r"calibrat|systematic|uncertaint", ["Knob Twiddler", "Error Bar Enthusiast", "Lord of the Nuisance Parameters"]),
    (r"laser|optic|photon|light", ["Bright Spark", "Photon Phanatic", "Light Year Ahead"]),
    (r"quantum|qubit|entangle", ["Schrödinger's Student", "Spooky Action Hero", "Superposition Sweetheart"]),
    (r"magnet|spin|field", ["Strong Attraction", "Spin Doctor", "Field Day"]),
    (r"beam|accelerat|linac|synchrotron", ["Beam Me Up", "Full Speed Ahead", "The Accelerator"]),
    (r"search|measure|precision", ["Decimal Point Detective", "Five Sigma Dreamer", "The Seeker"]),
    (r"anomal|beyond the standard|bsm|new physics", ["Anomaly Hunter", "Beyond the Standard Muddle", "Bump Hunter"]),
    (r"climate|atmospher|ocean", ["Weather or Not", "Cloud Botherer"]),
    (r"solid state|condensed|superconduct|material", ["Cool Customer", "Lattice Whisperer", "Phase Transitioner"]),
]

FALLBACK = ["Caffeinated Theorist", "Footnote Fanatic", "Chief Procrastination Officer", "Draft Dodger",
            "LaTeX Wrangler", "Overfull Hbox", "Coffee to Thesis Converter", "Citation Needed"]


def nickname(title: str, login: str = "") -> str:
    text = (title or "").lower()
    options = [nick for pattern, nicks in THEMES if re.search(pattern, text) for nick in nicks]
    options = list(dict.fromkeys(options)) or FALLBACK
    digest = hashlib.sha256(f"{login.lower()}|{text}".encode()).digest()
    return options[digest[0] % len(options)]


if __name__ == "__main__":
    import sys

    print(nickname(" ".join(sys.argv[1:])))
