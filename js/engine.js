// Football GM engine — league state, match sim, player development, transfers.
// No DOM dependencies: also runs headless under Node for testing.

/* global START_SEASON, REAL_TEAMS, PROMOTION_POOL, NAME_POOLS, randomNationality, randomName */

(function (root) {
"use strict";

if (typeof module !== "undefined" && typeof require !== "undefined") {
  const n = require("./names.js");
  const d = require("./players.js");
  root.NAME_POOLS = n.NAME_POOLS; root.randomNationality = n.randomNationality; root.randomName = n.randomName;
  root.START_SEASON = d.START_SEASON; root.REAL_TEAMS = d.REAL_TEAMS; root.PROMOTION_POOL = d.PROMOTION_POOL;
}

const ROUNDS = 38;
const SAVE_KEY = "footballGM_save_v1";

// ---------- RNG ----------
let rngState = Date.now() >>> 0;
function rand() { // mulberry32
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ri(a, b) { return a + Math.floor(rand() * (b - a + 1)); } // inclusive
function choice(arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L && k < 12);
  return k - 1;
}
function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- Positions ----------
const POS_GROUP = { GK: "GK", CB: "DF", LB: "DF", RB: "DF", DM: "MF", CM: "MF", AM: "MF", LW: "FW", RW: "FW", ST: "FW" };
const FORMATION_433 = ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "AM", "RW", "ST", "LW"];
const POS_FIT = {
  GK: { GK: 1 },
  RB: { RB: 1, LB: 0.9, CB: 0.85, DM: 0.7, RW: 0.7 },
  LB: { LB: 1, RB: 0.9, CB: 0.85, LW: 0.7, DM: 0.7 },
  CB: { CB: 1, RB: 0.85, LB: 0.85, DM: 0.85 },
  DM: { DM: 1, CM: 0.92, CB: 0.82, RB: 0.7, LB: 0.7 },
  CM: { CM: 1, DM: 0.92, AM: 0.92 },
  AM: { AM: 1, CM: 0.92, LW: 0.87, RW: 0.87, ST: 0.82 },
  LW: { LW: 1, RW: 0.95, AM: 0.88, ST: 0.86, LB: 0.6 },
  RW: { RW: 1, LW: 0.95, AM: 0.88, ST: 0.86, RB: 0.6 },
  ST: { ST: 1, LW: 0.85, RW: 0.85, AM: 0.8 },
};
function fit(slot, pos) {
  if (slot === pos) return 1;
  const m = POS_FIT[slot];
  if (m && m[pos] !== undefined) return m[pos];
  if (pos === "GK" || slot === "GK") return 0.3;
  return 0.65;
}

// ---------- State ----------
let state = null;

function newPid() { return state.nextPid++; }

function wageFor(ovr) { return Math.max(5, Math.round(1.4 * Math.pow(1.125, ovr - 50))); } // £k/week

function playerValue(p) {
  let v = 0.35 * Math.pow(1.155, p.ovr - 50);
  const a = p.age;
  let m;
  if (a <= 21) m = 1.5; else if (a <= 24) m = 1.35; else if (a <= 27) m = 1.15;
  else if (a <= 29) m = 1.0; else if (a <= 31) m = 0.6; else if (a <= 33) m = 0.35; else m = 0.18;
  v *= m;
  if (a <= 23 && p.pot > p.ovr) v *= 1 + (p.pot - p.ovr) * 0.035;
  return Math.max(0.1, Math.round(v * 10) / 10);
}

function makePlayer(name, pos, age, ovr, pot, natl, tid, opts) {
  opts = opts || {};
  const p = {
    pid: newPid(), name, pos, age, natl, ovr, pot: Math.max(pot, ovr), tid,
    wage: wageFor(ovr), years: opts.years || ri(1, 4),
    listed: false, injury: 0, youth: !!opts.youth, retired: false,
    stats: blankStats(), career: [],
  };
  return p;
}
function blankStats() { return { apps: 0, goals: 0, assists: 0, cs: 0 }; }

function generateYouth(tid, stature) {
  const natl = rand() < 0.5 ? "England" : randomNationality(rand);
  const pos = choice(["GK", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "AM", "LW", "RW", "ST", "ST"]);
  const age = ri(16, 18);
  const ovr = ri(46, 58) + Math.round(stature * 1.5);
  let potBonus = ri(6, 22);
  if (rand() < 0.12) potBonus += ri(8, 18); // gem
  const pot = clamp(ovr + potBonus, ovr, 94);
  return makePlayer(randomName(natl, rand), pos, age, ovr, pot, natl, tid, { youth: true, years: ri(2, 4) });
}

function generateSquadPlayer(tid, stature, pos) {
  const natl = rand() < 0.55 ? "England" : randomNationality(rand);
  const age = ri(19, 33);
  const ovr = ri(62, 71) + stature * 2 + ri(0, 3);
  const pot = age <= 23 ? clamp(ovr + ri(2, 10), ovr, 88) : ovr;
  return makePlayer(randomName(natl, rand), pos, age, clamp(ovr, 55, 78), pot, natl, tid, { years: ri(1, 4) });
}

const SQUAD_TEMPLATE = ["GK", "GK", "RB", "RB", "CB", "CB", "CB", "CB", "LB", "LB", "DM", "DM", "CM", "CM", "CM", "AM", "AM", "RW", "RW", "LW", "LW", "ST", "ST"];

function fillSquad(team) {
  // Top up a squad so every position has cover.
  const squad = teamPlayers(team.tid);
  const have = {};
  for (const p of squad) have[p.pos] = (have[p.pos] || 0) + 1;
  const need = {};
  for (const pos of SQUAD_TEMPLATE) {
    need[pos] = (need[pos] || 0) + 1;
  }
  for (const pos of Object.keys(need)) {
    while ((have[pos] || 0) < need[pos] - (pos === "GK" ? 0 : 1)) {
      const yp = generateYouth(team.tid, team.stature);
      yp.pos = pos;
      state.players[yp.pid] = yp;
      have[pos] = (have[pos] || 0) + 1;
    }
  }
}

// ---------- League creation ----------
function newLeague(userTid) {
  rngState = Date.now() >>> 0;
  state = {
    version: 1,
    season: START_SEASON,
    round: 0,
    phase: "season",
    userTid: userTid,
    nextPid: 1,
    nextTid: 20,
    teams: [],
    players: {},
    schedule: [],
    news: [],
    history: [],
    offers: [],
    pool: PROMOTION_POOL.map(c => ({ ...c })),
    champions: [],
  };
  REAL_TEAMS.forEach((t, i) => {
    state.teams.push({
      tid: i, name: t.name, abbrev: t.abbrev, stadium: t.stadium,
      colors: t.colors, stature: t.stature, budget: t.budget, history: [],
    });
    for (const row of t.players) {
      const p = makePlayer(row[0], row[1], row[2], row[3], row[4], row[5], i);
      state.players[p.pid] = p;
    }
  });
  for (const team of state.teams) fillSquad(team);
  state.schedule = makeSchedule();
  addNews(`Welcome to the ${seasonLabel()} season! You are managing ${teamById(userTid).name}. Good luck, boss.`);
  return state;
}

function makeSchedule() {
  // Circle-method double round robin for 20 teams.
  const tids = shuffle(state.teams.map(t => t.tid));
  const n = tids.length;
  const fixed = tids[0];
  let rest = tids.slice(1);
  const firstHalf = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const arr = [fixed].concat(rest);
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if ((r + i) % 2 === 0) round.push(match(a, b)); else round.push(match(b, a));
    }
    firstHalf.push(round);
    rest = [rest[rest.length - 1]].concat(rest.slice(0, rest.length - 1));
  }
  const secondHalf = firstHalf.map(round => round.map(m => match(m.away, m.home)));
  return firstHalf.concat(secondHalf);
}
function match(home, away) { return { home, away, played: false, hg: 0, ag: 0, events: [] }; }

