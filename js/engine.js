// Football GM engine v2 — multi-league world, Champions League, era starts (2000-2025),
// real career timelines, match sim, development, transfers.
// No DOM dependencies: also runs headless under Node for testing.

/* global START_SEASON, REAL_TEAMS, PROMOTION_POOL, NAME_POOLS, randomNationality, randomName,
   LALIGA_TEAMS, LALIGA_POOL, SERIEA_TEAMS, SERIEA_POOL, BUNDES_TEAMS, BUNDES_POOL,
   LIGUE1_TEAMS, LIGUE1_POOL, FOREIGN_CLUBS, LEGENDS, STINT_OVERRIDES, PRE_AWARDS */

(function (root) {
"use strict";

if (typeof module !== "undefined" && typeof require !== "undefined") {
  Object.assign(root, require("./names.js"), require("./players.js"), require("./leagues1.js"),
    require("./leagues2.js"), require("./world.js"), require("./legends.js"), require("./awards.js"));
}

const WEEKS = 38;
const SAVE_KEY = "footballGM_save_v2";
const MIN_START = 2000, MAX_START = 2025;

const LEAGUE_DEFS = [
  { id: "EPL", name: "Premier League", country: "England", teams: () => REAL_TEAMS, pool: () => PROMOTION_POOL },
  { id: "LIGA", name: "La Liga", country: "Spain", teams: () => LALIGA_TEAMS, pool: () => LALIGA_POOL },
  { id: "SA", name: "Serie A", country: "Italy", teams: () => SERIEA_TEAMS, pool: () => SERIEA_POOL },
  { id: "BL", name: "Bundesliga", country: "Germany", teams: () => BUNDES_TEAMS, pool: () => BUNDES_POOL },
  { id: "L1", name: "Ligue 1", country: "France", teams: () => LIGUE1_TEAMS, pool: () => LIGUE1_POOL },
];
const CL_GROUP_WEEKS = [2, 5, 8, 11, 14, 17];
const CL_KO_WEEKS = { r16: 21, qf: 26, sf: 31, final: 35 };

// Domestic cups — knockout tournaments among each league's clubs. Round weeks are
// the 5 midweek slots each cup uses (R1 → last 32/16 → QF → SF → Final).
const CUP_DEFS = [
  { id: "FAC", name: "FA Cup", league: "EPL", weeks: [3, 9, 16, 25, 34] },
  { id: "EFL", name: "EFL Cup", league: "EPL", weeks: [4, 10, 18, 28, 36] },
  { id: "COPA", name: "Copa del Rey", league: "LIGA", weeks: [3, 9, 16, 25, 34] },
  { id: "COPPA", name: "Coppa Italia", league: "SA", weeks: [3, 9, 16, 25, 34] },
  { id: "DFB", name: "DFB-Pokal", league: "BL", weeks: [3, 9, 16, 25, 34] },
  { id: "CDF", name: "Coupe de France", league: "L1", weeks: [3, 9, 16, 25, 34] },
];
const CUP_ROUND_NAMES = ["Round 1", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];

// ---------- RNG & utils ----------
let rngState = Date.now() >>> 0;
function rand() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ri(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
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
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
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
function newTid() { return state.nextTid++; }

function wageFor(ovr) { return Math.max(5, Math.round(1.4 * Math.pow(1.125, ovr - 50))); }

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
  return {
    pid: newPid(), name, pos, age, natl, ovr, pot: Math.max(pot, ovr), tid,
    wage: wageFor(ovr), years: opts.years || ri(1, 4),
    listed: false, injury: 0, youth: !!opts.youth, retired: false,
    stats: blankStats(), career: [],
  };
}
function blankStats() { return { apps: 0, goals: 0, assists: 0, cs: 0 }; }

// Age curve for real players placed in historical eras.
function ovrAtAge(peak, age, pos, name) {
  const shift = pos === "GK" ? 2 : 0;
  const a = age - shift;
  let d;
  if (a <= 17) d = -17; else if (a === 18) d = -15; else if (a === 19) d = -12;
  else if (a === 20) d = -9; else if (a === 21) d = -7; else if (a === 22) d = -5;
  else if (a === 23) d = -3; else if (a === 24) d = -2; else if (a === 25) d = -1;
  else if (a <= 29) d = 0; else if (a === 30) d = -1; else if (a === 31) d = -3;
  else if (a === 32) d = -5; else if (a === 33) d = -8; else if (a === 34) d = -11;
  else if (a === 35) d = -14; else d = -17 - (a - 36) * 3;
  const noise = (hashCode(name || "") % 3) - 1;
  return clamp(peak + d + noise, 42, 99);
}

function uniqueName(natl) {
  for (let i = 0; i < 6; i++) {
    const n = randomName(natl, rand);
    if (!Object.values(state.players).some(p => p.name === n)) return n;
  }
  return randomName(natl, rand) + " Jr";
}

function generateYouth(tid, stature) {
  const natl = rand() < 0.4 ? nativeNationality(tid) : randomNationality(rand);
  const pos = choice(["GK", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "AM", "LW", "RW", "ST", "ST"]);
  const age = ri(16, 18);
  const ovr = ri(46, 58) + Math.round(stature * 1.5);
  let potBonus = ri(6, 22);
  if (rand() < 0.12) potBonus += ri(8, 18);
  const pot = clamp(ovr + potBonus, ovr, 94);
  return makePlayer(uniqueName(natl), pos, age, ovr, pot, natl, tid, { youth: true, years: ri(2, 4) });
}

function nativeNationality(tid) {
  const t = teamById(tid);
  if (!t) return "England";
  const map = { EPL: "England", LIGA: "Spain", SA: "Italy", BL: "Germany", L1: "France" };
  return map[t.league] || (NAME_POOLS[t.country] ? t.country : "England");
}

function generateSquadPlayer(tid, stature, pos) {
  const natl = rand() < 0.5 ? nativeNationality(tid) : randomNationality(rand);
  const age = ri(19, 33);
  const ovr = clamp(ri(62, 71) + stature * 2 + ri(0, 3), 55, 79);
  const pot = age <= 23 ? clamp(ovr + ri(2, 10), ovr, 88) : ovr;
  return makePlayer(uniqueName(natl), pos, age, ovr, pot, natl, tid, { years: ri(1, 4) });
}

const SQUAD_TEMPLATE = ["GK", "GK", "RB", "RB", "CB", "CB", "CB", "CB", "LB", "LB", "DM", "DM", "CM", "CM", "CM", "AM", "AM", "RW", "RW", "LW", "LW", "ST", "ST"];

function fillSquad(team, seasoned) {
  const have = {};
  for (const p of teamPlayers(team.tid)) have[p.pos] = (have[p.pos] || 0) + 1;
  const need = {};
  for (const pos of SQUAD_TEMPLATE) need[pos] = (need[pos] || 0) + 1;
  for (const pos of Object.keys(need)) {
    while ((have[pos] || 0) < need[pos] - (pos === "GK" ? 0 : 1)) {
      const p = (!seasoned && rand() < 0.5) ? generateYouth(team.tid, team.stature) : generateSquadPlayer(team.tid, team.stature, pos);
      p.pos = pos;
      state.players[p.pid] = p;
      have[pos] = (have[pos] || 0) + 1;
    }
  }
}

// ---------- Real-player master list (for era starts) ----------
function realPlayerDB() {
  const db = [];
  const seen = {};
  for (const row of LEGENDS) {
    const [name, pos, natl, birthYear, peak, stints, endYear] = row;
    db.push({ name, pos, natl, birthYear, peak, stints, endYear });
    seen[name] = true;
  }
  const collect = (teams) => {
    for (const t of teams) {
      for (const r of t.players) {
        const [name, pos, age, ovr, pot, natl] = r;
        if (seen[name]) continue;
        seen[name] = true;
        const birthYear = 2025 - age;
        const peak = Math.max(ovr, pot);
        const stints = STINT_OVERRIDES[name] || [[birthYear + (peak >= 88 ? 17 : peak >= 80 ? 18 : 19), t.abbrev]];
        db.push({ name, pos, natl, birthYear, peak, stints, endYear: birthYear + (pos === "GK" ? 39 : 37) });
      }
    }
  };
  for (const def of LEAGUE_DEFS) collect(def.teams());
  collect(FOREIGN_CLUBS);
  return db;
}

// ---------- World creation ----------
function createTeam(info, league) {
  const t = {
    tid: newTid(), league, name: info.name, abbrev: info.abbrev, stadium: info.stadium,
    colors: info.colors, stature: info.stature, budget: info.budget || (15 + info.stature * 10),
    country: info.country || null, euro: !!info.euro, history: [],
  };
  state.teams.push(t);
  return t;
}

function newLeague(startSeason, userLeagueId, userClubAbbrev) {
  rngState = Date.now() >>> 0;
  startSeason = clamp(startSeason || MAX_START, MIN_START, MAX_START);
  state = {
    version: 2, season: startSeason, startSeason, week: 0, phase: "season",
    userTid: -1, nextPid: 1, nextTid: 0,
    teams: [], players: {}, leagues: {}, news: [], history: [], offers: [],
    futureDebuts: [], futureMoves: [], cl: null,
  };
  // Teams
  for (const def of LEAGUE_DEFS) {
    state.leagues[def.id] = { id: def.id, name: def.name, country: def.country, schedule: [], weekPlan: [], pool: def.pool().map(c => ({ ...c })) };
    for (const info of def.teams()) createTeam(info, def.id);
  }
  for (const info of FOREIGN_CLUBS) createTeam(info, "FOR");

  // Players
  if (startSeason === MAX_START) {
    for (const def of LEAGUE_DEFS) seedAuthoredSquads(def.teams());
    seedAuthoredSquads(FOREIGN_CLUBS);
    // schedule future debuts for real 2025 squads? none — world is current.
    for (const t of state.teams) fillSquad(t);
  } else {
    seedEraSquads(startSeason);
    for (const t of state.teams) fillSquad(t, true);
  }

  // Schedules
  for (const id of Object.keys(state.leagues)) buildLeagueSeason(id);
  setupChampionsLeague(true);
  setupCups();

  // User club
  const ut = state.teams.find(t => t.league === userLeagueId && t.abbrev === userClubAbbrev) || state.teams[0];
  state.userTid = ut.tid;
  addNews(`Welcome to the ${seasonLabel()} season! You are managing ${ut.name} in the ${leagueName(ut.league)}. Good luck, boss.`);
  return state;
}

function seedAuthoredSquads(teamDefs) {
  for (const info of teamDefs) {
    const team = state.teams.find(t => t.abbrev === info.abbrev && t.name === info.name);
    for (const r of info.players) {
      const p = makePlayer(r[0], r[1], r[2], r[3], r[4], r[5], team.tid);
      state.players[p.pid] = p;
    }
  }
}

function seedEraSquads(year) {
  const db = realPlayerDB();
  const byAbbrev = {};
  for (const t of state.teams) byAbbrev[t.abbrev] = t;
  for (const rp of db) {
    const age = year - rp.birthYear;
    const maxAge = rp.pos === "GK" ? 41 : 39;
    // Find the stint active at `year`, restricted to in-world clubs.
    let activeClub = null;
    for (const [y, club] of rp.stints) {
      if (y <= year && byAbbrev[club]) activeClub = club;
      else if (y <= year && !byAbbrev[club]) activeClub = null; // moved out of world
    }
    const debutYear = rp.stints[0][0];
    if (activeClub && year >= debutYear && year <= rp.endYear && age <= maxAge && age >= 15) {
      const t = byAbbrev[activeClub];
      const ovr = ovrAtAge(rp.peak, age, rp.pos, rp.name);
      const pot = age < 27 ? Math.max(rp.peak, ovr) : ovr;
      const p = makePlayer(rp.name, rp.pos, age, ovr, pot, rp.natl, t.tid);
      state.players[p.pid] = p;
      scheduleCareerMoves(p.pid, rp.stints, year, rp.endYear, activeClub);
    } else if (year < rp.endYear) {
      // Not in the world yet — schedule the debut at the first in-world stint after `year`.
      const next = rp.stints.find(([y, club]) => y > year && byAbbrev[club]);
      if (next) {
        state.futureDebuts.push({ year: next[0], club: next[1], name: rp.name, pos: rp.pos, natl: rp.natl, birthYear: rp.birthYear, peak: rp.peak, stints: rp.stints, endYear: rp.endYear });
      }
    }
  }
  state.futureDebuts.sort((a, b) => a.year - b.year);
}

// ---------- Schedules ----------
function leagueTeams(leagueId) { return state.teams.filter(t => t.league === leagueId); }

function buildLeagueSeason(leagueId) {
  const lg = state.leagues[leagueId];
  const tids = shuffle(leagueTeams(leagueId).map(t => t.tid));
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
  lg.schedule = firstHalf.concat(firstHalf.map(round => round.map(m => match(m.away, m.home))));
  const L = lg.schedule.length; // 38 or 34
  lg.weekPlan = [];
  for (let w = 0; w < WEEKS; w++) {
    const r = Math.floor(((w + 1) * L) / WEEKS), prev = Math.floor((w * L) / WEEKS);
    lg.weekPlan.push(r > prev ? prev : -1);
  }
}

function match(home, away) { return { home, away, played: false, hg: 0, ag: 0, events: [] }; }

// ---------- Champions League ----------
function setupChampionsLeague(firstSeason) {
  const entrants = [];
  for (const def of LEAGUE_DEFS) {
    let top4;
    if (firstSeason || !state.leagues[def.id].lastTable) {
      top4 = leagueTeams(def.id).map(t => ({ t, r: teamRatings(t.tid).ovr })).sort((a, b) => b.r - a.r).slice(0, 4).map(x => x.t.tid);
    } else {
      top4 = state.leagues[def.id].lastTable.slice(0, 4).map(r => r.tid).filter(tid => teamById(tid));
      while (top4.length < 4) {
        const extra = leagueTeams(def.id).find(t => !top4.includes(t.tid));
        if (!extra) break;
        top4.push(extra.tid);
      }
    }
    entrants.push(...top4);
  }
  const euro = state.teams.filter(t => t.league === "FOR" && t.euro)
    .map(t => ({ t, r: teamRatings(t.tid).ovr })).sort((a, b) => b.r - a.r).slice(0, 12).map(x => x.t.tid);
  entrants.push(...euro);

  const seeded = entrants.map(tid => ({ tid, r: teamRatings(tid).ovr })).sort((a, b) => b.r - a.r).map(x => x.tid);
  const pots = [seeded.slice(0, 8), shuffle(seeded.slice(8, 16)), shuffle(seeded.slice(16, 24)), shuffle(seeded.slice(24, 32))];
  const groups = [];
  for (let g = 0; g < 8; g++) groups.push([pots[0][g], pots[1][g], pots[2][g], pots[3][g]]);

  const groupRounds = [];
  const pairs = [[[0, 1], [2, 3]], [[2, 0], [3, 1]], [[0, 3], [1, 2]]];
  for (let leg = 0; leg < 2; leg++) {
    for (const md of pairs) {
      const round = [];
      for (let g = 0; g < 8; g++) {
        for (const [i, j] of md) {
          const a = groups[g][i], b = groups[g][j];
          round.push(Object.assign(match(leg ? b : a, leg ? a : b), { group: g }));
        }
      }
      groupRounds.push(round);
    }
  }
  state.cl = { groups, groupRounds, stage: "groups", r16: [], qf: [], sf: [], final: [], winner: null };
}

function clGroupTable(g) {
  const cl = state.cl;
  const rows = cl.groups[g].map(tid => ({ tid, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  const by = {}; rows.forEach(r => by[r.tid] = r);
  for (const round of cl.groupRounds) {
    for (const m of round) {
      if (m.group !== g || !m.played) continue;
      const h = by[m.home], a = by[m.away];
      h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; h.pts += 3; }
      else if (m.hg < m.ag) { a.w++; h.l++; a.pts += 3; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    }
  }
  rows.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  return rows;
}

function simCLWeek(week) {
  const cl = state.cl;
  if (!cl) return [];
  const out = [];
  const gi = CL_GROUP_WEEKS.indexOf(week);
  if (gi >= 0) {
    for (const m of cl.groupRounds[gi]) { simMatch(m); out.push(Object.assign({ comp: "UCL" }, m)); }
    if (gi === 5) {
      // Groups done → R16 draw
      const winners = [], runners = [];
      for (let g = 0; g < 8; g++) {
        const tbl = clGroupTable(g);
        winners.push(tbl[0].tid); runners.push(tbl[1].tid);
      }
      for (let i = 0; i < 8; i++) cl.r16.push(Object.assign(match(winners[i], runners[(i + 1) % 8]), { ko: true }));
      cl.stage = "r16";
      addNews("🏆 Champions League knockout draw is set — Round of 16 in the new year!");
    }
    return out;
  }
  const koStage = Object.keys(CL_KO_WEEKS).find(k => CL_KO_WEEKS[k] === week);
  if (!koStage || !cl.r16.length) return out;
  const simKO = (matches) => {
    const winners = [];
    for (const m of matches) {
      if (m.played) { winners.push(m.winner); continue; }
      simMatch(m);
      if (m.hg === m.ag) {
        const hr = teamRatings(m.home).ovr, ar = teamRatings(m.away).ovr;
        m.pens = true;
        m.winner = rand() < 0.5 + (hr - ar) / 60 ? m.home : m.away;
      } else m.winner = m.hg > m.ag ? m.home : m.away;
      winners.push(m.winner);
      out.push(Object.assign({ comp: "UCL" }, m));
    }
    return winners;
  };
  if (koStage === "r16") {
    const w = simKO(cl.r16);
    for (let i = 0; i < 4; i++) cl.qf.push(Object.assign(match(w[i * 2], w[i * 2 + 1]), { ko: true }));
    cl.stage = "qf";
  } else if (koStage === "qf" && cl.qf.length) {
    const w = simKO(cl.qf);
    cl.sf.push(Object.assign(match(w[0], w[1]), { ko: true }), Object.assign(match(w[2], w[3]), { ko: true }));
    cl.stage = "sf";
  } else if (koStage === "sf" && cl.sf.length) {
    const w = simKO(cl.sf);
    cl.final.push(Object.assign(match(w[0], w[1]), { ko: true, isFinal: true }));
    cl.stage = "final";
  } else if (koStage === "final" && cl.final.length) {
    const w = simKO(cl.final);
    cl.winner = w[0];
    cl.stage = "done";
    const t = teamById(cl.winner);
    if (t) { t.budget = Math.round((t.budget + 15) * 10) / 10; addNews(`🏆⭐ ${t.name} are champions of Europe! They win the Champions League final ${cl.final[0].hg}-${cl.final[0].ag}${cl.final[0].pens ? " (pens)" : ""}.`); }
  }
  return out;
}

function clParticipants() { return state.cl ? state.cl.groups.flat() : []; }

// ---------- Domestic cups ----------
// Standard single-elimination bracket seed order for a power-of-two size.
function bracketSeedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next = [];
    for (const s of seeds) { next.push(s); next.push(sum - s); }
    seeds = next;
  }
  return seeds;
}

function setupCups() {
  state.cups = {};
  for (const def of CUP_DEFS) {
    if (!state.leagues[def.league]) continue;
    // Seed by team strength; pad to 32 with byes (null) so top seeds get a bye.
    const seeded = leagueTeams(def.league)
      .map(t => ({ tid: t.tid, r: teamRatings(t.tid).ovr }))
      .sort((a, b) => b.r - a.r)
      .map(x => x.tid);
    const order = bracketSeedOrder(32);
    const survivors = order.map(seed => (seed <= seeded.length ? seeded[seed - 1] : null));
    state.cups[def.id] = {
      id: def.id, name: def.name, league: def.league, weeks: def.weeks.slice(),
      stage: 0, survivors, rounds: [], winner: null,
    };
  }
}

function simCupWeek(week) {
  const out = [];
  if (!state.cups) return out;
  for (const cup of Object.values(state.cups)) {
    if (cup.winner !== null || cup.stage >= cup.weeks.length) continue;
    if (cup.weeks[cup.stage] !== week) continue;
    const surv = cup.survivors;
    const winners = [];
    const roundMatches = [];
    for (let i = 0; i < surv.length; i += 2) {
      const a = surv[i], b = surv[i + 1];
      if (a === null && b === null) { winners.push(null); continue; }
      if (a === null) { winners.push(b); continue; }
      if (b === null) { winners.push(a); continue; }
      const m = match(a, b);
      m.cup = cup.id;
      simMatch(m);
      if (m.hg === m.ag) {
        const hr = teamRatings(m.home).ovr, ar = teamRatings(m.away).ovr;
        m.pens = true;
        m.winner = rand() < 0.5 + (hr - ar) / 60 ? m.home : m.away;
      } else m.winner = m.hg > m.ag ? m.home : m.away;
      winners.push(m.winner);
      roundMatches.push(m);
      if (m.home === state.userTid || m.away === state.userTid) out.push(Object.assign({ comp: cup.id }, m));
    }
    cup.rounds.push({ name: CUP_ROUND_NAMES[cup.stage] || `Round ${cup.stage + 1}`, week, matches: roundMatches });
    cup.survivors = winners;
    cup.stage++;
    if (cup.survivors.length === 1) {
      cup.winner = cup.survivors[0];
      const t = teamById(cup.winner);
      if (t) {
        t.budget = Math.round((t.budget + 6) * 10) / 10;
        addNews(`🏆 ${t.name} win the ${cup.name}!`);
      }
    }
  }
  return out;
}

function cupParticipant(cupId, tid) {
  const cup = state.cups && state.cups[cupId];
  if (!cup) return false;
  if (cup.survivors.includes(tid)) return true;
  return cup.rounds.some(r => r.matches.some(m => m.home === tid || m.away === tid));
}

// ---------- Accessors ----------
function teamById(tid) { return state.teams.find(t => t.tid === tid); }
function teamPlayers(tid) { return Object.values(state.players).filter(p => p.tid === tid && !p.retired); }
function freeAgents() { return Object.values(state.players).filter(p => p.tid === -1 && !p.retired); }
function allActivePlayers() { return Object.values(state.players).filter(p => p.tid >= 0 && !p.retired); }
function playablePlayers() {
  return allActivePlayers().filter(p => { const t = teamById(p.tid); return t && t.league !== "FOR"; });
}
function seasonLabel(s) { const y = s === undefined ? state.season : s; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
function leagueName(id) { const d = LEAGUE_DEFS.find(x => x.id === id); return d ? d.name : (id === "FOR" ? "Abroad" : id); }
function compName(id) {
  if (id === "UCL") return "Champions League";
  const c = CUP_DEFS.find(x => x.id === id);
  if (c) return c.name;
  return leagueName(id);
}

// ---------- Team strength ----------
function bestXI(tid) {
  const avail = teamPlayers(tid).filter(p => p.injury === 0).sort((a, b) => b.ovr - a.ovr);
  const slots = FORMATION_433.map(s => ({ slot: s, player: null, eff: 0 }));
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
      const assister = weightedPick(xi, ASSIST_W);
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
    if (rand() < 0.028) s.player.injury = ri(1, 7);
  }
}

// ---------- Simulation control ----------
function simWeek() {
  if (state.phase !== "season" || state.week >= WEEKS) return null;
  const results = [];
  for (const id of Object.keys(state.leagues)) {
    const lg = state.leagues[id];
    const r = lg.weekPlan[state.week];
    if (r >= 0) {
      for (const m of lg.schedule[r]) {
        simMatch(m);
        if (m.home === state.userTid || m.away === state.userTid) results.push(Object.assign({ comp: id }, m));
      }
    }
  }
  for (const m of simCLWeek(state.week)) {
    if (m.home === state.userTid || m.away === state.userTid) results.push(m);
  }
  for (const m of simCupWeek(state.week)) results.push(m);
  for (const p of Object.values(state.players)) { if (p.injury > 0) p.injury--; }
  state.offers = state.offers.filter(o => --o.ttl > 0);
  state.week++;
  if (state.week === 19) {
    addNews("The January transfer window is open — clubs across Europe are wheeling and dealing.");
    aiTransfers(0.5);
    generateOffersForUser();
  }
  if (state.week >= WEEKS) {
    state.phase = "offseason";
    concludeSeason();
  }
  return results;
}

function simWeeks(n) {
  const all = [];
  for (let i = 0; i < n; i++) {
    const r = simWeek();
    if (!r) break;
    all.push(r);
  }
  return all;
}

// ---------- Standings ----------
function standings(leagueId) {
  leagueId = leagueId || userLeague();
  const lg = state.leagues[leagueId];
  const rows = leagueTeams(leagueId).map(t => ({ tid: t.tid, name: t.name, abbrev: t.abbrev, colors: t.colors, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] }));
  const byTid = {}; for (const r of rows) byTid[r.tid] = r;
  for (const round of lg.schedule) {
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

function userLeague() { const t = teamById(state.userTid); return t ? t.league : "EPL"; }

function teamMatches(tid) {
  const out = [];
  const t = teamById(tid);
  if (!t) return out;
  const lg = state.leagues[t.league];
  if (lg) {
    lg.schedule.forEach((round, ridx) => {
      for (const m of round) if (m.home === tid || m.away === tid) out.push({ round: ridx, m, comp: t.league });
    });
  }
  if (state.cl && clParticipants().includes(tid)) {
    state.cl.groupRounds.forEach((round, ridx) => {
      for (const m of round) if (m.home === tid || m.away === tid) out.push({ round: ridx, m, comp: "UCL", week: CL_GROUP_WEEKS[ridx] });
    });
    for (const stage of ["r16", "qf", "sf", "final"]) {
      for (const m of state.cl[stage]) if (m.home === tid || m.away === tid) out.push({ round: -1, m, comp: "UCL", stage });
    }
  }
  if (state.cups) {
    for (const cup of Object.values(state.cups)) {
      if (cup.league !== t.league) continue;
      for (const r of cup.rounds) {
        for (const m of r.matches) if (m.home === tid || m.away === tid) out.push({ round: -1, m, comp: cup.id, stage: r.name });
      }
    }
  }
  return out;
}

// ---------- Stat leaders ----------
function leaders(stat, count) {
  return playablePlayers()
    .filter(p => p.stats.apps > 0)
    .sort((a, b) => b.stats[stat] - a.stats[stat] || a.stats.apps - b.stats.apps)
    .slice(0, count || 10);
}

// ---------- Season conclusion ----------
function concludeSeason() {
  const champions = {};
  for (const def of LEAGUE_DEFS) {
    const table = standings(def.id);
    state.leagues[def.id].lastTable = table;
    champions[def.id] = { name: table[0].name, abbrev: table[0].abbrev, pts: table[0].pts, tid: table[0].tid };
    addNews(`🏆 ${table[0].name} are ${seasonLabel()} ${def.name} champions with ${table[0].pts} points!`);
  }
  const boot = leaders("goals", 1)[0];
  const play = leaders("assists", 1)[0];
  const glove = leaders("cs", 1)[0];
  const pool = playablePlayers().filter(p => p.stats.apps >= 10);
  const score = p => p.stats.goals * 1.0 + p.stats.assists * 0.75 + p.stats.cs * 0.9 + p.ovr * 0.12;
  const poty = pool.slice().sort((a, b) => score(b) - score(a))[0];
  const ypoty = pool.filter(p => p.age <= 21).sort((a, b) => score(b) - score(a))[0];
  const clW = state.cl && state.cl.winner ? teamById(state.cl.winner) : null;

  // Ballon d'Or: season score plus silverware bonuses
  const champTids = new Set(Object.values(champions).map(c => c.tid));
  const bdorScore = p => {
    let sc = score(p) + p.ovr * 0.10;
    if (champTids.has(p.tid) && p.stats.apps >= 15) sc += 6;
    if (clW && p.tid === clW.tid && p.stats.apps >= 15) sc += 10;
    return sc;
  };
  const bdorPodium = pool.slice().sort((a, b) => bdorScore(b) - bdorScore(a)).slice(0, 3)
    .map(p => ({ name: p.name, team: teamName(p.tid), abbrev: teamAbbrev(p.tid), pos: p.pos, pid: p.pid, value: Math.round(bdorScore(p)) }));

  // FIFPRO World XI: 1 GK, 4 DF (RB/CB/CB/LB), 3 MF, 3 FW by season score
  const worldXI = [];
  const used = new Set();
  const pickBest = (filter, n) => {
    const c = pool.filter(p => !used.has(p.pid) && filter(p)).sort((a, b) => score(b) - score(a)).slice(0, n);
    for (const p of c) { used.add(p.pid); worldXI.push({ name: p.name, pos: p.pos, abbrev: teamAbbrev(p.tid), pid: p.pid }); }
  };
  pickBest(p => p.pos === "GK", 1);
  pickBest(p => p.pos === "RB", 1);
  pickBest(p => p.pos === "CB", 2);
  pickBest(p => p.pos === "LB", 1);
  pickBest(p => ["DM", "CM", "AM"].includes(p.pos), 3);
  pickBest(p => ["LW", "RW", "ST"].includes(p.pos), 3);

  const entry = {
    season: state.season,
    champions,
    clWinner: clW ? { name: clW.name, abbrev: clW.abbrev } : null,
    tables: Object.fromEntries(LEAGUE_DEFS.map(d => [d.id, state.leagues[d.id].lastTable.map(r => ({ pos: r.pos, name: r.name, pts: r.pts, w: r.w, d: r.d, l: r.l, gd: r.gd }))])),
    goldenBoot: boot ? award(boot, boot.stats.goals, "goals") : null,
    playmaker: play ? award(play, play.stats.assists, "assists") : null,
    goldenGlove: glove ? award(glove, glove.stats.cs, "clean sheets") : null,
    poty: poty ? award(poty, Math.round(score(poty)), "rating") : null,
    ypoty: ypoty ? award(ypoty, Math.round(score(ypoty)), "rating") : null,
    bdor: bdorPodium,
    worldXI,
    cups: state.cups ? Object.values(state.cups).filter(c => c.winner !== null).map(c => {
      const t = teamById(c.winner);
      return { id: c.id, name: c.name, league: c.league, winner: t ? t.name : "—", abbrev: t ? t.abbrev : "—" };
    }) : [],
    userPos: standings(userLeague()).find(r => r.tid === state.userTid)?.pos || 0,
    userTeam: teamById(state.userTid).name,
    userLeague: userLeague(),
  };
  state.history.push(entry);
  if (bdorPodium.length) addNews(`🏅 Ballon d'Or: ${bdorPodium[0].name} (${bdorPodium[0].team})! Podium: ${bdorPodium.map((b, i) => `${i + 1}. ${b.name}`).join(", ")}.`);
  if (boot) addNews(`👟 European Golden Boot: ${boot.name} (${teamName(boot.tid)}) with ${boot.stats.goals} goals.`);
  if (worldXI.length) addNews(`🌍 FIFPRO World XI announced: ${worldXI.map(w => w.name).join(", ")}.`);
  if (glove) addNews(`🧤 Yashin Trophy: ${glove.name} (${teamName(glove.tid)}) with ${glove.stats.cs} clean sheets.`);
  if (ypoty) addNews(`🌟 Golden Boy: ${ypoty.name} (${teamName(ypoty.tid)}).`);
  if (entry.cups.length) {
    const userCup = entry.cups.find(c => c.abbrev === teamAbbrev(state.userTid));
    if (userCup) addNews(`🎉 Congratulations boss — ${teamName(state.userTid)} lifted the ${userCup.name}!`, state.userTid);
  }
}

function award(p, value, label) {
  return { name: p.name, team: teamName(p.tid), abbrev: teamAbbrev(p.tid), value, label, pid: p.pid };
}
function teamName(tid) { const t = teamById(tid); return t ? t.name : (tid === -1 ? "Free agent" : "—"); }
function teamAbbrev(tid) { const t = teamById(tid); return t ? t.abbrev : "FA"; }

// ---------- Offseason ----------
function advanceToNextSeason() {
  if (state.phase !== "offseason") return false;

  // Synthesize league stats for foreign-club players who didn't play CL (career flavor)
  for (const p of allActivePlayers()) {
    const t = teamById(p.tid);
    if (t && t.league === "FOR" && p.stats.apps === 0 && p.age >= 17) {
      p.stats.apps = ri(16, 33);
      const g = { FW: ri(3, 18), MF: ri(1, 8), DF: ri(0, 3), GK: 0 }[POS_GROUP[p.pos]];
      p.stats.goals = Math.round(g * (p.ovr / 78));
      p.stats.assists = ri(0, 7);
      if (p.pos === "GK") p.stats.cs = ri(5, 14);
    }
  }
  // 1. Archive per-player season rows
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    if (p.stats.apps > 0 || p.tid >= 0) {
      p.career.push({ season: state.season, team: p.tid >= 0 ? teamAbbrev(p.tid) : "FA", ...p.stats, ovr: p.ovr, age: p.age });
    }
  }
  // 2. Team history + finances
  for (const def of LEAGUE_DEFS) {
    const table = state.leagues[def.id].lastTable || standings(def.id);
    for (const row of table) {
      const t = teamById(row.tid);
      if (!t) continue;
      t.history.push({ season: state.season, pos: row.pos, pts: row.pts, league: def.id });
      const prize = 62 - (row.pos - 1) * (44 / table.length);
      const wageBillYr = teamPlayers(t.tid).reduce((s, p) => s + p.wage, 0) * 52 / 1000;
      t.budget = clamp(Math.round((t.budget + prize + t.stature * 9 - wageBillYr * 0.45) * 10) / 10, 5, 320);
    }
  }
  for (const t of state.teams.filter(x => x.league === "FOR")) {
    t.budget = clamp(Math.round((t.budget + 12 + t.stature * 8) * 10) / 10, 5, 200);
  }
  // CL prize money
  if (state.cl) {
    for (const tid of clParticipants()) { const t = teamById(tid); if (t) t.budget = Math.round((t.budget + 9) * 10) / 10; }
  }

  // 3. Promotion & relegation per league
  for (const def of LEAGUE_DEFS) handleRelegation(def.id);

  // 4. Development, aging, retirement
  developAllPlayers();

  // 5. Contracts
  handleContracts();

  // 6. Youth intake
  for (const t of state.teams) {
    if (t.league === "FOR") { fillSquad(t); continue; }
    const n = ri(2, 3);
    for (let i = 0; i < n; i++) {
      const yp = generateYouth(t.tid, t.stature);
      state.players[yp.pid] = yp;
      if (t.tid === state.userTid) addNews(`🎓 Youth academy: ${yp.name} (${yp.pos}, ${yp.age}) joins your first-team squad.`, t.tid);
    }
    fillSquad(t);
  }

  // 7. New season baseline
  state.season++;
  state.week = 0;
  state.phase = "season";
  for (const p of Object.values(state.players)) p.stats = blankStats();

  // 8. Real-player debuts + real-history transfers arriving this season
  spawnDebuts();
  applyScheduledMoves();

  // 9. AI transfer window + offers
  aiTransfers(1.0);
  generateOffersForUser();
  pruneFreeAgents();

  // 10. Schedules + CL + domestic cups
  for (const id of Object.keys(state.leagues)) buildLeagueSeason(id);
  setupChampionsLeague(false);
  setupCups();

  const ut = teamById(state.userTid);
  addNews(`A new ${seasonLabel()} season kicks off! ${ut.name} start with a £${ut.budget}m transfer kitty.`);
  return true;
}

function spawnDebuts() {
  const remaining = [];
  for (const d of state.futureDebuts) {
    if (d.year > state.season) { remaining.push(d); continue; }
    const t = state.teams.find(x => x.abbrev === d.club);
    const overdue = state.season - d.year;
    if (!t && overdue < 3) { remaining.push(d); continue; }
    const age = state.season - d.birthYear;
    if (age > 36) continue;
    const ovr = ovrAtAge(d.peak, age, d.pos, d.name);
    const pot = age < 27 ? Math.max(d.peak, ovr) : ovr;
    const tid = t ? t.tid : -1;
    const p = makePlayer(d.name, d.pos, age, ovr, pot, d.natl, tid, { years: ri(2, 5) });
    state.players[p.pid] = p;
    if (t && d.stints) scheduleCareerMoves(p.pid, d.stints, d.year, d.endYear || 2100, d.club);
    if (d.peak >= 87) addNews(`🌟 Wonderkid alert: ${d.name} (${d.pos}, ${age}) has broken into the ${t ? t.name : "free agent"} first team. Scouts say he could be generational.`);
    else if (d.peak >= 80) addNews(`📈 Debut: ${d.name} (${d.pos}, ${age}) makes the step up at ${t ? t.name : "a club abroad"}.`);
  }
  state.futureDebuts = remaining;
}

// Record a placed real player's remaining timeline as scheduled transfers.
function scheduleCareerMoves(pid, stints, fromYear, endYear, currentClub) {
  let prev = currentClub;
  for (const [y, club] of stints) {
    if (y <= fromYear || y > endYear) continue;
    state.futureMoves.push({ year: y, pid, club, prevClub: prev });
    prev = club;
  }
}

// Apply this season's real-history transfers — unless the timeline has already
// diverged (the player was moved by you or the AI, or is now at your club).
function applyScheduledMoves() {
  const remaining = [];
  const diverged = {};
  for (const mv of state.futureMoves) {
    if (mv.year > state.season) { remaining.push(mv); continue; }
    const p = state.players[mv.pid];
    if (!p || p.retired || diverged[mv.pid]) continue;
    if (p.tid === state.userTid) { diverged[mv.pid] = true; continue; } // your squad, your rules
    const from = p.tid >= 0 ? teamById(p.tid) : null;
    if (!from || from.abbrev !== mv.prevClub) { diverged[mv.pid] = true; continue; }
    const dest = state.teams.find(t => t.abbrev === mv.club);
    if (!dest) continue;
    if (dest.tid === state.userTid) {
      // History says he joins YOUR club — he agitates for the move instead of forcing it.
      p.agitateFor = state.userTid;
      addNews(`📣 ${p.name} wants to join ${dest.name} — his agent says a fair bid would be accepted. (History says this is your signing to make.)`, state.userTid);
      continue;
    }
    if (teamPlayers(dest.tid).length >= 32) continue;
    const fee = Math.min(playerValue(p), Math.max(0, dest.budget));
    transferPlayer(p, dest.tid, fee, from);
  }
  state.futureMoves = remaining;
}

function handleRelegation(leagueId) {
  const lg = state.leagues[leagueId];
  const table = lg.lastTable || standings(leagueId);
  let down = table.slice(-3);
  if (down.some(r => r.tid === state.userTid)) {
    down = down.filter(r => r.tid !== state.userTid);
    const replacement = table[table.length - 4];
    down.push(replacement);
    addNews(`😅 Your board pulled every string imaginable — ${teamById(state.userTid).name} avoid the drop on a technicality. ${replacement.name} go down instead.`);
  }
  const promoted = shuffle(lg.pool).slice(0, 3);
  lg.pool = lg.pool.filter(c => !promoted.includes(c));

  for (const r of down) {
    const t = teamById(r.tid);
    if (!t) continue;
    addNews(`⬇️ ${t.name} are relegated from the ${lg.name}.`);
    const squad = teamPlayers(t.tid).sort((a, b) => b.ovr - a.ovr);
    let sold = 0;
    for (const p of squad) {
      if (sold < 4 && (p.ovr >= 77 || (p.pot >= 84 && p.age <= 23))) {
        const buyers = state.teams.filter(x => x.tid !== t.tid && x.league !== "FOR" && !down.some(dd => dd.tid === x.tid) && x.budget >= playerValue(p));
        if (buyers.length) {
          const buyer = buyers.sort((a, b) => b.budget - a.budget)[ri(0, Math.min(4, buyers.length - 1))];
          transferPlayer(p, buyer.tid, playerValue(p), t);
          sold++;
          continue;
        }
      }
      p.tid = -1; p.listed = false;
    }
    lg.pool.push({ name: t.name, abbrev: t.abbrev, stadium: t.stadium, colors: t.colors, stature: Math.max(1, t.stature - 1) });
    state.teams.splice(state.teams.indexOf(t), 1);
  }
  for (const club of promoted) {
    const team = createTeam({ ...club, budget: 22 + club.stature * 10 }, leagueId);
    for (const pos of SQUAD_TEMPLATE) {
      const p = generateSquadPlayer(team.tid, club.stature, pos);
      state.players[p.pid] = p;
    }
    addNews(`⬆️ ${club.name} are promoted to the ${lg.name}!`);
  }
}

// How well did the player perform this season, relative to what's expected for
// their rating & position? Returns roughly -1 (awful) .. +1.6 (career year).
function seasonPerformanceIndex(p) {
  const apps = p.stats.apps;
  if (apps < 6) return null; // barely featured — handled separately (rust)
  const per = x => x / apps;
  const grp = POS_GROUP[p.pos];
  const g = p.stats.goals, a = p.stats.assists, cs = p.stats.cs;
  let val, exp;
  if (grp === "FW") {
    val = per(g + a * 0.6);
    exp = Math.max(0.16, (p.ovr - 58) / 40 * 0.62);
  } else if (grp === "MF") {
    val = per(g + a);
    exp = Math.max(0.12, (p.ovr - 58) / 40 * 0.48);
  } else if (grp === "DF") {
    val = per(cs) + per(g + a) * 0.6;
    exp = Math.max(0.18, (p.ovr - 55) / 45 * 0.34);
  } else { // GK
    val = per(cs);
    exp = Math.max(0.22, (p.ovr - 55) / 45 * 0.42);
  }
  return clamp((val - exp) / exp, -1, 1.6);
}

function developAllPlayers() {
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
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

    // Performance this season nudges the rating up or down, every season.
    const perf = seasonPerformanceIndex(p);
    let perfD = 0;
    if (perf === null) {
      perfD = (a <= 21) ? 0 : -1; // benched: prospects unaffected, veterans rust
    } else {
      perfD = Math.round(perf * 3.2); // -3 .. +5
      if (p.stats.apps >= 30 && perf > 0.3) perfD += 1; // full season of quality
      // A standout season can lift a young player's ceiling.
      if (a <= 23 && perf >= 0.7) p.pot = clamp(p.pot + ri(1, 3), p.ovr, 97);
      // A veteran defying age hangs on: cancel some age decline if producing.
      if (a >= 30 && perf > 0.4 && d < 0) d = Math.min(0, d + 2);
    }
    perfD = clamp(perfD, -4, 5);
    let total = d + perfD;

    if (total > 0) {
      // Growth caps at potential — but a genuine career year can nudge just past it.
      const ceiling = perf !== null && perf >= 1.0 ? Math.min(99, p.pot + 1) : p.pot;
      p.ovr = clamp(p.ovr + total, 40, ceiling);
    } else {
      p.ovr = clamp(p.ovr + total, 40, 99);
    }
    if (a <= 23) p.pot = clamp(p.pot + ri(-2, 2), p.ovr, 97);
    else p.pot = Math.max(p.ovr, p.pot - 1);
    p.age++;

    const retireAge = p.pos === "GK" ? 36 : 34;
    if (p.age >= retireAge) {
      const prob = (p.age - retireAge + 1) * 0.3 + (p.ovr < 70 ? 0.3 : 0);
      if (rand() < prob || p.age >= retireAge + 5) retirePlayer(p);
    } else if (p.tid === -1 && p.age >= 31 && p.ovr < 70 && rand() < 0.5) {
      retirePlayer(p);
    }
  }
}

function retirePlayer(p) {
  const careerGoals = p.career.reduce((s, c) => s + c.goals, 0);
  if (p.ovr >= 78 || careerGoals >= 80 || p.pot >= 90) addNews(`👋 ${p.name} (${p.pos}, ${p.age}) has announced his retirement after a distinguished career (${careerGoals} career goals).`);
  p.retired = true;
  p.tid = -3;
  p.listed = false;
}

function handleContracts() {
  // Players whose real-career timeline is still in play never drift into free agency.
  const onScript = new Set((state.futureMoves || []).map(m => m.pid));
  for (const p of Object.values(state.players)) {
    if (p.retired || p.tid < 0) continue;
    p.years--;
    if (p.years <= 0) {
      const isUser = p.tid === state.userTid;
      const resignProb = p.ovr >= 82 ? 0.92 : p.ovr >= 76 ? 0.75 : p.ovr >= 70 ? 0.6 : 0.35;
      if (!isUser && (onScript.has(p.pid) || p.agitateFor !== undefined)) {
        p.years = ri(1, 2); p.wage = wageFor(p.ovr);
      } else if (!isUser && rand() < resignProb && p.ovr >= 68) {
        p.years = ri(2, 4); p.wage = wageFor(p.ovr);
      } else if (isUser && rand() < 0.35) {
        p.years = 1; p.wage = wageFor(p.ovr);
        addNews(`✍️ ${p.name} agreed a 1-year extension to stay at the club.`, p.tid);
      } else {
        if (isUser) addNews(`🚪 ${p.name}'s contract expired — he leaves on a free transfer.`, p.tid);
        p.tid = -1; p.listed = false; p.years = 0;
      }
    }
  }
  for (const p of freeAgents()) p.wage = wageFor(p.ovr);
}

function pruneFreeAgents() {
  const fas = freeAgents().sort((a, b) => (b.ovr + b.pot) - (a.ovr + a.pot));
  for (const p of fas.slice(110)) { p.retired = true; p.tid = -3; }
}

// ---------- Transfers ----------
function transferPlayer(p, toTid, fee, fromTeam) {
  const toTeam = teamById(toTid);
  if (fromTeam) fromTeam.budget = Math.round((fromTeam.budget + fee) * 10) / 10;
  if (toTeam) toTeam.budget = Math.round((toTeam.budget - fee) * 10) / 10;
  p.tid = toTid;
  p.listed = false;
  delete p.agitateFor;
  p.years = ri(2, 4);
  p.wage = wageFor(p.ovr);
  addNews(`💸 ${p.name} joins ${toTeam ? toTeam.name : "?"}${fromTeam ? ` from ${fromTeam.name}` : " on a free transfer"}${fee > 0 ? ` for £${fee}m` : ""}.`);
}

function askingPrice(p) {
  const v = playerValue(p);
  if (p.tid === -1) return Math.max(0.3, Math.round(v * 0.2 * 10) / 10);
  if (p.agitateFor === state.userTid) return Math.round(v * 0.95 * 10) / 10;
  if (p.listed) return Math.round(v * 0.9 * 10) / 10;
  const squad = teamPlayers(p.tid).sort((a, b) => b.ovr - a.ovr);
  const rank = squad.indexOf(p);
  if (rank < 3 || p.ovr >= 86) return Math.round(v * 1.8 * 10) / 10;
  if (rank < 8) return Math.round(v * 1.35 * 10) / 10;
  return Math.round(v * 1.1 * 10) / 10;
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
  const wasFA = p.tid === -1;
  transferPlayer(p, state.userTid, wasFA ? 0 : price, seller);
  if (wasFA) user.budget = Math.round((user.budget - price) * 10) / 10;
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

function rejectOffer(offerId) { state.offers = state.offers.filter(x => x.id !== offerId); }

function toggleListed(pid) {
  const p = state.players[pid];
  if (p && p.tid === state.userTid) { p.listed = !p.listed; if (p.listed) generateOffersForUser(p.pid); }
}

// ---------- Contract negotiations ----------
// What a player wants in a new/extended deal. `context` = "extend" | "sign".
function contractDemand(p, context) {
  const base = wageFor(p.ovr);
  // Star players and in-demand youngsters want a premium; a new signing asks more.
  let mult = 1.0;
  if (p.ovr >= 86) mult = 1.45;
  else if (p.ovr >= 82) mult = 1.3;
  else if (p.ovr >= 78) mult = 1.18;
  else if (p.ovr >= 72) mult = 1.08;
  if (p.age <= 22 && p.pot >= p.ovr + 6) mult += 0.12; // wonderkid premium
  if (context === "sign") mult *= 1.08;               // moving clubs costs more
  const wage = Math.max(5, Math.round(base * mult));
  // Younger players want longer security; older want shorter.
  let years;
  if (p.age <= 24) years = 5;
  else if (p.age <= 28) years = 4;
  else if (p.age <= 31) years = 3;
  else years = 2;
  return { wage, years };
}

// Evaluate the user's proposed { wage, years } against the player's demand.
// Returns { accepted } or { accepted:false, counter, walk } where `counter`
// is the player's revised (softened) demand and `walk` ends the talks.
function evaluateContractOffer(p, demand, offerWage, offerYears, round) {
  const wr = offerWage / demand.wage;
  const yearsOff = Math.abs(offerYears - demand.years);
  // Insultingly low → player may walk on later rounds.
  if (wr < 0.72) {
    if (round >= 2) return { accepted: false, walk: true, counter: demand };
    return { accepted: false, counter: demand };
  }
  // Meets or beats their ask (and length close enough) → accept.
  if (wr >= 0.99 && offerYears >= demand.years - 1) return { accepted: true };
  // Close on wages → probabilistic accept, better odds the closer you are.
  if (wr >= 0.9) {
    const chance = 0.35 + (wr - 0.9) * 5 - yearsOff * 0.08;
    if (rand() < chance) return { accepted: true };
  }
  // Otherwise counter: player softens their demand toward your offer.
  const counterWage = Math.max(offerWage + 1, Math.round(demand.wage * 0.68 + offerWage * 0.32));
  const counterYears = offerYears > demand.years ? demand.years : (offerYears < demand.years - 1 ? demand.years - 1 : demand.years);
  return { accepted: false, counter: { wage: Math.min(counterWage, demand.wage), years: counterYears } };
}

// Apply an agreed extension for one of the user's own players.
function agreeExtension(pid, wage, years) {
  const p = state.players[pid];
  if (!p || p.tid !== state.userTid) return { ok: false, msg: "Not your player." };
  p.wage = Math.max(5, Math.round(wage));
  p.years = clamp(Math.round(years), 1, 6);
  delete p.agitateFor;
  p.listed = false;
  addNews(`✍️ ${p.name} signs a new ${p.years}-year deal worth £${p.wage}k/week.`, p.tid);
  return { ok: true, msg: `${p.name} agreed a ${p.years}-year contract at £${p.wage}k/week.` };
}

// Complete a transfer once personal terms are agreed. Handles fee + squad rules.
function agreeSigning(pid, wage, years) {
  const p = state.players[pid];
  const user = teamById(state.userTid);
  if (!p || p.retired || p.tid === state.userTid) return { ok: false, msg: "Unavailable." };
  if (teamPlayers(state.userTid).length >= 32) return { ok: false, msg: "Squad is full (32 max)." };
  const price = askingPrice(p);
  if (price > user.budget) return { ok: false, msg: `Not enough budget (need £${price}m, have £${user.budget}m).` };
  const seller = p.tid >= 0 ? teamById(p.tid) : null;
  if (seller && teamPlayers(seller.tid).length <= 15) return { ok: false, msg: `${seller.name} refuse — their squad is too thin.` };
  const wasFA = p.tid === -1;
  transferPlayer(p, state.userTid, wasFA ? 0 : price, seller);
  if (wasFA) user.budget = Math.round((user.budget - price) * 10) / 10;
  p.wage = Math.max(5, Math.round(wage));
  p.years = clamp(Math.round(years), 1, 6);
  return { ok: true, msg: `${p.name} signs for ${user.name} on a ${p.years}-year deal!` };
}

function generateOffersForUser(onlyPid) {
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
    const foreign = team.league === "FOR";
    let moves = Math.round((1 + rand() * 2) * intensity * (foreign ? 0.4 : 0.6 + team.budget / 120));
    const squad = teamPlayers(team.tid).sort((a, b) => b.ovr - a.ovr);
    for (let i = 24; i < squad.length; i++) if (rand() < 0.5) squad[i].listed = true;
    while (moves-- > 0) {
      const squadNow = teamPlayers(team.tid);
      if (squadNow.length >= 30) break;
      const groups = { GK: [], DF: [], MF: [], FW: [] };
      for (const p of squadNow) groups[POS_GROUP[p.pos]].push(p.ovr);
      let worst = "MF", worstAvg = 999;
      for (const g of Object.keys(groups)) {
        const top = groups[g].sort((a, b) => b - a).slice(0, g === "GK" ? 1 : 4);
        const avg = top.length ? top.reduce((s, v) => s + v, 0) / top.length : 0;
        if (avg < worstAvg) { worstAvg = avg; worst = g; }
      }
      const cands = Object.values(state.players).filter(p =>
        !p.retired && p.tid !== team.tid && POS_GROUP[p.pos] === worst &&
        p.agitateFor === undefined &&
        (p.tid === -1 || (p.listed && p.tid !== state.userTid)) &&
        !(p.tid === -1 && p.ovr >= 80 && team.stature < 4) && // stars won't drop down for free
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
  const out = {};
  Object.keys(base).forEach((k, i) => { out[k] = clamp(base[k] + posAdj[k] + noise(i), 20, 99); });
  if (p.pos === "GK") { out.reflexes = clamp(o + noise(0), 20, 99); out.handling = clamp(o - 2 + noise(1), 20, 99); }
  return out;
}

// ---------- Real record books & player honours ----------
function clubNameByAbbrev(ab) {
  const t = state ? state.teams.find(x => x.abbrev === ab) : null;
  if (t) return t.name;
  for (const def of LEAGUE_DEFS) {
    const hit = def.teams().find(c => c.abbrev === ab) || def.pool().find(c => c.abbrev === ab);
    if (hit) return hit.name;
  }
  const f = FOREIGN_CLUBS.find(c => c.abbrev === ab);
  return f ? f.name : ab;
}

// Seasons before the user's start season, from the real record books.
// Each entry's `year` is the season's start year (2007 = the 2007-08 season).
function preHistory() {
  const start = state.startSeason || state.season;
  const out = [];
  for (let finalYear = 2000; finalYear <= start; finalYear++) {
    out.push({
      year: finalYear - 1,
      bdor: PRE_AWARDS.bdor[finalYear] || null,
      boot: PRE_AWARDS.boot[finalYear] || null,
      cl: PRE_AWARDS.cl[finalYear] ? clubNameByAbbrev(PRE_AWARDS.cl[finalYear]) : null,
      champs: Object.fromEntries(LEAGUE_DEFS.map(d => [d.id, PRE_AWARDS.champs[d.id][finalYear] ? clubNameByAbbrev(PRE_AWARDS.champs[d.id][finalYear]) : null])),
    });
  }
  return out.reverse();
}

// All honours for a player, real (pre-start) + earned in your save.
function honoursFor(name) {
  const start = state.startSeason || state.season;
  const out = [];
  for (const [y, w] of Object.entries(PRE_AWARDS.bdor)) {
    if (+y <= start && w === name) out.push({ season: +y - 1, award: "Ballon d'Or", real: true });
  }
  for (const [y, w] of Object.entries(PRE_AWARDS.boot)) {
    if (+y <= start && w.split(" & ").includes(name)) out.push({ season: +y - 1, award: "European Golden Boot", real: true });
  }
  for (const h of state.history) {
    if (h.bdor && h.bdor[0] && h.bdor[0].name === name) out.push({ season: h.season, award: "Ballon d'Or" });
    if (h.goldenBoot && h.goldenBoot.name === name) out.push({ season: h.season, award: "European Golden Boot" });
    if (h.worldXI && h.worldXI.some(w => w.name === name)) out.push({ season: h.season, award: "FIFPRO World XI" });
    if (h.playmaker && h.playmaker.name === name) out.push({ season: h.season, award: "Playmaker of the Season" });
    if (h.goldenGlove && h.goldenGlove.name === name) out.push({ season: h.season, award: "Yashin Trophy" });
    if (h.ypoty && h.ypoty.name === name) out.push({ season: h.season, award: "Golden Boy" });
  }
  out.sort((a, b) => a.season - b.season);
  return out;
}

// ---------- News ----------
function addNews(text, tid) {
  state.news.unshift({ season: state.season, week: state.week, text, tid: tid === undefined ? null : tid });
  if (state.news.length > 300) state.news.length = 300;
}

// ---------- Persistence ----------
function save() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* blocked/quota */ }
}
function load() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.version !== 2) return false;
    state = s;
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
  if (!s.teams || !s.players || !s.leagues) throw new Error("Not a Football GM save file");
  state = s;
  save();
}

// ---------- Public API ----------
const FGM = {
  get state() { return state; },
  WEEKS, MIN_START, MAX_START, LEAGUE_DEFS, CL_GROUP_WEEKS, CL_KO_WEEKS,
  newLeague, save, load, reset, exportJSON, importJSON,
  simWeek, simWeeks, advanceToNextSeason,
  standings, teamMatches, leaders, bestXI, teamRatings, leagueTeams, userLeague, leagueName, compName,
  teamById, teamPlayers, freeAgents, allActivePlayers, playablePlayers,
  playerValue, askingPrice, wageFor, subRatings, seasonLabel,
  userBuy, userSell, rejectOffer, toggleListed,
  contractDemand, evaluateContractOffer, agreeExtension, agreeSigning,
  addNews, teamName, teamAbbrev, clGroupTable, clParticipants,
  preHistory, honoursFor, clubNameByAbbrev,
  CUP_DEFS, cupParticipant,
  userCups() { const t = teamById(state.userTid); return state.cups ? Object.values(state.cups).filter(c => c.league === (t ? t.league : "")) : []; },
  POS_GROUP,
  setUserTid(tid) { state.userTid = tid; },
};

root.FGM = FGM;
if (typeof module !== "undefined") module.exports = FGM;

})(typeof globalThis !== "undefined" ? globalThis : this);
