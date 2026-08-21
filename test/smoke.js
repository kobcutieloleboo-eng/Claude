// Headless smoke test v2: multi-league world, Champions League, era starts.
// Usage: node test/smoke.js [seasons]
const FGM = require("../js/engine.js");
const Art = require("../js/crests.js");

const seasons = parseInt(process.argv[2] || "3", 10);
let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error("  ✗ FAIL:", msg); }
}

// ============ Modern start (2025) ============
FGM.newLeague(2025, "EPL", "ARS");
let s = FGM.state;
check(FGM.leagueTeams("EPL").length === 20, "EPL has 20 teams");
check(FGM.leagueTeams("LIGA").length === 20, "La Liga has 20 teams");
check(FGM.leagueTeams("SA").length === 20, "Serie A has 20 teams");
check(FGM.leagueTeams("BL").length === 18, "Bundesliga has 18 teams");
check(FGM.leagueTeams("L1").length === 18, "Ligue 1 has 18 teams");
check(FGM.leagueTeams("FOR").length >= 25, `foreign market clubs present (${FGM.leagueTeams("FOR").length})`);
check(Object.keys(s.players).length > 1400, `player pool populated (${Object.keys(s.players).length})`);
check(FGM.clParticipants().length === 32, "32 CL participants");
check(FGM.teamById(s.userTid).abbrev === "ARS", "user club is Arsenal");
for (const t of s.teams) {
  const xi = FGM.bestXI(t.tid);
  check(xi.filter(sl => sl.player).length === 11, `${t.name} fields a full XI`);
  check(!xi[0].player || xi[0].player.pos === "GK", `${t.name} has a GK in goal`);
}
// ---- Crests & competition emblems ----
{
  let bad = 0, unescaped = 0, noColor = 0;
  for (const t of s.teams) {
    const svg = Art.clubCrest(t, 40);
    if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) bad++;
    // Club names carry ampersands ("Brighton & Hove Albion") and they land in an
    // aria-label, so they must arrive escaped.
    if (/aria-label="[^"]*&(?!amp;|lt;|gt;|quot;)/.test(svg)) unescaped++;
    if (svg.indexOf(t.colors[0]) === -1) noColor++;
  }
  check(bad === 0, `every club renders a crest (${bad} malformed)`);
  check(unescaped === 0, `crest labels are escaped (${unescaped} raw)`);
  check(noColor === 0, `crests use the club's own colours (${noColor} missing)`);
  // Below the text threshold the three-letter code is dropped; above it, kept.
  const t0 = s.teams[0];
  check(Art.clubCrest(t0, 16).indexOf("<text") === -1, "tiny crests omit the club code");
  check(Art.clubCrest(t0, 40).indexOf(t0.abbrev) !== -1, "large crests carry the club code");
  check(Art.clubCrest(null, 40) === "", "a missing club renders nothing rather than throwing");

  // Every crest relies on the one shared clipPath the page defines.
  check(Art.SHIELD_DEFS.indexOf('id="fgmShield"') !== -1, "shared shield clipPath is defined");
  check(Art.clubCrest(t0, 40).indexOf('url(#fgmShield)') !== -1, "crests reference the shared clipPath");
  const html = require("fs").readFileSync(__dirname + "/../index.html", "utf8");
  check(html.indexOf('id="fgmShield"') !== -1, "index.html ships the shield clipPath");
  check(html.indexOf(Art.SHIELD) !== -1, "page clipPath matches the path crests are drawn to");

  for (const id of ["EPL", "LIGA", "SA", "BL", "L1", "UCL", "UEL"]) {
    check(Art.hasEmblem(id), `${id} has an emblem`);
    check(Art.compEmblem(id, 30).startsWith("<svg"), `${id} emblem renders`);
  }
  check(Art.compEmblem("FAC", 30) === "", "competitions without an emblem render nothing");
  check(FGM.LEAGUE_DEFS.every(d => Art.hasEmblem(d.id)), "every playable league has an emblem");
}