// ---------- Accessors ----------
function teamById(tid) { return state.teams.find(t => t.tid === tid); }
function teamPlayers(tid) { return Object.values(state.players).filter(p => p.tid === tid && !p.retired); }
function freeAgents() { return Object.values(state.players).filter(p => p.tid === -1 && !p.retired); }
function allActivePlayers() { return Object.values(state.players).filter(p => p.tid >= 0 && !p.retired); }
function seasonLabel(s) { const y = s === undefined ? state.season : s; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }

// ---------- Team strength ----------
function bestXI(tid) {
  const avail = teamPlayers(tid).filter(p => p.injury === 0).sort((a, b) => b.ovr - a.ovr);
  const slots = FORMATION_433.map(s => ({ slot: s, player: null, eff: 0 }));
  // Goalkeeper slot goes to the best actual GK; keepers never play outfield.
  const gks = avail.filter(p => p.pos === "GK");
  const outfield = avail.filter(p => p.pos !== "GK");
  if (gks.length) { slots[0].player = gks[0]; slots[0].eff = gks[0].ovr; }
  for (const p of outfield) {
    let best = -1, bestScore = 0;
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].player) continue;
      const score = p.ovr * fit(slots[i].slot, p.pos);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) { slots[best].player = p; slots[best].eff = Math.round(bestScore); }
    else if (!slots[0].player) { slots[0].player = p; slots[0].eff = Math.round(p.ovr * 0.3); }
    if (slots.every(s => s.player)) break;
  }
  return slots;
}

