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

**Real players & teams — five playable leagues**
- Premier League, La Liga, Serie A, Bundesliga and Ligue 1, all with hand-rated real 2025-26 squads (~1,100 real players), reflecting the summer 2025 window (Wirtz & Isak at Liverpool, Mbappé's Madrid, Kane's Bayern, …)
- ~30 more real clubs in non-playable leagues (Porto, Ajax, Galatasaray, Al Nassr with Ronaldo, Inter Miami with Messi, Neymar's Santos, …) that hold real players, join the Champions League, and sell to anyone — the whole world is your transfer market
- Per-league promotion/relegation with pools of real lower-division clubs

**European competitions — Champions League & Europa League**
- **Champions League**: 32 teams — top four from each playable league plus Europe's best non-playable clubs
- **Europa League**: a second 32-team competition for the next tier down (league finishers 5th–7th plus the clubs that missed the CL), with its own winner, prize money and history
- Real format feel: 8 groups of 4 played midweek between league rounds, then R16 → final (single-leg knockouts) in both competitions — a club only ever plays one of the two
- Every group-stage and knockout tie is **watchable** in the live match viewer, and goals scored in Europe count toward a player's season and career totals

**International tournaments**
- A **World Cup, Euros or Copa América every summer** on a real 4-year cadence, contested by national teams built from your world's players; single-elim knockout with a winner, runner-up and Golden Ball
- Real past winners are pre-filled (World Cups 2002–2022, Euros, Copa América) so icons carry their real international titles

**Trophies in every player's cabinet**
- Player profiles now separate **Trophies** (Champions Leagues, league titles, domestic cups, World Cups & continental titles) from **Individual awards** — real ones won before your save *and* every trophy won in your game
- Reconstructed from real career histories: 2025 Messi shows 10 La Liga titles, 4 Champions Leagues, a World Cup and 2 Ligue 1 titles; Iniesta his Euros + World Cup, and so on

**Accolades & the record books**
- A dedicated **Season Review** page: the full year-end ceremony in one place — Ballon d'Or podium, the summer international tournament, all five league champions, a **Golden Boot and Player of the Season for every league**, global awards, cup winners and the FIFPRO World XI
- End-of-season **Ballon d'Or** (with a three-man podium), **FIFPRO World XI**, per-league **Golden Boots** & **Players of the Season**, **European Golden Boot**, a **Champions League Golden Boot** and **Europa League Golden Boot**, **Yashin Trophy** (best keeper), **Golden Boy** (best U21) and Playmaker award
- Real historical honours pre-filled: every real Ballon d'Or, Golden Boot, Champions League winner and league champion from 2000 up to your start season, shown in a "record books" table
- Every player's profile lists their honours (real ones earned before your save, plus any they win in your world)

**Domestic cups — every league**
- FA Cup & EFL Cup (England), Copa del Rey (Spain), Coppa Italia (Italy), DFB-Pokal (Germany), Coupe de France (France)
- Seeded single-elimination knockouts played midweek; top seeds get a first-round bye, draws settled on penalties, winners banked in history and club budgets

**Era starts: play from any season back to 2000**
- Start in 2000 and manage prime Zidane, Henry, Ronaldinho, Maldini, Buffon — 200+ hand-added legends with real career timelines
- Real debuts fire on schedule: start in 2000 and Cristiano Ronaldo breaks through at Sporting in 2002, Messi at Barça in 2004…
- Real transfers follow history too (Zidane joins Madrid in 2001) — until *you* change history by signing someone first. If history says a player joins *your* club, he agitates for the move and you get first refusal.

**Career trajectories**
- Players develop along age curves toward their potential — teenagers bloom, players peak in their late 20s, decline in their 30s (keepers age slower), and retire
- Season-by-season career history on every player page: club, apps, goals, assists, rating year over year
- Youth academies produce new prospects every season with nationality-appropriate names — including the occasional wonderkid

**BBGM-style convenience**
- Play menu: sim a week, a month, or the whole season in one click — with W/D/L result notifications after every simmed week
- Mobile-friendly: bottom tab bar, touch-sized controls, responsive tables
- Sortable tables everywhere; every player and club name is clickable
- Autosave to localStorage + JSON export/import for backups
- God mode: switch clubs anytime from Settings

**The full management loop**
- Poisson-based match engine driven by best-XI attack/defense ratings, with scorers, assists, clean sheets, and injuries
- **Live match viewer**: "Watch next match" plays your game out minute-by-minute with a running clock, progress bar and goal-by-goal feed (skippable) — and any match, including Champions League, Europa League and domestic-cup ties, can be replayed live from its match page. Knockout ties level after 90 go to a **penalty shootout you can watch kick-by-kick**, with the full sequence saved to the match report
- **Realistic hierarchy & dominance**: goals concentrate on each team's genuine focal point — a prime Messi, Ronaldo or Haaland is his side's talisman and racks up 50-70+ across all competitions, while ordinary players don't — and knockout ties reward class, so a dominant club rarely gets upset by a clearly weaker one over a single leg
- **Contract negotiations**: signings and renewals are multi-round talks — the player names wage + length demands, you counter with steppers, they soften or walk; lowball too hard and the deal collapses
- **Performance-based development, every season**: ratings rise and fall on how a player actually did that year, relative to what's expected for their rating & position — a striker who bangs in 30 climbs, a benched veteran slips, career years can nudge past potential — applied for all seasons, not just the first
- **Wage budgets**: every club has a weekly wage cap alongside its transfer budget; signings and renewals draw against it and are blocked if they breach it (shown live in the negotiation and on the Finances page)
- **Era-scaled economy**: transfer fees, wages and budgets inflate ~7%/yr, so a 2000 save runs on 2000 money (no £300m release clauses back then) and future seasons keep inflating — and transfer budgets are scaled to match the prices, so a top club can actually afford a galáctico (Real Madrid open 2025-26 on ~£480m) while budgets stay anchored to each club's stature rather than compounding forever
- **Search every player**: a dedicated search page finds anyone in the world by name — active, on loan abroad, a free agent, or retired
- Transfer market: buy anyone in the world after agreeing a fee and terms, transfer-list players to attract AI bids, sign free agents, January + summer windows, AI clubs squad-build on their own
- Finances: transfer budgets, wage bills, prize money by league finish
- End-of-season awards (Golden Boot, Playmaker, Golden Glove, Player & Young Player of the Season) and a permanent league history
- Promotion & relegation with real Championship clubs (your club is protected from the drop — the board "finds a way")

## Project layout

```
index.html        app shell
css/style.css     dark BBGM-inspired UI (desktop + mobile)
js/players.js     Premier League 2025-26 squads + EFL promotion pool
js/leagues1.js    La Liga & Serie A squads + pools
js/leagues2.js    Bundesliga & Ligue 1 squads + pools
js/world.js       non-playable-league clubs (transfer market + CL guests)
js/legends.js     200+ legends with career stints; career paths for modern players
js/names.js       name pools by nationality for generated players
js/engine.js      game engine (world, CL, sim, development, transfers) — DOM-free
js/app.js         views, routing, actions
test/smoke.js     headless multi-season + era-start simulation test
```

## Testing

The engine runs headless under Node:

```bash
node test/smoke.js 5   # simulate 5 full seasons, verify invariants
```

Checks league/schedule integrity across all five leagues, realistic goal rates, Champions League completion, promotion/relegation bookkeeping, cross-league transfers, persistence round-trips — plus an era-start scenario asserting Zidane starts 2000 at Juve and follows history to Madrid, and that Messi and Ronaldo debut on schedule.

## Roadmap ideas

- Formation/tactics choices (4-4-2, 3-5-2, pressing intensity)
- Live match ticker with minute-by-minute events
- Two-legged Champions League knockouts, coefficient-based qualification
- Deeper era data (more legends, back-filled pre-start career stats)

---

*Ratings and squad data are the author's editorial estimates for a fan-made, free simulation game. Inspired by the wonderful [Basketball GM](https://basketball-gm.com/).*