// ---- Formations & tactics ----
{
  for (const f of FGM.FORMATIONS) {
    check(f.slots.length === 11, `${f.id}: 11 slots`);
    const flat = f.rows.flat().sort((a, b) => a - b);
    check(flat.length === 11 && flat.every((v, i) => v === i), `${f.id}: pitch rows cover every slot exactly once`);
    check(f.slots[0] === "GK", `${f.id}: slot 0 is the keeper`);
    check(FGM.bestXI(s.userTid, f.id).filter(sl => sl.player).length === 11, `${f.id}: user fields a full XI`);
  }
  // Shape must actually change who plays where.
  const back5 = FGM.bestXI(s.userTid, "5-3-2").filter(sl => sl.slot === "CB").length;
  check(back5 === 3, `5-3-2 fields three centre backs (${back5})`);
  check(FGM.bestXI(s.userTid, "4-3-3").filter(sl => sl.slot === "CB").length === 2, "4-3-3 fields two centre backs");

  // bestXI must prefer a specialist over a higher-rated player out of position:
  // every outfielder should be in a slot he fits at least reasonably well.
  const xi433 = FGM.bestXI(s.userTid, "4-3-3");
  const worst = Math.min(...xi433.filter(sl => sl.player).map(sl => sl.eff / sl.player.ovr));
  check(worst > 0.8, `no badly misplaced player in the XI (worst fit ${(worst * 100).toFixed(0)}%)`);

  // Tactics round-trip and clamp unknown values back to something valid.
  FGM.setTactics(s.userTid, { formation: "3-4-3", mentality: "attacking", press: "high" });
  check(FGM.tacticsFor(s.userTid).formation === "3-4-3", "tactics persist");
  FGM.setTactics(s.userTid, { formation: "nonsense", mentality: "nonsense", press: "nonsense" });
  const t2 = FGM.tacticsFor(s.userTid);
  check(t2.formation === "4-3-3" && t2.mentality === "balanced" && t2.press === "medium", "bad tactics fall back to defaults");
  // Saves written before tactics existed have no field at all.
  delete FGM.teamById(s.userTid).tactics;
  check(FGM.tacticsFor(s.userTid).formation === "4-3-3", "missing tactics default cleanly (old saves)");

  // Mentality has to move the match numbers in the direction it claims.
  const balanced = FGM.teamRatings(s.userTid);
  FGM.setTactics(s.userTid, { mentality: "allout" });
  const gung = FGM.teamRatings(s.userTid);
  check(gung.attAdj > balanced.attAdj && gung.defAdj < balanced.defAdj, "all-out attack trades defence for attack");
  FGM.setTactics(s.userTid, { mentality: "balanced" });

  check(s.teams.filter(t => t.tactics && t.tactics.formation).length === s.teams.length, "every club starts with a shape");
  const shapes = new Set(s.teams.map(t => FGM.tacticsFor(t.tid).formation));
  check(shapes.size >= 3, `AI clubs vary their shapes (${shapes.size} in use)`);
}

// duplicate real-player check
{
  const names = {};
  let dupes = 0;
  for (const p of FGM.allActivePlayers()) { if (names[p.name]) dupes++; names[p.name] = 1; }
  check(dupes < 8, `few duplicate names (${dupes})`); // real name collisions only (two Nico Gonzálezes etc.)
}

for (let i = 0; i < seasons; i++) {
  const season = s.season;
  const results = FGM.simWeeks(38);
  check(results.length === 38, "simmed 38 weeks");
  check(s.phase === "offseason", `season ${season}: reached offseason`);
  const userWeeks = results.filter(r => r.length > 0).length;
  check(userWeeks >= 36, `user gets matches most weeks (${userWeeks})`);
  for (const def of FGM.LEAGUE_DEFS) {
    const table = FGM.standings(def.id);
    const n = table.length;
    check(table.every(r => r.p === (n - 1) * 2), `${def.id}: full round robin played`);
  }
  const gf = FGM.standings("EPL").reduce((sum, r) => sum + r.gf, 0);
  check(gf / 380 > 2.0 && gf / 380 < 3.6, `EPL goals/match realistic (${(gf / 380).toFixed(2)})`);
  check(s.cl && s.cl.winner !== null, "CL has a winner");
  check(s.el && s.el.winner !== null, "Europa League has a winner");
  check(FGM.elParticipants().length === 32, "32 Europa League participants");
  check(FGM.clParticipants().filter(t => FGM.elParticipants().includes(t)).length === 0, "no club is in both CL and EL");
  const lastH = s.history[s.history.length - 1];
  check(lastH.clBoot && lastH.clBoot.value > 0, "CL Golden Boot recorded");
  check(lastH.elBoot && lastH.elBoot.value > 0, "EL Golden Boot recorded");
  // Domestic cups: all 6 resolve to a winner every season
  const cupHist = s.history[s.history.length - 1].cups;
  check(cupHist && cupHist.length === 6, `all 6 domestic cups completed (${cupHist ? cupHist.length : 0})`);
  check(cupHist.every(c => c.winner && c.winner !== "—"), "every cup has a real winner");
  check(cupHist.some(c => c.id === "FAC") && cupHist.some(c => c.id === "COPPA"), "FA Cup and Coppa Italia both present");
  const clT = FGM.teamById(s.cl.winner);
  const boot = FGM.leaders("goals", 1)[0];
  console.log(`Season ${FGM.seasonLabel(season)}: EPL 🏆 ${FGM.standings("EPL")[0].name} · UCL 🏆⭐ ${clT ? clT.name : "?"} · 👟 ${boot.name} ${boot.stats.goals}g`);
  check(FGM.advanceToNextSeason(), "advanced to next season");
  check(FGM.leagueTeams("EPL").length === 20 && FGM.leagueTeams("BL").length === 18, "league sizes stable after pro/rel");
  check(s.teams.some(t => t.tid === s.userTid), "user team still in league");
  check(FGM.clParticipants().length === 32, "next CL drawn");
  check(FGM.elParticipants().length === 32, "next EL drawn");
}