function teamRatings(tid) {
  const xi = bestXI(tid);
  let att = 0, attW = 0, def = 0, defW = 0, total = 0, count = 0;
  const attWeights = { GK: 0, CB: 0.25, RB: 0.5, LB: 0.5, DM: 0.6, CM: 0.95, AM: 1.15, LW: 1.15, RW: 1.15, ST: 1.25 };
  const defWeights = { GK: 1.25, CB: 1.2, RB: 1.0, LB: 1.0, DM: 0.95, CM: 0.55, AM: 0.2, LW: 0.15, RW: 0.15, ST: 0.1 };
  for (const s of xi) {
    const eff = s.player ? s.eff : 40;
    att += eff * attWeights[s.slot]; attW += attWeights[s.slot];
    def += eff * defWeights[s.slot]; defW += defWeights[s.slot];
    total += eff; count++;
  }
  return { att: att / attW, def: def / defW, ovr: total / count, xi };
}

// ---------- Match simulation ----------
function simMatch(m) {
  const hr = teamRatings(m.home), ar = teamRatings(m.away);
  const hl = clamp(1.36 * Math.exp((hr.att - ar.def - 1) / 14), 0.15, 3.5);
  const al = clamp(1.05 * Math.exp((ar.att - hr.def - 1) / 14), 0.12, 3.3);
  m.hg = poisson(hl); m.ag = poisson(al);
  m.events = [];
  attachScorers(m, m.home, m.hg, hr.xi);
  attachScorers(m, m.away, m.ag, ar.xi);
  m.events.sort((a, b) => a.min - b.min);
  m.played = true;
  // Appearance / clean sheet stats + injuries
  creditAppearances(hr.xi, m.ag === 0);
  creditAppearances(ar.xi, m.hg === 0);
  return m;
}

const SCORE_W = { GK: 0.01, CB: 0.9, RB: 0.5, LB: 0.5, DM: 1.1, CM: 2.6, AM: 4.5, LW: 5.5, RW: 5.5, ST: 9 };
const ASSIST_W = { GK: 0.05, CB: 0.6, RB: 1.6, LB: 1.6, DM: 1.6, CM: 3.2, AM: 5.5, LW: 4.8, RW: 4.8, ST: 3 };

function weightedPick(xi, weights) {
  let total = 0;
  const opts = [];
  for (const s of xi) {
    if (!s.player) continue;
    const w = (weights[s.slot] || 1) * Math.pow(s.player.ovr / 72, 2.5);
    opts.push([s.player, w]); total += w;
  }
  if (!total) return null;
  let r = rand() * total;
  for (const [p, w] of opts) { r -= w; if (r <= 0) return p; }
  return opts[opts.length - 1][0];
}

function attachScorers(m, tid, goals, xi) {
  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, SCORE_W);
    if (!scorer) continue;
    scorer.stats.goals++;
    const min = ri(1, 94);
    let text = "";
    if (rand() < 0.72) {
      let assister = weightedPick(xi, ASSIST_W);
      if (assister && assister.pid !== scorer.pid) {
        assister.stats.assists++;
        text = ` (assist: ${assister.name})`;
      }
    }
    m.events.push({ min, type: "goal", name: scorer.name, pid: scorer.pid, tid, text });
  }
}

function creditAppearances(xi, cleanSheet) {
  for (const s of xi) {
    if (!s.player) continue;
    s.player.stats.apps++;
    if (cleanSheet && s.slot === "GK") s.player.stats.cs++;
    if (rand() < 0.030) {
      s.player.injury = ri(1, 7);
    }
  }
}

// ---------- Simulation control ----------
function simRound() {
  if (state.phase !== "season" || state.round >= ROUNDS) return null;
  const round = state.schedule[state.round];
  for (const m of round) simMatch(m);
  // user result news
  const um = round.find(m => m.home === state.userTid || m.away === state.userTid);
  if (um) {
    const h = teamById(um.home), a = teamById(um.away);
    addNews(`MD${state.round + 1}: ${h.name} ${um.hg}–${um.ag} ${a.name}`, state.userTid);
  }
  // heal injuries
  for (const p of Object.values(state.players)) { if (p.injury > 0) p.injury--; }
  // expire offers
  state.offers = state.offers.filter(o => --o.ttl > 0);
  state.round++;
  if (state.round === 19) {
    addNews("The January transfer window is open — clubs across the league are wheeling and dealing.");
    aiTransfers(0.5);
    generateOffersForUser();
  }
  if (state.round >= ROUNDS) {
    state.phase = "offseason";
    concludeSeason();
  }
  return round;
}

