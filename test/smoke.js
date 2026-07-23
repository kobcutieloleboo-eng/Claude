// Headless smoke test: build a league and sim several full seasons in Node.
// Usage: node test/smoke.js [seasons]
const FGM = require("../js/engine.js");

const seasons = parseInt(process.argv[2] || "3", 10);
let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error("  ✗ FAIL:", msg); }
}

FGM.newLeague(0);
const s = FGM.state;
check(s.teams.length === 20, "20 teams at start");
check(Object.keys(s.players).length >= 380, `player pool populated (${Object.keys(s.players).length})`);
check(s.schedule.length === 38, "38 rounds scheduled");
for (const round of s.schedule) {
  check(round.length === 10, "10 matches per round");
}
// every team plays every round
const seen = {};
for (const m of s.schedule[0]) { seen[m.home] = 1; seen[m.away] = 1; }
check(Object.keys(seen).length === 20, "all 20 teams play in round 1");
// each team has a valid XI
for (const t of s.teams) {
  const xi = FGM.bestXI(t.tid);
  check(xi.every(sl => sl.player), `${t.name} fields a full XI`);
  check(xi[0].player.pos === "GK", `${t.name} has a GK in goal`);
}

for (let i = 0; i < seasons; i++) {
  const season = s.season;
  FGM.simRounds(38);
  check(s.phase === "offseason", `season ${season}: reached offseason`);
  const table = FGM.standings();
  check(table.every(r => r.p === 38), `season ${season}: every team played 38`);
  const totalPts = table.reduce((sum, r) => sum + r.pts, 0);
  check(totalPts >= 380 * 2 && totalPts <= 380 * 3, `season ${season}: sane points total (${totalPts})`);
  const champ = table[0];
  const boot = FGM.leaders("goals", 1)[0];
  const gf = table.reduce((sum, r) => sum + r.gf, 0);
  console.log(`Season ${FGM.seasonLabel(season)}: 🏆 ${champ.name} (${champ.pts} pts) · ⚽ ${gf} goals (${(gf / 380).toFixed(2)}/match) · 👟 ${boot.name} ${boot.stats.goals}g in ${boot.stats.apps} apps`);
  check(gf / 380 > 1.7 && gf / 380 < 4.0, `goals per match realistic (${(gf / 380).toFixed(2)})`);
  check(boot.stats.goals >= 12 && boot.stats.goals <= 55, `golden boot total sane (${boot.stats.goals})`);
  check(s.history.length === i + 1, "history recorded");

  const ok = FGM.advanceToNextSeason();
  check(ok, "advanced to next season");
  check(s.teams.length === 20, `still 20 teams after promotion/relegation (${s.teams.length})`);
  check(s.season === season + 1, "season incremented");
  check(s.round === 0 && s.phase === "season", "new season ready");
  const tids = new Set(s.teams.map(t => t.tid));
  check(tids.size === 20, "team ids unique");
  for (const t of s.teams) {
    const n = FGM.teamPlayers(t.tid).length;
    check(n >= 14 && n <= 40, `${t.name} squad size sane (${n})`);
    const xi = FGM.bestXI(t.tid);
    check(xi.filter(sl => sl.player).length >= 10, `${t.name} can field a team`);
  }
  // user team never relegated
  check(s.teams.some(t => t.tid === s.userTid), "user team still in league");
}

// Transfers: user buys a listed/valued player
const user = FGM.teamById(s.userTid);
user.budget = 500;
const target = FGM.allActivePlayers().filter(p => p.tid !== s.userTid && p.tid >= 0)[0];
const res = FGM.userBuy(target.pid);
check(res.ok, `user can buy a player (${res.msg})`);
check(target.tid === s.userTid, "player moved to user team");

// Persistence round-trip
const json = FGM.exportJSON();
FGM.importJSON(json);
check(FGM.state.season === s.season, "export/import round-trip");

// Career history sanity
const withCareer = FGM.allActivePlayers().filter(p => p.career.length >= seasons - 1);
check(withCareer.length > 100, `career histories recorded (${withCareer.length} players)`);
const retired = Object.values(FGM.state.players).filter(p => p.retired);
console.log(`After ${seasons} seasons: ${Object.keys(FGM.state.players).length} players in DB, ${retired.length} retired, ${FGM.freeAgents().length} free agents.`);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll smoke checks passed ✔");
