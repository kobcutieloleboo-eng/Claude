# ⚽ Football GM

A **Basketball GM–style management sim for soccer** — real clubs, real players, real career arcs, and the same "just open it and sim" convenience. No build step, no server, no account: open `index.html` in a browser and manage.

![Made with vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![No dependencies](https://img.shields.io/badge/dependencies-none-green)

## Play it

```bash
git clone <this repo>
cd <repo>
# then just open index.html, or serve it:
python3 -m http.server 8000   # → http://localhost:8000
```

Pick one of the 20 real 2025-26 Premier League clubs and go. The game autosaves to your browser after every action.

## What's in the box

**Real players & teams**
- All 20 Premier League clubs from the 2025-26 season with hand-rated squads (~430 real players: rating, potential, age, position, nationality), reflecting the summer 2025 transfer window (Wirtz & Isak at Liverpool, Gyökeres at Arsenal, Sesko at United, …)
- A pool of real EFL clubs (Leicester, Southampton, Sheffield United, …) that rotate up via promotion/relegation

**Real career trajectories**
- Players develop along age curves toward their potential — teenagers bloom, players peak in their late 20s, decline in their 30s (keepers age slower), and retire
- Season-by-season career history on every player page: club, apps, goals, assists, rating year over year
- Youth academies produce new prospects every season with nationality-appropriate names — including the occasional wonderkid

**BBGM-style convenience**
- Play menu: sim next match, a matchday, a month, or the whole season in one click
- Sortable tables everywhere; every player and club name is clickable
- Autosave to localStorage + JSON export/import for backups
- God mode: switch clubs anytime from Settings

**The full management loop**
- Poisson-based match engine driven by best-XI attack/defense ratings, with scorers, assists, clean sheets, and injuries
- League table with form guide, fixtures & results with match detail, stat leaders
- Transfer market: buy anyone for the right price, transfer-list players to attract AI bids, sign free agents, contract extensions, January + summer windows, AI clubs squad-build on their own
- Finances: transfer budgets, wage bills, prize money by league finish
- End-of-season awards (Golden Boot, Playmaker, Golden Glove, Player & Young Player of the Season) and a permanent league history
- Promotion & relegation with real Championship clubs (your club is protected from the drop — the board "finds a way")

## Project layout

```
index.html        app shell
css/style.css     dark BBGM-inspired UI
js/players.js     real teams + hand-rated 2025-26 player database
js/names.js       name pools by nationality for youth regens
js/engine.js      game engine (sim, development, transfers) — DOM-free
js/app.js         views, routing, actions
test/smoke.js     headless multi-season simulation test
```

## Testing

The engine runs headless under Node:

```bash
node test/smoke.js 5   # simulate 5 full seasons, verify invariants
```

Checks schedule integrity, realistic goal rates (~2.5–2.9/match), sane champion point totals, promotion/relegation bookkeeping, transfers, persistence round-trips, and career-history recording.

## Roadmap ideas

- Cup competitions (FA Cup, Champions League group → knockout)
- Formation/tactics choices (4-4-2, 3-5-2, pressing intensity)
- Live match ticker with minute-by-minute events
- Multiple leagues (La Liga, Serie A, Bundesliga) and cross-league transfers
- Back-filled pre-2025 career histories for real players

---

*Ratings and squad data are the author's editorial estimates for a fan-made, free simulation game. Inspired by the wonderful [Basketball GM](https://basketball-gm.com/).*