function simRounds(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = simRound();
    if (!r) break;
    out.push(r);
  }
  return out;
}

// ---------- Standings ----------
function standings() {
  const rows = state.teams.map(t => ({ tid: t.tid, name: t.name, abbrev: t.abbrev, colors: t.colors, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] }));
  const byTid = {};
  for (const r of rows) byTid[r.tid] = r;
  for (const round of state.schedule) {
    for (const m of round) {
      if (!m.played) continue;
      const h = byTid[m.home], a = byTid[m.away];
      if (!h || !a) continue;
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
      else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; a.form.push("W"); h.form.push("L"); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
    }
  }
  for (const r of rows) { r.gd = r.gf - r.ga; r.form = r.form.slice(-5); }
  rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  rows.forEach((r, i) => r.pos = i + 1);
  return rows;
}

function teamMatches(tid) {
  const out = [];
  state.schedule.forEach((round, ri_) => {
    for (const m of round) {
      if (m.home === tid || m.away === tid) out.push({ round: ri_, m });
    }
  });
  return out;
}

// ---------- Stat leaders ----------
function leaders(stat, count) {
  return allActivePlayers()
    .filter(p => p.stats.apps > 0)
    .sort((a, b) => b.stats[stat] - a.stats[stat] || a.stats.apps - b.stats.apps)
    .slice(0, count || 10);
}

// ---------- Season conclusion ----------
function concludeSeason() {
  const table = standings();
  const champ = table[0];
  const boot = leaders("goals", 1)[0];
  const play = leaders("assists", 1)[0];
  const glove = leaders("cs", 1)[0];
  const potyPool = allActivePlayers().filter(p => p.stats.apps >= 10);
  const potyScore = p => p.stats.goals * 1.0 + p.stats.assists * 0.75 + p.stats.cs * 0.9 + p.ovr * 0.12;
  const poty = potyPool.sort((a, b) => potyScore(b) - potyScore(a))[0];
  const ypoty = potyPool.filter(p => p.age <= 21).sort((a, b) => potyScore(b) - potyScore(a))[0];
  const relegated = table.slice(-3);

  const entry = {
    season: state.season,
    champion: { name: champ.name, abbrev: champ.abbrev, pts: champ.pts },
    table: table.map(r => ({ pos: r.pos, name: r.name, abbrev: r.abbrev, pts: r.pts, w: r.w, d: r.d, l: r.l, gd: r.gd })),
    goldenBoot: boot ? award(boot, boot.stats.goals, "goals") : null,
    playmaker: play ? award(play, play.stats.assists, "assists") : null,
    goldenGlove: glove ? award(glove, glove.stats.cs, "clean sheets") : null,
    poty: poty ? award(poty, Math.round(potyScore(poty)), "rating") : null,
    ypoty: ypoty ? award(ypoty, Math.round(potyScore(ypoty)), "rating") : null,
    relegated: relegated.map(r => r.name),
    userPos: table.find(r => r.tid === state.userTid).pos,
    userTeam: teamById(state.userTid).name,
  };
  state.history.push(entry);
  addNews(`🏆 ${champ.name} are ${seasonLabel()} Premier League champions with ${champ.pts} points!`);
  if (boot) addNews(`👟 Golden Boot: ${boot.name} (${teamName(boot.tid)}) with ${boot.stats.goals} goals.`);
  if (poty) addNews(`⭐ Player of the Season: ${poty.name} (${teamName(poty.tid)}).`);
  if (ypoty) addNews(`🌟 Young Player of the Season: ${ypoty.name} (${teamName(ypoty.tid)}).`);
}

function award(p, value, label) {
  return { name: p.name, team: teamName(p.tid), abbrev: teamAbbrev(p.tid), value, label, pid: p.pid };
}
function teamName(tid) { const t = teamById(tid); return t ? t.name : (tid === -1 ? "Free agent" : "—"); }
function teamAbbrev(tid) { const t = teamById(tid); return t ? t.abbrev : "FA"; }