// Transfers + persistence
const user = FGM.teamById(s.userTid);
user.budget = 500;
const target = FGM.allActivePlayers().filter(p => p.tid !== s.userTid && p.tid >= 0 && FGM.teamById(p.tid).league === "FOR" && FGM.teamPlayers(p.tid).length > 16)[0];
const res = FGM.userBuy(target.pid);
check(res.ok, `user can buy from a foreign club (${res.msg})`);
const json = FGM.exportJSON();
FGM.importJSON(json);
check(FGM.state.season === s.season, "export/import round-trip");
const foreignCareers = FGM.allActivePlayers().filter(p => { const t = FGM.teamById(p.tid); return t && t.league === "FOR" && p.career.length > 0 && p.career[p.career.length - 1].apps > 0; });
check(foreignCareers.length > 50, `foreign players get career stats (${foreignCareers.length})`);

// ============ Era start (2000) ============
FGM.newLeague(2000, "EPL", "MUN");
s = FGM.state;
const findP = name => Object.values(s.players).find(p => p.name === name && !p.retired);
const zidane = findP("Zinedine Zidane");
check(zidane && FGM.teamAbbrev(zidane.tid) === "JUV", `2000: Zidane at Juventus (${zidane ? FGM.teamAbbrev(zidane.tid) : "missing"})`);
const henry = findP("Thierry Henry");
check(henry && FGM.teamAbbrev(henry.tid) === "ARS", "2000: Henry at Arsenal");
const shearer = findP("Alan Shearer");
check(shearer && FGM.teamAbbrev(shearer.tid) === "NEW", "2000: Shearer at Newcastle");
check(!findP("Lionel Messi"), "2000: Messi not yet in world");
check(!findP("Cristiano Ronaldo"), "2000: CR7 not yet in world");
check(s.futureDebuts.some(d => d.name === "Lionel Messi" && d.year === 2004 && d.club === "BAR"), "Messi debut scheduled 2004 @ BAR");
check(s.futureDebuts.some(d => d.name === "Cristiano Ronaldo"), "CR7 debut scheduled");
check(s.futureDebuts.length > 300, `future debuts scheduled (${s.futureDebuts.length})`);
for (const t of s.teams) {
  check(FGM.bestXI(t.tid).filter(sl => sl.player).length === 11, `2000: ${t.name} fields a full XI`);
}

// Sim 2000 → 2005 and watch the kids arrive
for (let i = 0; i < 5; i++) { FGM.simWeeks(38); FGM.advanceToNextSeason(); }
check(s.season === 2005, `reached 2005 (${s.season})`);
const messi = findP("Lionel Messi");
check(messi, "2005: Messi has debuted");
if (messi) {
  check(messi.age === 2005 - 1987, `Messi age correct (${messi.age})`);
  check(messi.pot >= 95, `Messi potential world-class (${messi.pot})`);
  console.log(`2005: Messi is ${messi.age}, ovr ${messi.ovr}, pot ${messi.pot}, at ${FGM.teamAbbrev(messi.tid)}`);
}
const cr7 = findP("Cristiano Ronaldo");
check(cr7, "2005: CR7 has debuted");
if (cr7) {
  // User manages MUN, so history's CR7→United move becomes an "agitating to join you" prompt.
  const ok = FGM.teamAbbrev(cr7.tid) === "MUN" || cr7.agitateFor === s.userTid;
  check(ok, `2005: CR7 at MUN or agitating to join user's MUN (${FGM.teamAbbrev(cr7.tid)}, agitate=${cr7.agitateFor})`);
  console.log(`2005: CR7 is ${cr7.age}, ovr ${cr7.ovr}, pot ${cr7.pot}, at ${FGM.teamAbbrev(cr7.tid)}${cr7.agitateFor !== undefined ? " (pushing to join you)" : ""}`);
}
const zz = Object.values(s.players).find(p => p.name === "Zinedine Zidane");
check(zz, "Zidane still in DB (playing or retired)");
if (!zz.retired) check(FGM.teamAbbrev(zz.tid) === "RMA", `2005: Zidane followed history to Real Madrid (${FGM.teamAbbrev(zz.tid)})`);
console.log(`2005: Zidane ${zz.retired ? "retired" : `ovr ${zz.ovr} at ${FGM.teamAbbrev(zz.tid)}`}, career rows: ${zz.career.length}`);
check(s.history.length === 5, "5 seasons of history");
check(s.history.every(h => h.champions.EPL && h.clWinner !== undefined), "history has champions + CL");

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll smoke checks passed ✔");
