// First: The Thesis Race. Reads data.json (built by scripts/build.py) and draws everything client-side.
(() => {
  const DAY = 864e5;
  const COLOURS = ["#ff5fb0", "#7cc4ff", "#ffd56b", "#72e3b2", "#c39bff", "#ff9a62", "#5fe0e0", "#f78fd6", "#b8e06b", "#9aa8ff"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n = (x) => Math.round(x).toLocaleString("en-GB");
  const k = (x) => (x >= 1000 ? `${+(x / 1000).toFixed(x % 1000 ? 1 : 0)}k` : n(x));
  const signed = (x) => (x > 0 ? "+" : x < 0 ? "−" : "±") + n(Math.abs(x));
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const nice = (s, opts = { day: "numeric", month: "short" }) => toDate(s).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const longDate = { day: "numeric", month: "short", year: "numeric" };

  let DATA, TODAY, racers, sortKey = "words";
  const SKINS = {
    space: {
      lede: "Everyone's word count, live from orbit. Only the numbers are shared, never the theses.",
      track: "In orbit", gate: "FINISH GATE", crew: "The Launch Crew", chart: "Flight paths",
      hint: (f, m) => `Everyone flies anticlockwise towards the finish gate at ${f} words. Each time someone reaches it, the gate moves another ${m} words out, like an expanding universe.`,
      far: ["🌌", "Furthest from Earth"], steady: ["🛰️", "Steady orbit"],
      doom: "Life support fails in", doomDone: "Life support has failed. Godspeed.",
    },
    collider: {
      lede: "Everyone's word count, live from the beam pipe. Only the numbers are shared, never the theses.",
      track: "In the ring", gate: "INTERACTION POINT", crew: "The Collaboration", chart: "Integrated luminosity",
      hint: (f, m) => `Everyone circulates anticlockwise towards the interaction point at ${f} words. Each time someone collides with it, the beam energy goes up another ${m} words.`,
      far: ["⚡", "Highest energy"], steady: ["🧲", "Stable beam"],
      doom: "Beam dump in", doomDone: "The beam has been dumped. Godspeed.",
    },
  };
  const savedSkin = (() => { try { return localStorage.getItem("thesis-race-skin"); } catch { return null; } })();
  let SKIN = SKINS[savedSkin] ? savedSkin : "space";
  document.documentElement.dataset.skin = SKIN;
  const T = () => SKINS[SKIN];

  stars();
  fetch("data.json", { cache: "no-store" })
    .then((r) => r.json())
    .then(start)
    .catch(() => { $("summary").innerHTML = '<p class="hint">The leaderboard data could not be loaded. Try refreshing the page.</p>'; });

  function start(data) {
    DATA = data;
    const race = data.race;
    TODAY = data.today || new Intl.DateTimeFormat("en-CA", { timeZone: race.timezone || "Europe/London" }).format(new Date());
    document.title = race.title;
    const [kick, ...rest] = race.title.split(":");
    $("title").innerHTML = rest.length ? `<span class="kicker">${esc(kick)}:</span>${esc(rest.join(":").trim())}` : esc(race.title);
    $("subtitle").textContent = race.subtitle || "";
    $("subtitle").hidden = !race.subtitle;
    $("demo-note").hidden = !data.demo;
    $("wpp").textContent = race.words_per_page;
    $("cat").textContent = race.caterpillar_words;
    astroDefs();
    wireLinks(race.repo);
    builder();

    racers = data.racers.map((r, i) => stats(r, COLOURS[i % COLOURS.length]));
    renderSummary();
    startDoom();
    renderSkinned();
    renderChart();
    renderHeat();
    document.querySelectorAll("[data-skin-pick]").forEach((b) => b.addEventListener("click", () => setSkin(b.dataset.skinPick)));
    const gen = data.generated ? new Date(data.generated) : null;
    $("updated").textContent = gen ? `Last updated ${gen.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : "";
  }

  // Everything that looks different between the Space and Collider themes.
  function renderSkinned() {
    const t = T();
    document.querySelectorAll("[data-skin-pick]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.skinPick === SKIN));
    $("lede").textContent = t.lede;
    $("track-h").textContent = t.track;
    $("crew-h").textContent = t.crew;
    $("chart-h").textContent = t.chart;
    tickDoom();
    redrawBuilder();
    renderOrbit();
    renderLanes();
    renderCrew();
    renderBoard();
    renderPredict();
    renderAwards();
  }
  function setSkin(name) {
    if (!SKINS[name] || name === SKIN) return;
    SKIN = name;
    document.documentElement.dataset.skin = name;
    try { localStorage.setItem("thesis-race-skin", name); } catch {}
    renderSkinned();
  }

  function wireLinks(repo) {
    $("curl-cmd").textContent = $("curl-cmd").textContent.replaceAll("OWNER/REPO", repo);
    $("curl-cmd").dataset.copy = $("curl-cmd").textContent;
    joinForm(repo);
    logForm(repo);
    githubHelper(repo);
  }

  // GitHub issue forms take their answers from the URL, keyed by each field's id,
  // so people fill everything in here and only press Create on GitHub.
  const issueUrl = (repo, params) => `https://github.com/${repo}/issues/new?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null))}`;
  function sendToGitHub(url, errorEl) {
    const w = window.open(url, "_blank");
    if (w) w.opener = null;
    errorEl.hidden = false;
    errorEl.className = "j-ok";
    errorEl.innerHTML = w === null
      ? `Your browser blocked the new tab. <a href="${esc(url)}" target="_blank" rel="noopener">Open GitHub here</a>, then press <strong>Create</strong>.`
      : `GitHub has opened in a new tab. Press <strong>Create</strong> there to finish. <a href="${esc(url)}" target="_blank" rel="noopener">Didn't open?</a>`;
  }
  function fail(errorEl, message, field) {
    errorEl.hidden = false;
    errorEl.className = "j-error";
    errorEl.textContent = message;
    field.focus();
  }

  const METHOD = {
    hand: "By hand (Overleaf, or any editor that shows a word count)",
    auto: "Automatic (VS Code, local LaTeX, or a GitHub-synced thesis)",
  };
  function joinForm(repo) {
    const method = () => document.querySelector('[name="j-method"]:checked').value;
    const showPanel = () => {
      for (const m of ["overleaf", "local", "github"]) $(`panel-${m}`).hidden = m !== method();
    };
    document.querySelectorAll('[name="j-method"]').forEach((r) => r.addEventListener("change", showPanel));
    showPanel();
    $("join-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = $("j-error");
      const name = $("j-name").value.trim();
      if (!name) return fail(err, "Add a display name first. A nickname is fine.", $("j-name"));
      const start = $("j-start").value.trim();
      if (start && !(Number(start) >= 0)) return fail(err, "Words so far should be a number, like 2300.", $("j-start"));
      const kit = builderState();
      sendToGitHub(issueUrl(repo, {
        template: "join.yml",
        title: `Join the race: ${name}`,
        name,
        suit: LABELS.suit[kit.suit], visor: LABELS.visor[kit.visor], top: LABELS.top[kit.top], pack: LABELS.pack[kit.pack],
        emoji: kit.patch,
        thesis: $("j-thesis").value.trim(),
        deadline: $("j-deadline").value,
        start: start && String(Math.round(Number(start))),
        method: method() === "overleaf" ? METHOD.hand : METHOD.auto,
      }), err);
    });
  }

  function logForm(repo) {
    $("log-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const err = $("l-error");
      const words = $("l-words").value.trim();
      if (!words || !(Number(words) >= 0)) return fail(err, "Type your total word count, like 23410.", $("l-words"));
      sendToGitHub(issueUrl(repo, { template: "log.yml", title: "Log my words", words: String(Math.round(Number(words))), note: $("l-note").value.trim() }), err);
    });
  }

  // Turns "github.com/jasmine/thesis" into ready-made links for that repo.
  function githubHelper(raceRepo) {
    const yml = (main) => `name: Thesis Race
on:
  push:
  workflow_dispatch:
  schedule: [{ cron: "0 22 * * *" }]
jobs:
  count:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ${raceRepo}@main
        with:
          main: ${main}
          token: \${{ secrets.THESIS_RACE_TOKEN }}
`;
    const parse = (v) => {
      const m = v.trim().replace(/^https?:\/\//, "").replace(/^github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "").match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
      return m ? `${m[1]}/${m[2]}` : null;
    };
    const update = () => {
      const repo = parse($("g-repo").value);
      const main = $("g-main").value.trim() || "main.tex";
      const branch = $("g-branch").value.trim() || "main";
      $("action-yml").textContent = yml(main);
      const links = repo && {
        secret: `https://github.com/${repo}/settings/secrets/actions/new`,
        file: `https://github.com/${repo}/new/${encodeURIComponent(branch)}?${new URLSearchParams({ filename: ".github/workflows/thesis-race.yml", value: yml(main) })}`,
        actions: `https://github.com/${repo}/actions`,
      };
      document.querySelectorAll(".g-link").forEach((a) => {
        a.href = links ? links[a.dataset.g] : "#g-repo";
        a.toggleAttribute("aria-disabled", !links);
        a.target = links ? "_blank" : "";
      });
      $("g-repo").setAttribute("aria-invalid", String(!!$("g-repo").value.trim() && !repo));
    };
    for (const id of ["g-repo", "g-main", "g-branch"]) $(id).addEventListener("input", update);
    document.querySelectorAll(".g-link").forEach((a) => a.addEventListener("click", (e) => {
      if (!a.hasAttribute("aria-disabled")) return;
      e.preventDefault();
      $("g-repo").focus();
      $("g-repo").placeholder = "Type your repository here first, like jasmine/thesis";
    }));
    document.querySelectorAll(".copy, #action-yml").forEach((c) => {
      c.title = "Click to copy";
      c.addEventListener("click", () => {
        navigator.clipboard?.writeText(c.dataset.copy || c.textContent).then(() => { c.classList.add("copied"); setTimeout(() => c.classList.remove("copied"), 1200); }, () => {});
      });
    });
    update();
  }

  // ---------- the funding countdown ----------
  let doomEnd = null, doomLine = 0;
  function startDoom() {
    if (!DATA.race.funding_end) return;
    doomEnd = new Date(DATA.race.funding_end);
    $("doom").hidden = false;
    $("doom-date").textContent = `${doomEnd.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: DATA.race.timezone })}. Funding ends. No extensions. No mercy.`;
    tickDoom();
    setInterval(tickDoom, 1000);
    setInterval(() => { doomLine++; grimLine(); }, 7000);
  }
  function tickDoom() {
    if (!doomEnd) return;
    const left = Math.max(0, doomEnd - Date.now());
    $("doom-h").textContent = left ? T().doom : "Funding has run out";
    if (!left) { $("doom-clock").innerHTML = `<span class="doom-over">${esc(T().doomDone)}</span>`; $("doom-line").textContent = ""; return; }
    const d = Math.floor(left / DAY), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, sec = Math.floor(left / 1000) % 60;
    const unit = (v, label, pad = 2) => `<span class="du"><span class="dv">${String(v).padStart(pad, "0")}</span><span class="dl">${label}</span></span>`;
    $("doom-clock").innerHTML = unit(d, "days", 3) + '<span class="dc">:</span>' + unit(h, "hours") + '<span class="dc">:</span>' + unit(m, "minutes") + '<span class="dc">:</span>' + unit(sec, "seconds");
    if (!$("doom-line").textContent) grimLine();
  }
  function grimLine() {
    const left = Math.max(0, doomEnd - Date.now()), days = left / DAY;
    const groupRate = racers.reduce((s, r) => s + r.rate, 0);
    const lines = [
      `That's ${Math.floor(days / 7)} weekends. Spend them wisely.`,
      groupRate ? `At this pace, the group writes ~${n(groupRate * days)} more words before the money stops.` : `Nobody has a writing pace yet. The clock does not care.`,
      `Every second spent reading this is a second not writing.`,
      `${n(days * 24)} hours. Some of them must be used for sleep.`,
      `The Very Hungry Caterpillar ate for a week. You have ${Math.floor(days / 7)}.`,
    ];
    $("doom-line").textContent = lines[doomLine % lines.length];
  }

  // ---------- astronauts ----------
  const SUITS = { white: ["#eef0ff", "#b9bde6"], lilac: ["#c9a8ff", "#9672d9"], pink: ["#ff8ac8", "#d65a9c"], sunshine: ["#ffd56b", "#d9a530"], mint: ["#8ff0c8", "#4fbf94"], sky: ["#9dd6ff", "#5c9fd6"], tangerine: ["#ffa46b", "#d9733a"], midnight: ["#5552b8", "#36348a"] };
  const VISORS = { gold: [["#fff1b8", 0], ["#ffd56b", 0.45], ["#b8860b", 1]], rainbow: [["#ff6b9a", 0], ["#ffd56b", 0.3], ["#72e3b2", 0.55], ["#7cc4ff", 0.8], ["#b18cff", 1]], mirror: [["#d6f4ff", 0], ["#7cc4ff", 0.45], ["#2b4fd6", 1]], rose: [["#ffe0ee", 0], ["#ff8ac8", 0.5], ["#c2306f", 1]], shadow: [["#6b5aa8", 0], ["#2a1c5c", 0.5], ["#0c0720", 1]] };
  const TOPPERS = ["none", "antenna", "bunny", "cat", "party", "halo", "bow", "crown"];
  const PACKS = ["classic", "flames"];
  const hashOf = (str) => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  function kit(r) {
    const h = hashOf(r.login || r.name || "");
    const pick = (list, key, shift) => (list.includes(key) ? key : list[(h >>> shift) % list.length]);
    const a = r.astro || {};
    return { suit: pick(Object.keys(SUITS), a.suit, 0), visor: pick(Object.keys(VISORS), a.visor, 4), top: pick(TOPPERS, a.top, 8), pack: pick(PACKS, a.pack, 12), patch: r.emoji || "⭐" };
  }
  // One-off gradient definitions shared by every astronaut on the page.
  function astroDefs() {
    const defs = Object.entries(VISORS).map(([key, stops]) => `<linearGradient id="visor-${key}" x1="0" y1="0" x2="1" y2="1">${stops.map(([c, o]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`).join("");
    document.body.insertAdjacentHTML("afterbegin", `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`);
  }
  const INK = "#170b33";
  function topper(t) {
    const o = `stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"`;
    switch (t) {
      case "antenna": return `<line x1="0" y1="-20" x2="0" y2="-27" stroke="${INK}" stroke-width="1.6"/><circle cx="0" cy="-28" r="2.8" fill="#ff5fb0" ${o}/>`;
      case "bunny": return `<ellipse cx="-5" cy="-25" rx="2.8" ry="7" fill="#fff" ${o} transform="rotate(-12 -5 -25)"/><ellipse cx="5" cy="-25" rx="2.8" ry="7" fill="#fff" ${o} transform="rotate(12 5 -25)"/><ellipse cx="-5" cy="-25" rx="1.2" ry="4.5" fill="#ffb3d6" transform="rotate(-12 -5 -25)"/><ellipse cx="5" cy="-25" rx="1.2" ry="4.5" fill="#ffb3d6" transform="rotate(12 5 -25)"/>`;
      case "cat": return `<path d="M-10 -15 L-8 -25 L-2 -19 Z" fill="#3d3550" ${o}/><path d="M10 -15 L8 -25 L2 -19 Z" fill="#3d3550" ${o}/>`;
      case "party": return `<path d="M-5 -18 L1 -32 L6 -18 Z" fill="#72e3b2" ${o}/><circle cx="1" cy="-32" r="2.4" fill="#ffd56b" ${o}/><path d="M-3 -22 L4 -24 M-1 -27 L3 -28" stroke="#ff5fb0" stroke-width="1.4"/>`;
      case "halo": return `<ellipse cx="0" cy="-25" rx="8" ry="2.6" fill="none" stroke="#ffd56b" stroke-width="2.4"/>`;
      case "bow": return `<path d="M5 -19 L12 -24 L12 -14 Z M5 -19 L-2 -24 L-2 -14 Z" fill="#ff5fb0" ${o} transform="rotate(20 5 -19)"/><circle cx="5" cy="-19" r="2" fill="#ff8ac8" ${o}/>`;
      case "crown": return `<path d="M-7 -18 L-7 -25 L-3.5 -21 L0 -27 L3.5 -21 L7 -25 L7 -18 Z" fill="#ffd56b" ${o}/>`;
      default: return "";
    }
  }
  // A bendy arm: dark outline, suit-coloured sleeve, glove at the end. Drawn under the body so the shoulder tucks in.
  function arm(d, suit, shade) {
    const end = d.trim().split(" ").slice(-2).map(Number);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${suit}" stroke-width="5.5" stroke-linecap="round"/><circle cx="${end[0]}" cy="${end[1]}" r="3" fill="${shade}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  // An astronaut drawn around (0,0), roughly 48 wide and 60 tall.
  function astroBody(k) {
    const [suit, shade] = SUITS[k.suit];
    const o = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
    // Jetpack: two nozzles mirrored about the middle, each with its flame directly underneath.
    const jet = k.pack === "flames";
    const side = (m) => `<path d="M${m * 14} 19.5 Q${m * 12} 31.5 ${m * 10} 19.5 Z" fill="#ffd56b"/><path d="M${m * 13} 19.5 Q${m * 12} 25.5 ${m * 11} 19.5 Z" fill="#ff5fb0"/>`;
    const nozzle = (m) => `<path d="M${m * 14.5} 15.5 L${m * 9.5} 15.5 L${m * 10.3} 20 L${m * 13.7} 20 Z" fill="${shade}" ${o}/>`;
    const flames = jet ? `<g class="flame">${side(-1)}${side(1)}</g>` : "";
    return `${flames}<rect x="${jet ? -15 : -13}" y="2" width="${jet ? 30 : 26}" height="15" rx="4.5" fill="${shade}" ${o}/>${jet ? nozzle(-1) + nozzle(1) : ""}
      <rect x="-8.5" y="16" width="7" height="10" rx="3" fill="${shade}" ${o}/><rect x="1.5" y="16" width="7" height="10" rx="3" fill="${shade}" ${o}/>
      ${arm("M-7 5 Q-15 6 -17 12", suit, shade)}${arm("M7 6 Q14 5 15.5 -3", suit, shade)}
      <rect x="-10" y="1" width="20" height="19" rx="7" fill="${suit}" ${o}/>
      <circle cx="0" cy="10" r="5" fill="#fff" ${o}/><text x="0" y="12.6" font-size="7" text-anchor="middle">${esc(k.patch)}</text>
      ${topper(k.top)}
      <circle cx="0" cy="-8" r="12" fill="${suit}" ${o}/>
      <ellipse cx="1" cy="-8" rx="8.5" ry="6.6" fill="url(#visor-${k.visor})" ${o}/>
      <ellipse cx="-2.5" cy="-11" rx="2.6" ry="1.4" fill="#fff" opacity="0.8"/>`;
  }
  // Collider theme: each racer is a glowing particle in their suit colour, wearing their patch.
  function particleBody(k, tail) {
    const [c, shade] = SUITS[k.suit];
    const trail = tail ? `<circle cx="-11" r="7" fill="${c}" opacity="0.45"/><circle cx="-20" r="5" fill="${c}" opacity="0.28"/><circle cx="-28" r="3.5" fill="${c}" opacity="0.14"/>` : "";
    return `${trail}<circle r="14" fill="${c}" opacity="0.25"/><circle r="10" fill="${c}" stroke="${shade}" stroke-width="2"/><circle cx="-3" cy="-3.5" r="2.6" fill="#fff" opacity="0.7"/><text y="3.6" font-size="10" text-anchor="middle">${esc(k.patch)}</text>`;
  }
  const avatar = (r, size) => (SKIN === "collider"
    ? `<svg class="astro particle" viewBox="-17 -17 34 34" width="${size}" height="${size}" aria-hidden="true">${particleBody(kit(r), false)}</svg>`
    : astroSvg(r, size));
  const astroSvg = (r, size = 40, cls = "astro") => `<svg class="${cls}" viewBox="-24 -34 48 62" width="${size}" height="${(size * 62) / 48}" aria-hidden="true">${astroBody(kit(r))}</svg>`;


  // ---------- astronaut builder ----------
  const LABELS = {
    suit: { white: "White", lilac: "Lilac", pink: "Pink", sunshine: "Sunshine", mint: "Mint", sky: "Sky", tangerine: "Tangerine", midnight: "Midnight" },
    visor: { gold: "Gold", rainbow: "Rainbow", mirror: "Mirror", rose: "Rose", shadow: "Shadow" },
    top: { none: "None", antenna: "Antenna", bunny: "Bunny ears", cat: "Cat ears", party: "Party hat", halo: "Halo", bow: "Bow", crown: "Crown" },
    pack: { classic: "Classic", flames: "Jetpack flames" },
  };
  let redrawBuilder = () => {};
  let builderState = () => ({});
  function builder() {
    const sel = (part) => document.querySelector(`[data-part="${part}"]`);
    for (const [part, opts] of Object.entries(LABELS)) sel(part).innerHTML = Object.entries(opts).map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    const state = { suit: "lilac", visor: "rainbow", top: "antenna", pack: "flames" };
    const draw = () => {
      for (const part in LABELS) sel(part).value = state[part];
      const patch = $("b-patch").value.trim() || "⭐";
      const particle = SKIN === "collider";
      $("builder-preview").innerHTML = particle
        ? `<svg viewBox="-42 -24 66 48" class="astro particle">${particleBody({ ...state, patch }, true)}</svg>`
        : `<svg viewBox="-30 -38 60 70" class="astro"><g class="o-float">${astroBody({ ...state, patch })}</g></svg>`;
      $("builder-h").textContent = particle ? "Design your particle" : "Design your astronaut";
      document.querySelectorAll(".astro-only").forEach((el) => (el.hidden = particle));
    };
    for (const part in LABELS) sel(part).addEventListener("change", (e) => { state[part] = e.target.value; draw(); });
    $("b-patch").addEventListener("input", draw);
    redrawBuilder = draw;
    builderState = () => ({ ...state, patch: $("b-patch").value.trim() || "⭐" });
    $("builder-random").addEventListener("click", () => {
      for (const part in LABELS) { const keys = Object.keys(LABELS[part]); state[part] = keys[Math.floor(Math.random() * keys.length)]; }
      draw();
    });
    draw();
  }

  // ---------- numbers ----------
  function stats(r, colour) {
    const keys = Object.keys(r.history).sort();
    const series = [];
    if (keys.length) {
      let v = 0;
      for (let t = toDate(keys[0]); iso(t) <= TODAY; t = new Date(+t + DAY)) {
        const d = iso(t);
        if (r.history[d] != null) v = r.history[d];
        series.push([d, v]);
      }
    }
    const words = series.length ? series.at(-1)[1] : 0;
    const ago = (d) => (series.length ? series[Math.max(0, series.length - 1 - d)][1] : 0);
    const pace = (days) => Math.max(0, (words - ago(days)) / Math.min(days, Math.max(1, series.length - 1)));
    const rate = pace(28), rate7 = pace(7);
    const week = words - ago(7);

    const daily = [];
    for (let i = 1; i < series.length; i++) daily.push([series[i][0], series[i][1] - series[i - 1][1]]);
    let streak = 0;
    for (let i = daily.length - 1; i >= 0; i--) {
      if (daily[i][1] > 0) streak++;
      else if (i === daily.length - 1) continue; // today isn't over yet
      else break;
    }
    let best = null, cut = null;
    for (let i = 1; i < keys.length; i++) {
      if ((toDate(keys[i]) - toDate(keys[i - 1])) / DAY !== 1) continue;
      const d = r.history[keys[i]] - r.history[keys[i - 1]];
      if (!best || d > best[1]) best = [keys[i], d];
      if (!cut || d < cut[1]) cut = [keys[i], d];
    }
    const active30 = daily.slice(-30).filter(([, d]) => d > 0).length;

    const step = DATA.race.milestone || 10000;
    const nextMilestone = (Math.floor(words / step) + 1) * step;
    const after = (perDay, need) => (perDay > 0 ? iso(new Date(+toDate(TODAY) + Math.ceil(need / perDay) * DAY)) : null);
    const milestoneEta = after(rate, nextMilestone - words);

    const daysLeft = r.deadline ? Math.max(0, Math.round((toDate(r.deadline) - toDate(TODAY)) / DAY)) : null;
    const proj = daysLeft != null && rate > 0
      ? { mid: words + rate * daysLeft, lo: words + Math.min(rate, rate7) * daysLeft, hi: words + Math.max(rate, rate7) * daysLeft }
      : null;

    return { ...r, colour, series, daily, words, week, rate, rate7, streak, best, cut, active30, nextMilestone, milestoneEta, daysLeft, proj };
  }

  const sorted = (key) => [...racers].sort((a, b) => b[key] - a[key] || b.words - a.words);
  const stat = (v, key, s) => `<div class="stat"><span class="k">${esc(key)}</span><span class="v">${esc(v)}</span><span class="s">${esc(s)}</span></div>`;
  const finishLine = () => {
    const step = DATA.race.milestone || 10000;
    return Math.max(step, (Math.floor(Math.max(0, ...racers.map((r) => r.words)) / step) + 1) * step);
  };

  // ---------- summary ----------
  function renderSummary() {
    const race = DATA.race;
    const total = racers.reduce((s, r) => s + r.words, 0);
    const week = racers.reduce((s, r) => s + Math.max(0, r.week), 0);
    const writing = racers.filter((r) => r.week > 0).length;
    const pages = total / race.words_per_page;
    const caterpillars = total / race.caterpillar_words;
    $("summary").innerHTML = [
      stat(n(total), "Words written", `by ${racers.length} ${racers.length === 1 ? "racer" : "racers"}`),
      stat(signed(week), "This week", `${writing} of ${racers.length} writing`),
      stat(`${n(caterpillars)} 🐛`, "Very Hungry Caterpillars", "worth of words, back to back"),
      stat(n(pages), "Pages, roughly", `${(pages / race.page_limit).toFixed(1)}× the ${race.page_limit}-page limit`),
    ].join("");
  }

  // ---------- orbit ----------
  function renderOrbit() {
    const field = sorted("words");
    const finish = finishLine();
    $("track-hint").textContent = T().hint(n(finish), n(DATA.race.milestone || 10000));
    const collider = SKIN === "collider";
    const lanes = Math.min(10, Math.max(4, field.length));
    const gap = lanes <= 6 ? 34 : 28, a0 = 210, b0 = 92;
    const rad = (i) => [a0 + (i + 0.5) * gap * 1.6, b0 + (i + 0.5) * gap];
    const W = 2 * (rad(lanes - 1)[0] + 30), H = 2 * (rad(lanes - 1)[1] + 40), cx = W / 2, cy = H / 2 - 6;
    // Fraction t of an anticlockwise lap, starting from the gate at the bottom.
    const at = ([a, b], t) => { const th = Math.PI / 2 - 2 * Math.PI * Math.min(t, 0.995); return [cx + a * Math.cos(th), cy + b * Math.sin(th)]; };
    let rings = "";
    for (let i = 0; i < lanes; i++) {
      const [a, b] = rad(i);
      rings += `<ellipse cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" class="o-band" stroke-width="${gap - 4}"/><ellipse cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" class="o-ring"/>`;
      rings += `<text x="${cx - 14}" y="${cy + b + 5}" class="o-num">${i + 1}</text>`;
    }
    const [, bIn] = rad(0), [, bOut] = rad(lanes - 1);
    const gate = `<rect x="${cx - 6}" y="${cy + bIn - gap / 2}" width="12" height="${bOut - bIn + gap}" fill="url(#chequer)" opacity="0.9" filter="url(#glow)"/>
      <text x="${cx}" y="${cy + bOut + gap / 2 + 20}" class="o-gate-label">${T().gate} · ${k(finish)} WORDS</text>`;
    const total = racers.reduce((s, r) => s + r.words, 0);
    const runners = field.map((r, i) => ({ r, ab: rad(i % lanes), t: r.words / finish }));
    $("orbit").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Racers orbiting a planet, positioned by word count">
      <defs>
        <pattern id="chequer" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><rect width="3" height="3" fill="#1b1040"/><rect x="3" y="3" width="3" height="3" fill="#1b1040"/></pattern>
        <radialGradient id="planet" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#d9b8ff"/><stop offset="0.45" stop-color="#8a4fe0"/><stop offset="1" stop-color="#2a1260"/></radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      ${rings}
      ${collider ? detector(cx, cy) : saturn(cx, cy)}
      ${gate}
      <text x="${cx}" y="${cy - (collider ? 88 : 78)}" class="o-sub">${n(total)} words between us</text>
      <g>${runners.map((o, i) => `<g class="o-runner" tabindex="0" aria-label="${esc(o.r.name)}, ${n(o.r.words)} words"><title>${esc(o.r.name)}${o.r.nickname ? ` (${esc(o.r.nickname)})` : ""}: ${n(o.r.words)} words</title><circle r="30" class="o-hit"/>${collider ? `<g transform="scale(1.3)"><g class="o-rot">${particleBody(kit(o.r), true)}</g></g>` : `<g class="o-float" style="animation-delay:-${(i * 0.7).toFixed(1)}s"><g transform="scale(1.15)">${astroBody(kit(o.r))}</g></g>`}<text class="o-name" y="-44">${esc(o.r.name)}</text>${o.r.nickname ? `<text class="o-nick" y="44">${esc(o.r.nickname)}</text>` : ""}</g>`).join("")}</g>
    </svg>`;
    const gs = [...$("orbit").querySelectorAll(".o-runner")];
    gs.forEach((g) => { const raise = () => g.parentNode.appendChild(g); g.addEventListener("mouseenter", raise); g.addEventListener("focus", raise); });
    const place = (f) => gs.forEach((g, i) => {
      const { ab, t } = runners[i];
      const [x, y] = at(ab, t * f);
      g.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      if (collider) { // point the particle's tail backwards along the beam
        const th = Math.PI / 2 - 2 * Math.PI * Math.min(t * f, 0.995);
        const ang = (Math.atan2(-ab[1] * Math.cos(th), ab[0] * Math.sin(th)) * 180) / Math.PI;
        g.querySelector(".o-rot").setAttribute("transform", `rotate(${ang.toFixed(1)})`);
      }
    });
    place(1);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    place(0);
    const tick = (now) => { const f = Math.min(1, (now - t0) / 2000); place(1 - (1 - f) ** 3); if (f < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }


  // Saturn: drifting cloud bands under a fixed shadow, with rocking, glittering rings.
  function saturn(cx, cy) {
    const R = 62, P = 124; // planet radius, band repeat length
    const bands = [[-44, "#e7cfff", 7], [-26, "#6b34c4", 9], [-8, "#c9a2ff", 6], [10, "#5a28ab", 11], [30, "#b88cff", 7], [46, "#4a1f92", 9]];
    const wave = (y, amp) => {
      let d = `M${cx - R - P} ${cy + y}`;
      for (let x = cx - R - P; x < cx + R + P; x += P / 2) d += `q${P / 4} ${amp} ${P / 2} 0`, (amp = -amp);
      return d;
    };
    const ringGroup = (inner) => `<g class="o-rings" style="transform-origin:${cx}px ${cy}px">${inner}</g>`;
    const rings = (half) => {
      const arc = (rx, ry) => (half === "back" ? `M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}` : `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`);
      return ringGroup(`<path d="${arc(150, 24)}" class="o-ring-a"/><path d="${arc(128, 20)}" class="o-ring-b"/><path d="${arc(140, 22)}" class="o-ring-glitter"/>`);
    };
    return `<defs>
        <clipPath id="planet-clip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
        <radialGradient id="planet-shade" cx="32%" cy="28%" r="80%"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0c0720" stop-opacity="0.85"/></radialGradient>
      </defs>
      ${rings("back")}
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#planet)"/>
      <g clip-path="url(#planet-clip)"><g class="o-bands">${bands.map(([y, c, w]) => `<path d="${wave(y, 3)}" stroke="${c}" stroke-width="${w}" fill="none" opacity="0.45"/>`).join("")}</g></g>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#planet-shade)"/>
      ${rings("front")}`;
  }

  // Collider: an end-on view of a detector, with a collision going off in the middle.
  function detector(cx, cy) {
    const oct = (r) => Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4 + Math.PI / 8; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
    const tracks = [[-60, 46, 18], [15, 52, -22], [100, 40, 14], [160, 58, -16], [215, 44, 26], [290, 50, -12], [330, 38, 20]]
      .map(([deg, len, bend]) => {
        const a = (deg * Math.PI) / 180, ex = cx + len * Math.cos(a), ey = cy + len * Math.sin(a);
        const mx = cx + (len / 2) * Math.cos(a) - bend * Math.sin(a) / 2, my = cy + (len / 2) * Math.sin(a) + bend * Math.cos(a) / 2;
        return `<path d="M${cx} ${cy} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" pathLength="1"/>`;
      }).join("");
    return `<g class="det">
        <polygon points="${oct(76)}" class="det-muon"/>
        <polygon points="${oct(68)}" class="det-muon2"/>
        <circle cx="${cx}" cy="${cy}" r="54" class="det-hcal"/>
        <circle cx="${cx}" cy="${cy}" r="40" class="det-ecal"/>
        <circle cx="${cx}" cy="${cy}" r="30" class="det-trk"/><circle cx="${cx}" cy="${cy}" r="22" class="det-trk"/><circle cx="${cx}" cy="${cy}" r="14" class="det-trk"/>
        <g class="det-burst">${tracks}</g>
        <circle cx="${cx}" cy="${cy}" r="3.5" class="det-ip"/>
      </g>`;
  }

  // Narrow screens: straight lanes instead of the orbit.
  function renderLanes() {
    const finish = finishLine();
    $("lanes").innerHTML = sorted("words").map((r, i) => {
      const x = Math.min(100, (100 * r.words) / finish);
      return `<div class="lane" role="listitem" aria-label="${esc(r.name)}, ${n(r.words)} words"><span class="lane-no">${i + 1}</span><div class="lane-run"><div class="runner${x > 60 ? " flip" : ""}" style="--x:${x.toFixed(1)}%"><span class="bib">${avatar(r, 28)}</span><span class="runner-name">${esc(r.name)}</span></div></div></div>`;
    }).join("");
  }

  // Everyone's racing nickname, picked from their thesis title.
  function renderCrew() {
    $("crew").innerHTML = sorted("words").map((r) => `<li><span class="crew-emo">${avatar(r, 40)}</span><span><span class="crew-nick">${esc(r.nickname || r.name)}</span><span class="crew-name">${esc(r.name)}</span></span></li>`).join("");
  }

  // ---------- leaderboard ----------
  function renderBoard() {
    const cat = DATA.race.caterpillar_words;
    const rows = sorted(sortKey).map((r, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td><div class="who"><span class="emo">${avatar(r, 30)}</span><span><span class="nm">${esc(r.name)}</span>${r.nickname ? `<span class="nick">${esc(r.nickname)}</span>` : ""}${r.note ? `<span class="note">“${esc(r.note)}”</span>` : ""}</span></div></td>
        <td class="r words">${n(r.words)}<span class="sub">${n(r.words / cat)} caterpillars</span></td>
        <td class="r"><span class="delta ${r.week > 0 ? "up" : r.week < 0 ? "down" : ""}">${signed(r.week)}</span></td>
        <td class="r">${r.streak ? `${r.streak} day${r.streak > 1 ? "s" : ""}${r.streak >= 5 ? " 🔥" : ""}` : "–"}</td>
        <td class="r hide-sm">${r.rate ? `${n(r.rate)}<span class="sub">words a day</span>` : "–"}</td>
        <td class="hide-sm">${r.milestoneEta ? `${k(r.nextMilestone)}<span class="sub">around ${nice(r.milestoneEta, longDate)}</span>` : `<span class="sub">needs a pace first</span>`}</td>
      </tr>`).join("");
    $("board").innerHTML = `<thead><tr><th></th><th>Racer</th><th class="r">Words</th><th class="r">This week</th><th class="r">Streak</th><th class="r hide-sm">Pace</th><th class="hide-sm">Next milestone</th></tr></thead><tbody>${rows}</tbody>`;
  }
  document.querySelectorAll("[data-sort]").forEach((b) =>
    b.addEventListener("click", () => {
      sortKey = b.dataset.sort;
      document.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderBoard();
    })
  );

  // ---------- crystal ball ----------
  function renderPredict() {
    const total = racers.reduce((s, r) => s + r.words, 0);
    const groupRate = racers.reduce((s, r) => s + r.rate, 0);
    const gStep = total >= 50000 ? 50000 : 10000;
    const gNext = (Math.floor(total / gStep) + 1) * gStep;
    const gEta = groupRate > 0 ? iso(new Date(+toDate(TODAY) + Math.ceil((gNext - total) / groupRate) * DAY)) : null;
    const nextUp = racers.filter((r) => r.milestoneEta).sort((a, b) => a.milestoneEta.localeCompare(b.milestoneEta))[0];
    const withProj = racers.filter((r) => r.proj);
    const bits = [];
    if (gEta) bits.push(stat(nice(gEta, longDate), `Group passes ${k(gNext)}`, `at ${n(groupRate)} words a day between us`));
    if (nextUp) bits.push(stat(nice(nextUp.milestoneEta, longDate), "Next milestone", `${nextUp.name} reaches ${k(nextUp.nextMilestone)}`));
    if (withProj.length) bits.push(stat(`~${k(withProj.reduce((s, r) => s + r.proj.mid, 0))}`, "Submitted words", `if all ${withProj.length} with a date keep this pace`));
    $("predict-headline").innerHTML = bits.join("");

    const field = sorted("words");
    const top = Math.max(1, ...field.map((r) => (r.proj ? r.proj.hi : r.words)));
    const step = niceStep(top / 5), end = Math.ceil(top / step) * step;
    const X = (v) => Math.min(100, (100 * v) / end);
    let axis = "";
    for (let v = 0; v <= end; v += step) axis += `<span class="pm" style="left:${X(v)}%">${k(v)}</span>`;
    const trail = (from, to) => `<span class="p-trail" style="left:${X(from)}%;width:${Math.max(0, X(to) - X(from))}%"></span>`;
    const rows = field.map((r) => {
      let lane = `<span class="p-now" style="width:${X(r.words)}%"></span><span class="p-today" style="left:${X(r.words)}%"></span>`, verdict;
      if (r.proj) {
        lane += `<span class="p-band" style="left:${X(r.proj.lo)}%;width:${Math.max(0.8, X(r.proj.hi) - X(r.proj.lo))}%"></span>${trail(r.words, r.proj.mid)}<span class="p-dot" style="left:${X(r.proj.mid)}%" title="${esc(r.name)}: about ${n(r.proj.mid)} words on ${nice(r.deadline, longDate)}">${avatar(r, 26)}</span>`;
        verdict = `<span class="p-when">~${n(r.proj.mid)}</span><span class="sub">by ${nice(r.deadline, longDate)}</span>`;
      } else if (r.milestoneEta) {
        lane += `${trail(r.words, r.nextMilestone)}<span class="p-dot" style="left:${X(r.nextMilestone)}%" title="${esc(r.name)}: ${n(r.nextMilestone)} words around ${nice(r.milestoneEta, longDate)}">${avatar(r, 26)}</span>`;
        verdict = `<span class="p-when">${k(r.nextMilestone)} by ${nice(r.milestoneEta)}</span><span class="sub">next milestone</span>`;
      } else {
        lane += `<span class="p-dot" style="left:${X(r.words)}%">${avatar(r, 26)}</span>`;
        verdict = `<span class="sub">No pace yet. A few days of writing and the crystal ball will speak.</span>`;
      }
      return `<div class="p-row"><span class="p-name">${esc(r.name)}</span><div class="p-lane">${lane}</div><div class="p-verdict">${verdict}</div></div>`;
    });
    $("predict").innerHTML = `<div class="p-key"><span><i class="k-now"></i>Written so far</span><span><i class="k-trail"></i>Predicted words still to come</span><span><i class="k-band"></i>Likely range on submission day</span><span>${SKIN === "collider" ? "⚛️" : "🧑‍🚀"} Where they'll be: on submission day, or at their next milestone if no date</span></div><div class="p-row p-axis"><span></span><div class="p-lane">${axis}</div><span></span></div>${rows.join("")}`;
  }
  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  }

  // ---------- chart ----------
  function renderChart() {
    const W = 860, H = 330, L = 56, R = 16, T = 12, B = 30;
    const all = racers.filter((r) => r.series.length);
    if (!all.length) { $("chart").innerHTML = '<p class="hint">The chart appears once someone logs a count.</p>'; return; }
    const first = all.map((r) => r.series[0][0]).sort()[0];
    const t0 = +toDate(first), t1 = Math.max(+toDate(TODAY), t0 + 7 * DAY);
    let ymax = Math.max(1, ...all.flatMap((r) => r.series.map(([, v]) => v)));
    const step = niceStep(ymax / 5);
    ymax = Math.ceil(ymax / step) * step;
    const X = (d) => L + ((+toDate(d) - t0) / (t1 - t0)) * (W - L - R);
    const Y = (v) => T + (1 - v / ymax) * (H - T - B);
    let g = "";
    for (let v = 0; v <= ymax + 1e-9; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${k(v)}</text>`;
    const spanDays = (t1 - t0) / DAY;
    for (let t = new Date(t0); +t <= t1; t = new Date(+t + DAY)) {
      const d = iso(t);
      if (spanDays > 70 ? d.endsWith("-01") : t.getUTCDay() === 1) g += `<text x="${X(d)}" y="${H - 8}" text-anchor="middle">${nice(d, spanDays > 70 ? { month: "short" } : { day: "numeric", month: "short" })}</text>`;
    }
    const lines = all.map((r) => {
      const [ld, lv] = r.series.at(-1);
      return `<path data-login="${esc(r.login)}" d="M${r.series.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join("L")}" stroke="${r.colour}"/><circle cx="${X(ld)}" cy="${Y(lv)}" r="3.5" fill="${r.colour}"/>`;
    }).join("");
    $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Word counts over time"><g>${g}</g><g class="lineset">${lines}</g><line class="cursor" y1="${T}" y2="${H - B}" visibility="hidden"/><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
    $("legend").innerHTML = all.map((r) => `<button type="button" data-login="${esc(r.login)}" style="--c:${r.colour}"><i></i>${esc(r.name)}</button>`).join("");

    const svg = $("chart").querySelector("svg"), set = svg.querySelector(".lineset"), cur = svg.querySelector(".cursor"), tip = $("tip");
    const focus = (login) => {
      set.classList.toggle("dim", !!login);
      set.querySelectorAll("path").forEach((p) => p.classList.toggle("hot", p.dataset.login === login));
    };
    $("legend").querySelectorAll("button").forEach((b) => {
      b.onmouseenter = b.onfocus = () => focus(b.dataset.login);
      b.onmouseleave = b.onblur = () => focus(null);
    });
    const hide = () => { tip.hidden = true; cur.setAttribute("visibility", "hidden"); };
    svg.onmousemove = (e) => {
      const box = svg.getBoundingClientRect();
      const sx = ((e.clientX - box.left) / box.width) * W;
      if (sx < L || sx > W - R) return hide();
      const day = iso(new Date(t0 + Math.round(((sx - L) / (W - L - R)) * (t1 - t0) / DAY) * DAY));
      cur.setAttribute("x1", X(day)); cur.setAttribute("x2", X(day)); cur.setAttribute("visibility", "visible");
      const rows = all.map((r) => [r, r.series.find(([d]) => d === day)]).filter(([, p]) => p).sort((a, b) => b[1][1] - a[1][1])
        .map(([r, [, v]]) => `<div class="row"><span style="color:${r.colour}">●</span><span style="flex:1">${esc(r.name)}</span><span>${n(v)}</span></div>`);
      tip.innerHTML = `<b>${nice(day, { weekday: "short", day: "numeric", month: "short" })}</b>${rows.join("") || "<div>No counts yet</div>"}`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = e.clientY + 14 + "px";
    };
    svg.onmouseleave = hide;
  }

  // ---------- awards ----------
  function renderAwards() {
    const best = (f) => racers.filter((r) => f(r) != null).sort((a, b) => f(b) - f(a))[0];
    const out = [];
    const add = (icon, title, r, why) => r && out.push(`<div class="award"><span class="icon" aria-hidden="true">${icon}</span><span class="t">${title}</span><span class="w">${esc(r.emoji || "")} ${esc(r.name)}${r.nickname ? `<span class="nick">${esc(r.nickname)}</span>` : ""}</span><span class="why">${why}</span></div>`);
    const far = best((r) => r.words || null);
    if (far) add(T().far[0], T().far[1], far, `${n(far.words)} words, or ${n(far.words / DATA.race.caterpillar_words)} hungry caterpillars`);
    const fast = best((r) => (r.week > 0 ? r.week : null));
    if (fast) add("☄️", "Fastest this week", fast, `${signed(fast.week)} words in seven days`);
    const st = best((r) => (r.streak > 1 ? r.streak : null));
    if (st) add("🔥", "Longest streak", st, `${st.streak} days in a row with new words`);
    const big = best((r) => (r.best && r.best[1] > 0 ? r.best[1] : null));
    if (big) add("🚀", "Biggest single day", big, `${signed(big.best[1])} on ${nice(big.best[0])}`);
    const knife = best((r) => (r.cut && r.cut[1] < 0 ? -r.cut[1] : null));
    if (knife) add("✂️", "The editor's knife", knife, `Cut ${n(-knife.cut[1])} words on ${nice(knife.cut[0])}. Brave.`);
    const steady = best((r) => (r.active30 > 2 ? r.active30 : null));
    if (steady) add(T().steady[0], T().steady[1], steady, `Wrote on ${steady.active30} of the last 30 days`);
    const near = racers.filter((r) => r.daysLeft > 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
    if (near) add("⏳", "Next to submit", near, `${near.daysLeft} days to go`);
    $("awards").innerHTML = out.join("") || '<p class="hint">Trophies appear once people start writing.</p>';
  }

  // ---------- heatmap ----------
  function renderHeat() {
    const byDay = {};
    for (const r of racers) for (const [d, v] of r.daily) if (v > 0) byDay[d] = (byDay[d] || 0) + v;
    const weeks = 26, end = toDate(TODAY);
    const startT = new Date(+end - ((weeks - 1) * 7 + ((end.getUTCDay() + 6) % 7)) * DAY); // a Monday
    const max = Math.max(1, ...Object.values(byDay));
    let html = "", lastMonth = "";
    for (let w = 0; w < weeks; w++) {
      const monday = new Date(+startT + w * 7 * DAY);
      const m = nice(iso(monday), { month: "short" });
      html += `<span class="m" style="grid-column:${w + 1}">${m !== lastMonth ? m : ""}</span>`;
      lastMonth = m;
      for (let d = 0; d < 7; d++) {
        const day = iso(new Date(+monday + d * DAY));
        const v = byDay[day] || 0;
        const style = `grid-column:${w + 1};grid-row:${d + 2};--a:${v ? (0.25 + 0.75 * Math.sqrt(v / max)).toFixed(2) : 0}`;
        html += day > TODAY ? `<span class="c empty" style="${style}"></span>` : `<span class="c${v ? " lit" : ""}" style="${style}" title="${nice(day, { weekday: "short", day: "numeric", month: "short" })}: ${v ? signed(v) + " words" : "no new words"}"></span>`;
      }
    }
    $("heat").innerHTML = html;
  }

  // ---------- background: starfield (space) or bubble-chamber photographs (collider) ----------
  function stars() {
    const c = $("stars"), ctx = c.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const collider = () => document.documentElement.dataset.skin === "collider";
    let W = 0, H = 0, pts = [], event = null, eventStart = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

    // Follow one charged particle through the magnetic field, dropping a bubble every few pixels.
    // q is the charge (which way it curls); loss shrinks the radius as it slows down, giving spirals.
    function trail(out, x, y, a, R, q, loss, steps) {
      const ds = 3.2;
      for (let i = 0; i < steps; i++) {
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20 || R < 3) break;
        out.push([x + gauss() * 0.5, y + gauss() * 0.5, 0.65 + Math.random() * 0.75]);
        if (q) a += (q * ds) / R;
        R *= 1 - loss;
        x += Math.cos(a) * ds; y += Math.sin(a) * ds;
      }
    }
    // One expansion of the chamber: a beam of straight tracks from the left, a couple of
    // interactions sprouting curved tracks, knock-on electrons spiralling in, and a neutral V decay.
    function newEvent() {
      const b = [];
      const beams = Math.round(rnd(5, 8)), y0 = H * rnd(0.22, 0.3), gap = rnd(16, 26), beamY = [];
      for (let i = 0; i < beams; i++) {
        const y = y0 + i * gap + gauss() * 4;
        beamY.push(y);
        trail(b, -10, y, rnd(-0.02, 0.02), 9e9, 0, 0, Math.ceil((W + 40) / 3.2));
      }
      const vertices = Math.random() < 0.5 ? 1 : 2;
      for (let v = 0; v < vertices; v++) {
        const vx = W * rnd(0.25, 0.7), vy = beamY[Math.floor(Math.random() * beamY.length)];
        for (let k = 0, n = Math.round(rnd(3, 7)); k < n; k++) trail(b, vx, vy, gauss() * 0.9, rnd(140, 900), Math.random() < 0.5 ? 1 : -1, rnd(0.0005, 0.003), Math.round(rnd(90, 320)));
        if (Math.random() < 0.7) { // a neutral particle flies off unseen, then decays into a V
          const a = gauss() * 0.8, d = rnd(50, 140), dx = vx + Math.cos(a) * d, dy = vy + Math.sin(a) * d;
          trail(b, dx, dy, a - 0.25, rnd(120, 320), 1, 0.002, Math.round(rnd(60, 160)));
          trail(b, dx, dy, a + 0.25, rnd(120, 320), -1, 0.002, Math.round(rnd(60, 160)));
        }
      }
      for (let k = 0, n = Math.round(rnd(3, 6)); k < n; k++) { // delta electrons curling into tight spirals
        const y = beamY[Math.floor(Math.random() * beamY.length)];
        trail(b, rnd(0.05, 0.95) * W, y, rnd(0, 6.28), rnd(14, 45), Math.random() < 0.5 ? 1 : -1, rnd(0.008, 0.02), 260);
      }
      return b;
    }
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const box = c.getBoundingClientRect();
      W = box.width; H = box.height;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: Math.round((W * H) / 5000) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() ** 3 * 1.6 + 0.3, p: Math.random() * 6.3, s: 0.4 + Math.random() * 1.2,
        h: Math.random() < 0.15 ? "255,213,107" : Math.random() < 0.3 ? "200,170,255" : "255,255,255",
      }));
      event = null;
    };
    const CYCLE = 4600; // bubbles grow, hang in the photo, fade, then the chamber expands again
    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      if (collider()) {
        const fade = Math.max(0, 1 - scrollY / 520);
        c.style.opacity = fade.toFixed(2);
        if (fade > 0) {
          if (!event || t - eventStart > CYCLE) { event = newEvent(); eventStart = t; }
          const age = still ? 1500 : t - eventStart;
          const grow = Math.min(1, age / 320), alpha = age < 3000 ? 1 : Math.max(0, 1 - (age - 3000) / 1100);
          if (age < 140 && !still) { ctx.fillStyle = `rgba(160,220,255,${(0.05 * (1 - age / 140)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); } // flash
          ctx.fillStyle = `rgba(200,236,255,${(0.4 * alpha).toFixed(2)})`;
          ctx.beginPath();
          for (const [x, y, r] of event) { ctx.moveTo(x + r * grow, y); ctx.arc(x, y, r * grow, 0, 6.283); }
          ctx.fill();
        }
      } else {
        c.style.opacity = "1";
        for (const s of pts) {
          const a = still ? 0.7 : 0.45 + 0.45 * Math.sin(s.p + (t / 1000) * s.s);
          ctx.fillStyle = `rgba(${s.h},${a.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
        }
      }
      if (!still) requestAnimationFrame(draw);
    };
    size();
    addEventListener("resize", () => { size(); if (still) draw(0); });
    new MutationObserver(() => { size(); if (still) draw(0); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] });
    if (still) addEventListener("scroll", () => draw(0), { passive: true });
    still ? draw(0) : requestAnimationFrame(draw);
  }

})();