// ---------- Offseason ----------
function advanceToNextSeason() {
  if (state.phase !== "offseason") return false;
  const table = standings();

  // 1. Archive per-player season rows
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    if (p.stats.apps > 0 || p.tid >= 0) {
      p.career.push({ season: state.season, team: p.tid >= 0 ? teamAbbrev(p.tid) : "FA", ...p.stats, ovr: p.ovr, age: p.age });
    }
  }

  // 2. Team history + finances
  for (const t of state.teams) {
    const row = table.find(r => r.tid === t.tid);
    t.history.push({ season: state.season, pos: row.pos, pts: row.pts, w: row.w, d: row.d, l: row.l });
    const prize = 62 - (row.pos - 1) * 2.2;
    const wageBillYr = teamPlayers(t.tid).reduce((s, p) => s + p.wage, 0) * 52 / 1000;
    t.budget = clamp(Math.round((t.budget + prize + t.stature * 9 - wageBillYr * 0.45) * 10) / 10, 5, 300);
  }

  // 3. Promotion & relegation (user's club is never sent down)
  handleRelegation(table);

  // 4. Development, aging, retirement
  developAllPlayers();

  // 5. Contracts
  handleContracts();

  // 6. Youth intake
  for (const t of state.teams) {
    const n = ri(2, 3);
    for (let i = 0; i < n; i++) {
      const yp = generateYouth(t.tid, t.stature);
      state.players[yp.pid] = yp;
      if (t.tid === state.userTid) addNews(`🎓 Youth academy: ${yp.name} (${yp.pos}, ${yp.age}) has joined your first team squad. Potential: ${potLabel(yp)}.`, t.tid);
    }
    fillSquad(t);
  }

  // 7. AI transfer window
  aiTransfers(1.0);
  generateOffersForUser();

  // 8. Prune free agent pool
  pruneFreeAgents();

  // 9. New season
  state.season++;
  state.round = 0;
  state.phase = "season";
  for (const p of Object.values(state.players)) p.stats = blankStats();
  state.schedule = makeSchedule();
  addNews(`A new ${seasonLabel()} season kicks off! ${teamById(state.userTid).name} start the campaign with a £${teamById(state.userTid).budget}m transfer kitty.`);
  return true;
}

function potLabel(p) {
  const d = p.pot - p.ovr;
  if (p.pot >= 88) return "world class";
  if (p.pot >= 82) return "elite";
  if (d >= 20) return "high ceiling";
  if (p.pot >= 75) return "solid starter";
  return "squad player";
}

function handleRelegation(table) {
  let down = table.slice(-3);
  if (down.some(r => r.tid === state.userTid)) {
    // The board pulls strings: user survives, next-worst side goes down instead.
    down = down.filter(r => r.tid !== state.userTid);
    const replacement = table[table.length - 4];
    down.push(replacement);
    addNews(`😅 Your board pulled every string imaginable — ${teamById(state.userTid).name} avoid the drop on a technicality. ${replacement.name} go down instead.`);
  }
  const promoted = shuffle(state.pool).slice(0, 3);
  state.pool = state.pool.filter(c => !promoted.includes(c));

  for (const r of down) {
    const t = teamById(r.tid);
    addNews(`⬇️ ${t.name} are relegated to the Championship.`);
    // Stars get sold on to surviving clubs; the rest hit free agency.
    const squad = teamPlayers(t.tid).sort((a, b) => b.ovr - a.ovr);
    let sold = 0;
    for (const p of squad) {
      if (sold < 4 && (p.ovr >= 77 || (p.pot >= 84 && p.age <= 23))) {
        const buyers = state.teams.filter(x => x.tid !== t.tid && !down.some(d => d.tid === x.tid) && x.budget >= playerValue(p));
        if (buyers.length) {
          const buyer = buyers.sort((a, b) => b.budget - a.budget)[ri(0, Math.min(3, buyers.length - 1))];
          transferPlayer(p, buyer.tid, playerValue(p), t);
          sold++;
          continue;
        }
      }
      p.tid = -1; p.listed = false;
    }
    state.pool.push({ name: t.name, abbrev: t.abbrev, stadium: t.stadium, colors: t.colors, stature: Math.max(1, t.stature - 1) });
    const idx = state.teams.indexOf(t);
    state.teams.splice(idx, 1);
  }
  for (const club of promoted) {
    if (state.nextTid === undefined) state.nextTid = 20;
    const tid = state.nextTid++;
    const team = { tid, name: club.name, abbrev: club.abbrev, stadium: club.stadium, colors: club.colors, stature: club.stature, budget: 25 + club.stature * 10, history: [] };
    state.teams.push(team);
    for (const pos of SQUAD_TEMPLATE) {
      const p = generateSquadPlayer(tid, club.stature, pos);
      state.players[p.pid] = p;
    }
    addNews(`⬆️ ${club.name} are promoted to the Premier League!`);
  }
}

function developAllPlayers() {
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    if (p.tid === -2) continue;
    const gkShift = p.pos === "GK" ? 2 : 0;
    const a = p.age;
    let d = 0;
    if (a <= 20) d = ri(1, 5);
    else if (a <= 23) d = ri(0, 4);
    else if (a <= 26 + gkShift * 0.5) d = ri(0, 2);
    else if (a <= 29 + gkShift) d = ri(-1, 1);
    else if (a <= 31 + gkShift) d = ri(-2, 0);
    else if (a <= 33 + gkShift) d = ri(-4, -1);
    else d = ri(-6, -2);
    // playing time nudges growth
    if (d > 0 && p.stats.apps >= 20) d += rand() < 0.4 ? 1 : 0;
    if (d > 0) p.ovr = clamp(p.ovr + d, 40, p.pot);
    else p.ovr = clamp(p.ovr + d, 40, 99);
    if (a <= 23) { p.pot = clamp(p.pot + ri(-2, 2), p.ovr, 96); }
    else p.pot = Math.max(p.ovr, p.pot - 1);
    p.age++;

    // Retirement
    const retireAge = p.pos === "GK" ? 36 : 34;
    if (p.age >= retireAge) {
      const prob = (p.age - retireAge + 1) * 0.3 + (p.ovr < 70 ? 0.3 : 0);
      if (rand() < prob || p.age >= retireAge + 4) {
        retirePlayer(p);
      }
    } else if (p.tid === -1 && p.age >= 31 && p.ovr < 70 && rand() < 0.5) {
      retirePlayer(p);
    }
  }
}

function retirePlayer(p) {
  const notable = p.ovr >= 78 || p.career.reduce((s, c) => s + c.goals, 0) >= 60;
  if (notable) addNews(`👋 ${p.name} (${p.pos}, ${p.age}) has announced retirement after a distinguished career.`);
  p.retired = true;
  p.tid = -3;
  p.listed = false;
}

function handleContracts() {
  for (const p of Object.values(state.players)) {
    if (p.retired || p.tid < 0) continue;
    p.years--;
    if (p.years <= 0) {
      const t = teamById(p.tid);
      const isUser = p.tid === state.userTid;
      // AI clubs re-sign most useful expiring players
      if (!isUser && rand() < 0.65 && p.ovr >= 70) {
        p.years = ri(2, 4); p.wage = wageFor(p.ovr);
      } else if (isUser && rand() < 0.35) {
        // some user players agree to short extension on their own
        p.years = 1; p.wage = wageFor(p.ovr);
        addNews(`✍️ ${p.name} agreed a 1-year extension to stay at the club.`, p.tid);
      } else {
        if (isUser) addNews(`🚪 ${p.name}'s contract expired — he leaves on a free transfer.`, p.tid);
        p.tid = -1; p.listed = false; p.years = 0;
      }
    }
  }
  // Free agents get short "contracts" so wage is defined when signed
  for (const p of freeAgents()) { p.wage = wageFor(p.ovr); }
}

function pruneFreeAgents() {
  const fas = freeAgents().sort((a, b) => (b.ovr + b.pot) - (a.ovr + a.pot));
  for (const p of fas.slice(90)) { p.retired = true; p.tid = -3; }
}

// ---------- Transfers ----------
function transferPlayer(p, toTid, fee, fromTeam) {
  const toTeam = teamById(toTid);
  if (fromTeam) fromTeam.budget = Math.round((fromTeam.budget + fee) * 10) / 10;
  if (toTeam) toTeam.budget = Math.round((toTeam.budget - fee) * 10) / 10;
  p.tid = toTid;
  p.listed = false;
  p.years = ri(2, 4);
  p.wage = wageFor(p.ovr);
  addNews(`💸 ${p.name} joins ${toTeam ? toTeam.name : "?"}${fromTeam ? ` from ${fromTeam.name}` : " on a free transfer"}${fee > 0 ? ` for £${fee}m` : ""}.`);
}

function askingPrice(p) {
  const v = playerValue(p);
  if (p.tid === -1) return Math.max(0.3, Math.round(v * 0.2 * 10) / 10); // signing fee
  if (p.listed) return Math.round(v * 0.9 * 10) / 10;
  const t = teamById(p.tid);
  const squad = teamPlayers(p.tid).sort((a, b) => b.ovr - a.ovr);
  const rank = squad.indexOf(p);
  if (rank < 3 || p.ovr >= 86) return Math.round(v * 1.8 * 10) / 10;   // crown jewels
  if (rank < 8) return Math.round(v * 1.35 * 10) / 10;                  // key players
  return Math.round(v * 1.1 * 10) / 10;                                 // squad players
}

function userBuy(pid) {
  const p = state.players[pid];
  const user = teamById(state.userTid);
  if (!p || p.retired || p.tid === state.userTid) return { ok: false, msg: "Unavailable." };
  if (teamPlayers(state.userTid).length >= 32) return { ok: false, msg: "Squad is full (32 max)." };
  const price = askingPrice(p);
  if (price > user.budget) return { ok: false, msg: `Not enough budget (need £${price}m, have £${user.budget}m).` };
  const seller = p.tid >= 0 ? teamById(p.tid) : null;
  if (seller && teamPlayers(seller.tid).length <= 15) return { ok: false, msg: `${seller.name} refuse — their squad is too thin.` };
  transferPlayer(p, state.userTid, p.tid === -1 ? 0 : price, seller);
  if (p.tid === state.userTid && !seller) user.budget = Math.round((user.budget - price) * 10) / 10; // FA signing fee
  return { ok: true, msg: `${p.name} signs for ${user.name}!` };
}

function userSell(offerId) {
  const o = state.offers.find(x => x.id === offerId);
  if (!o) return { ok: false, msg: "Offer expired." };
  const p = state.players[o.pid];
  const buyer = teamById(o.tid);
  if (!p || p.tid !== state.userTid || !buyer) return { ok: false, msg: "Offer no longer valid." };
  if (teamPlayers(state.userTid).length <= 15) return { ok: false, msg: "Squad too small to sell." };
  transferPlayer(p, buyer.tid, o.fee, teamById(state.userTid));
  state.offers = state.offers.filter(x => x.pid !== o.pid);
  return { ok: true, msg: `${p.name} sold to ${buyer.name} for £${o.fee}m.` };
}

function rejectOffer(offerId) {
  state.offers = state.offers.filter(x => x.id !== offerId);
}

function toggleListed(pid) {
  const p = state.players[pid];
  if (p && p.tid === state.userTid) { p.listed = !p.listed; if (p.listed) generateOffersForUser(p.pid); }
}

function extendContract(pid) {
  const p = state.players[pid];
  if (!p || p.tid !== state.userTid) return { ok: false, msg: "Not your player." };
  if (p.years >= 4) return { ok: false, msg: "Contract already long-term." };
  p.years = Math.min(5, p.years + ri(2, 3));
  p.wage = Math.round(wageFor(p.ovr) * 1.12);
  return { ok: true, msg: `${p.name} extends to ${p.years} years at £${p.wage}k/week.` };
}

function generateOffersForUser(onlyPid) {
  const user = teamById(state.userTid);
  const squad = teamPlayers(state.userTid);
  let nextId = state.offers.reduce((m, o) => Math.max(m, o.id), 0) + 1;
  for (const p of squad) {
    if (onlyPid && p.pid !== onlyPid) continue;
    if (state.offers.some(o => o.pid === p.pid)) continue;
    const interested = p.listed ? rand() < 0.85 : (p.ovr >= 80 && rand() < 0.25) || (p.pot >= 86 && rand() < 0.2);
    if (!interested) continue;
    const bidders = state.teams.filter(t => t.tid !== state.userTid && t.budget >= playerValue(p) * 0.8);
    if (!bidders.length) continue;
    const bidder = choice(bidders);
    const mult = p.listed ? 0.9 + rand() * 0.25 : 1.05 + rand() * 0.35;
    const fee = Math.min(bidder.budget, Math.round(playerValue(p) * mult * 10) / 10);
    state.offers.push({ id: nextId++, pid: p.pid, tid: bidder.tid, fee, ttl: 5 });
    addNews(`📨 ${bidder.name} bid £${fee}m for ${p.name}. Review it in the Transfer Market.`, state.userTid);
  }
}

function aiTransfers(intensity) {
  const teams = shuffle(state.teams.filter(t => t.tid !== state.userTid));
  for (const team of teams) {
    let moves = Math.round((1 + rand() * 2) * intensity * (0.6 + team.budget / 120));
    // List surplus players
    const squad = teamPlayers(team.tid).sort((a, b) => b.ovr - a.ovr);
    for (let i = 24; i < squad.length; i++) if (rand() < 0.5) squad[i].listed = true;
    while (moves-- > 0) {
      const squadNow = teamPlayers(team.tid);
      if (squadNow.length >= 30) break;
      // weakest position group
      const groups = { GK: [], DF: [], MF: [], FW: [] };
      for (const p of squadNow) groups[POS_GROUP[p.pos]].push(p.ovr);
      let worst = "MF", worstAvg = 999;
      for (const g of Object.keys(groups)) {
        const top = groups[g].sort((a, b) => b - a).slice(0, g === "GK" ? 1 : 4);
        const avg = top.length ? top.reduce((s, v) => s + v, 0) / top.length : 0;
        if (avg < worstAvg) { worstAvg = avg; worst = g; }
      }
      // candidates: listed elsewhere or free agents in that group
      const cands = Object.values(state.players).filter(p =>
        !p.retired && p.tid !== team.tid && POS_GROUP[p.pos] === worst &&
        (p.tid === -1 || (p.listed && p.tid !== state.userTid)) &&
        p.ovr >= worstAvg - 6 && playerValue(p) * 1.05 <= team.budget
      ).sort((a, b) => (b.ovr + b.pot * 0.4) - (a.ovr + a.pot * 0.4)).slice(0, 6);
      if (!cands.length) break;
      const pick = choice(cands);
      const fee = pick.tid === -1 ? 0 : Math.round(playerValue(pick) * (0.95 + rand() * 0.2) * 10) / 10;
      transferPlayer(pick, team.tid, fee, pick.tid >= 0 ? teamById(pick.tid) : null);
    }
  }
}

// ---------- Sub-ratings (derived, display only) ----------
function subRatings(p) {
  const h = hashCode(p.name + ":" + p.pid);
  const noise = i => ((h >> (i * 3)) % 11) - 5;
  const o = p.ovr;
  const base = { pace: o, shooting: o, passing: o, dribbling: o, defending: o, physical: o };
  const posAdj = {
    GK: { pace: -18, shooting: -35, passing: -8, dribbling: -20, defending: 8, physical: 2 },
    CB: { pace: -6, shooting: -18, passing: -6, dribbling: -10, defending: 9, physical: 8 },
    RB: { pace: 6, shooting: -12, passing: -2, dribbling: -2, defending: 4, physical: 2 },
    LB: { pace: 6, shooting: -12, passing: -2, dribbling: -2, defending: 4, physical: 2 },
    DM: { pace: -4, shooting: -8, passing: 4, dribbling: -2, defending: 7, physical: 5 },
    CM: { pace: -2, shooting: -2, passing: 7, dribbling: 3, defending: -2, physical: 0 },
    AM: { pace: 2, shooting: 4, passing: 8, dribbling: 8, defending: -14, physical: -5 },
    LW: { pace: 9, shooting: 4, passing: 1, dribbling: 9, defending: -16, physical: -5 },
    RW: { pace: 9, shooting: 4, passing: 1, dribbling: 9, defending: -16, physical: -5 },
    ST: { pace: 5, shooting: 10, passing: -4, dribbling: 2, defending: -18, physical: 4 },
  }[p.pos];
  const keys = Object.keys(base);
  const out = {};
  keys.forEach((k, i) => { out[k] = clamp(base[k] + posAdj[k] + noise(i), 20, 99); });
  if (p.pos === "GK") { out.reflexes = clamp(o + noise(0), 20, 99); out.handling = clamp(o - 2 + noise(1), 20, 99); }
  return out;
}

// ---------- News ----------
function addNews(text, tid) {
  state.news.unshift({ season: state.season, round: state.round, text, tid: tid === undefined ? null : tid });
  if (state.news.length > 250) state.news.length = 250;
}

// ---------- Persistence ----------
function save() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
}
function load() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    state = JSON.parse(raw);
    return true;
  } catch (e) { return false; }
}
function reset() {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY); } catch (e) { /* blocked */ }
  state = null;
}
function exportJSON() { return JSON.stringify(state); }
function importJSON(str) {
  const s = JSON.parse(str);
  if (!s.teams || !s.players || !s.schedule) throw new Error("Not a Football GM save file");
  state = s;
  save();
}

// ---------- Public API ----------
const FGM = {
  get state() { return state; },
  newLeague, save, load, reset, exportJSON, importJSON,
  simRound, simRounds, advanceToNextSeason,
  standings, teamMatches, leaders, bestXI, teamRatings,
  teamById, teamPlayers, freeAgents, allActivePlayers,
  playerValue, askingPrice, wageFor, subRatings, seasonLabel,
  userBuy, userSell, rejectOffer, toggleListed, extendContract,
  addNews, teamName, teamAbbrev,
  POS_GROUP, ROUNDS,
  setUserTid(tid) { state.userTid = tid; },
};

root.FGM = FGM;
if (typeof module !== "undefined") module.exports = FGM;

})(typeof globalThis !== "undefined" ? globalThis : this);
