// Football GM — UI layer v2 (vanilla JS, hash routing)
/* global FGM, LEAGUE_DEFS */
(function () {
"use strict";

const $ = sel => document.querySelector(sel);
const content = $("#content");
let currentView = "dashboard";
let sortState = { key: "ovr", dir: 1 }; // dir 1 = natural (numbers high→low, strings A→Z)
let viewLeague = null; // league tab selection for standings/fixtures

// ---------- Helpers ----------
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function ovrClass(o) {
  if (o >= 86) return "ovr-elite";
  if (o >= 80) return "ovr-great";
  if (o >= 74) return "ovr-good";
  if (o >= 68) return "ovr-ok";
  return "ovr-poor";
}
function ovrSpan(o) { return `<span class="ovr ${ovrClass(o)}">${o}</span>`; }
function posBadge(pos) { return `<span class="pos-badge pos-${FGM.POS_GROUP[pos]}">${pos}</span>`; }
function money(v) { return `£${Number(v).toFixed(1).replace(/\.0$/, "")}m`; }
function teamDot(t) { return `<span class="team-dot" style="background:${t.colors[0]}"></span>`; }
function playerLink(p) { return `<span class="player-link" data-pid="${p.pid}">${esc(p.name)}</span>`; }
function teamLink(t) { return `<span class="team-link" data-tid="${t.tid}">${teamDot(t)}${esc(t.name)}</span>`; }
function injBadge(p) { return p.injury > 0 ? ` <span class="badge badge-inj">INJ ${p.injury}</span>` : ""; }
function listedBadge(p) { return p.listed ? ` <span class="badge badge-listed">LISTED</span>` : ""; }
function wantsBadge(p) { return p.agitateFor === FGM.state.userTid ? ` <span class="badge badge-gold">WANTS YOU</span>` : ""; }
function ord(n) { return n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"; }

// ---------- Toasts (weekly result notifications) ----------
function toastHost() {
  let h = $("#toasts");
  if (!h) {
    h = document.createElement("div");
    h.id = "toasts";
    document.body.appendChild(h);
  }
  return h;
}
function toast(msg, cls, ms) {
  const el = document.createElement("div");
  el.className = "toast " + (cls || "");
  el.innerHTML = msg;
  toastHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 350); }, ms || 3400);
}

function resultToasts(weekResults) {
  // weekResults: array (one entry per simmed week) of arrays of user matches
  const flat = [];
  for (const wk of weekResults) for (const m of wk) flat.push(m);
  if (!flat.length) return;
  const s = FGM.state;
  const describe = m => {
    const isHome = m.home === s.userTid;
    const opp = FGM.teamById(isHome ? m.away : m.home);
    const gf = isHome ? m.hg : m.ag, ga = isHome ? m.ag : m.hg;
    const res = gf > ga ? "W" : gf < ga ? "L" : "D";
    const comp = m.comp && m.comp !== FGM.userLeague() ? ` · ${esc(FGM.compName(m.comp))}` : "";
    const pen = m.pens ? (m.winner === s.userTid ? " (won on pens)" : " (lost on pens)") : "";
    return { res, html: `<strong>${res}</strong> ${gf}–${ga} ${isHome ? "vs" : "@"} ${esc(opp ? opp.name : "?")}${comp}${pen}` };
  };
  if (flat.length <= 6) {
    flat.forEach((m, i) => {
      const d = describe(m);
      setTimeout(() => toast(d.html, "toast-" + d.res), i * 650);
    });
  } else {
    let w = 0, dr = 0, l = 0;
    for (const m of flat) {
      const d = describe(m).res;
      if (d === "W") w++; else if (d === "L") l++; else dr++;
    }
    const last = describe(flat[flat.length - 1]);
    toast(`Simmed ${weekResults.length} weeks: <strong>${w}W ${dr}D ${l}L</strong> · last: ${last.html}`, w >= l ? "toast-W" : "toast-L", 5000);
  }
}

// ---------- Modal ----------
function openModal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal-overlay").classList.remove("hidden");
}
function closeModal() { $("#modal-overlay").classList.add("hidden"); }
$("#modal-close").addEventListener("click", closeModal);
$("#modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });

// ---------- Topbar ----------
function refreshTopbar() {
  const s = FGM.state;
  if (!s || s.userTid < 0) { $("#top-status").textContent = "New career"; return; }
  const t = FGM.teamById(s.userTid);
  $("#top-team").textContent = `${t.name} · ${money(t.budget)}`;
  $("#top-status").textContent = s.phase === "offseason"
    ? `${FGM.seasonLabel()} complete`
    : `${FGM.seasonLabel()} · Week ${s.week + 1}/${FGM.WEEKS}`;
  $("#play-offseason").style.display = s.phase === "offseason" ? "block" : "none";
}

// ---------- Sim controls ----------
const playBtn = $("#play-btn");
const playDropdown = $("#play-dropdown");
playBtn.addEventListener("click", () => playDropdown.classList.toggle("hidden"));
document.addEventListener("click", e => {
  if (!e.target.closest(".play-menu")) playDropdown.classList.add("hidden");
});
playDropdown.addEventListener("click", e => {
  const act = e.target.dataset.sim;
  if (!act) return;
  playDropdown.classList.add("hidden");
  const s = FGM.state;
  if (!s) return;
  if (act === "offseason") {
    if (s.phase !== "offseason") { toast("The season isn't over yet."); return; }
    FGM.advanceToNextSeason();
    FGM.save();
    toast(`🌞 Welcome to the ${FGM.seasonLabel()} season!`, "toast-W");
    render();
    return;
  }
  if (s.phase === "offseason") { toast("Season over — use “Continue to next season”."); return; }
  if (act === "watch") {
    const weekResults = FGM.simWeeks(1);
    FGM.save();
    const um = weekResults.length ? weekResults[0].find(m => (m.home === s.userTid || m.away === s.userTid) && m.events) : null;
    if (um) {
      playLiveMatch(um, () => {
        resultToasts(weekResults);
        if (FGM.state.phase === "offseason") toast("🏁 Season complete!", "toast-W", 5000);
        render();
      });
    } else {
      toast("No match for your club this week.", "toast-D");
      resultToasts(weekResults);
      render();
    }
    return;
  }
  const n = act === "one" ? 1 : act === "month" ? 4 : FGM.WEEKS;
  const weekResults = FGM.simWeeks(n);
  FGM.save();
  resultToasts(weekResults);
  if (act === "one" && weekResults.length) {
    const um = weekResults[0].find(m => m.home === s.userTid || m.away === s.userTid);
    if (um) showMatchModal(um);
  }
  if (FGM.state.phase === "offseason") toast("🏁 Season complete! Check News & History, then continue to next season.", "toast-W", 5000);
  render();
});

// ---------- Live match viewer ----------
let liveTimer = null;
function playLiveMatch(m, onDone) {
  const h = FGM.teamById(m.home), a = FGM.teamById(m.away);
  if (!h || !a) { onDone && onDone(); return; }
  const events = (m.events || []).slice().sort((x, y) => x.min - y.min);
  const total = 96;
  let minute = 0, hg = 0, ag = 0, ei = 0, finished = false;
  const compLabel = m.comp && m.comp !== FGM.userLeague() ? FGM.compName(m.comp) : FGM.leagueName(FGM.userLeague());

  const paint = (feed) => {
    openModal(`
      <div class="live-head" style="background:linear-gradient(120deg, ${h.colors[0]}22, ${a.colors[0]}22)">
        <div class="live-comp">${esc(compLabel)} · ${esc(h.stadium)}</div>
        <div class="live-score">
          <span class="live-team right">${teamDot(h)}${esc(h.name)}</span>
          <span class="live-nums">${hg}–${ag}</span>
          <span class="live-team">${esc(a.name)}${teamDot(a)}</span>
        </div>
        <div class="live-clock"><span class="live-min">${minute >= 90 ? "90+" : minute}'</span>
          <div class="live-bar"><div class="live-fill" style="width:${Math.min(100, minute / 90 * 100)}%"></div></div></div>
      </div>
      <div class="live-feed">${feed}</div>
      <div class="controls" style="margin-top:12px">
        ${finished ? '<button class="btn btn-accent" data-live-close="1">Full time — continue</button>'
                   : '<button class="btn" data-live-skip="1">Skip to result ⏭</button>'}
      </div>`);
    const skip = document.querySelector("[data-live-skip]");
    if (skip) skip.addEventListener("click", skipAll);
    const close = document.querySelector("[data-live-close]");
    if (close) close.addEventListener("click", () => { closeModal(); onDone && onDone(); });
  };

  const feedLines = [];
  const shootout = (m.pens && m.shootout && m.shootout.length) ? m.shootout : null;
  let pi = 0, reachedFT = false, penStarted = false;
  const kickoff = `<div class="live-line"><span class="live-line-min">0'</span> 🟢 Kick-off at ${esc(h.stadium)}!</div>`;
  feedLines.push(kickoff);
  paint(feedLines.join(""));

  // Reach full time: reveal remaining goals (once), then either finish or go to pens.
  function reachFT() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    if (reachedFT) return;
    reachedFT = true;
    while (ei < events.length) { addEvent(events[ei]); ei++; }
    hg = m.hg; ag = m.ag;
    minute = 90;
    feedLines.push(`<div class="live-line live-ft"><span class="live-line-min">FT</span> 🏁 Full time: ${esc(h.name)} ${hg}–${ag} ${esc(a.name)}</div>`);
    if (shootout && !penStarted) { penStarted = true; feedLines.push(`<div class="live-line"><span class="live-line-min">PENS</span> ⚽ Level after 90 — it's a penalty shootout!</div>`); }
  }

  function addPenLine(k) {
    const team = FGM.teamById(k.tid);
    feedLines.push(`<div class="live-line live-pen"><span class="live-line-min">PEN</span> ${k.scored ? "✅" : "❌"} <strong>${esc(k.name)}</strong> (${team ? esc(team.abbrev) : ""}) ${k.scored ? "scores" : "saved!"} <span class="mute">${esc(k.tally)}</span></div>`);
  }
  function finishPens() {
    finished = true;
    feedLines.push(`<div class="live-line live-ft"><span class="live-line-min">🥅</span> Shootout: ${esc(h.name)} ${m.penHome}–${m.penAway} ${esc(a.name)} · ${esc(FGM.teamName(m.winner))} win!</div>`);
    paint(feedLines.join(""));
  }

  // Natural end: at 90' go to pens (if any) and tick the kicks one by one.
  function finish() {
    reachFT();
    if (shootout) {
      paint(feedLines.join(""));
      liveTimer = setInterval(() => {
        if (pi >= shootout.length) { clearInterval(liveTimer); liveTimer = null; finishPens(); return; }
        addPenLine(shootout[pi]); pi++;
        paint(feedLines.join(""));
      }, 750);
    } else {
      finished = true;
      paint(feedLines.join(""));
    }
  }

  // Skip button: jump straight to the final result (including the whole shootout).
  function skipAll() {
    reachFT();
    if (shootout) { while (pi < shootout.length) { addPenLine(shootout[pi]); pi++; } finishPens(); }
    else { finished = true; paint(feedLines.join("")); }
  }

  function addEvent(ev) {
    const team = FGM.teamById(ev.tid);
    if (ev.tid === m.home) hg++; else ag++;
    feedLines.push(`<div class="live-line live-goal"><span class="live-line-min">${ev.min}'</span> ⚽ <strong>${esc(ev.name)}</strong> (${team ? esc(team.abbrev) : ""})${esc(ev.text || "")} — ${hg}–${ag}</div>`);
  }

  liveTimer = setInterval(() => {
    minute += 2;
    let changed = false;
    while (ei < events.length && events[ei].min <= minute) { addEvent(events[ei]); ei++; changed = true; }
    if (minute === 46) { feedLines.push(`<div class="live-line"><span class="live-line-min">HT</span> ⏸ Half time.</div>`); changed = true; }
    if (minute >= total) { finish(); return; }
    if (changed || minute % 6 === 0) paint(feedLines.join(""));
    else { const mn = document.querySelector(".live-min"); const bar = document.querySelector(".live-fill"); if (mn) mn.textContent = (minute >= 90 ? "90+" : minute) + "'"; if (bar) bar.style.width = Math.min(100, minute / 90 * 100) + "%"; }
  }, 130);
}

// ---------- Router ----------
function navigate() {
  const hash = (location.hash || "#dashboard").slice(1).split("/");
  currentView = hash[0] || "dashboard";
  render(hash.slice(1));
}
window.addEventListener("hashchange", navigate);
$("#nav-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#sidebar").addEventListener("click", e => {
  if (e.target.tagName === "A") $("#sidebar").classList.remove("open");
});
const bottomNav = $("#bottom-nav");
if (bottomNav) bottomNav.addEventListener("click", e => {
  const a = e.target.closest("a[data-view]");
  if (a && a.dataset.view === "menu") {
    e.preventDefault();
    $("#sidebar").classList.toggle("open");
  }
});

function render(args) {
  if (!FGM.state || FGM.state.userTid < 0) { showNewGameFlow(); return; }
  refreshTopbar();
  document.querySelectorAll("#sidebar a, #bottom-nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.view === currentView);
  });
  const views = {
    dashboard: viewDashboard, roster: viewRoster, standings: viewStandings,
    fixtures: viewFixtures, europe: viewEurope, cups: viewCups, stats: viewStats, players: viewAllPlayers,
    search: viewSearch, transfers: viewTransfers, finances: viewFinances,
    review: viewSeasonReview, history: viewHistory, news: viewNews, settings: viewSettings,
  };
  (views[currentView] || viewDashboard)(args || []);
}

function leagueTabs(selected, hashBase) {
  const tabs = FGM.LEAGUE_DEFS.map(d =>
    `<a class="ltab ${d.id === selected ? "active" : ""}" href="#${hashBase}/${d.id}">${esc(d.name)}</a>`).join("");
  return `<div class="ltabs">${tabs}</div>`;
}

// ---------- Views ----------
function viewDashboard() {
  const s = FGM.state;
  const table = FGM.standings(FGM.userLeague());
  const userRow = table.find(r => r.tid === s.userTid);
  const t = FGM.teamById(s.userTid);
  const ratings = FGM.teamRatings(s.userTid);
  const inCL = FGM.clParticipants().includes(s.userTid);
  const inEL = FGM.elParticipants().includes(s.userTid);

  const upcoming = FGM.teamMatches(s.userTid).filter(x => !x.m.played);
  const played = FGM.teamMatches(s.userTid).filter(x => x.m.played);
  played.sort((a, b) => 0); // schedule order is fine
  const next = upcoming[0];
  const last = played[played.length - 1];

  let nextHtml = "<p class='mute'>Season complete.</p>";
  if (next) {
    const h = FGM.teamById(next.m.home), a = FGM.teamById(next.m.away);
    if (h && a) nextHtml = `<p>${next.comp === "UCL" ? "🏆 " : next.comp === "UEL" ? "🏅 " : ""}${esc(FGM.compName(next.comp))}</p>
      <p class="big">${teamLink(h)} vs ${teamLink(a)}</p><p class="mute">${esc(h.stadium)}</p>`;
  }
  let lastHtml = "<p class='mute'>No matches played yet.</p>";
  if (last) {
    const h = FGM.teamById(last.m.home), a = FGM.teamById(last.m.away);
    if (h && a) lastHtml = `<p class="big match-open" data-mref="${matchRef(last)}" style="cursor:pointer">
      ${esc(h.name)} ${last.m.hg}–${last.m.ag} ${esc(a.name)}</p>
      <p class="mute">${esc(FGM.compName(last.comp))} — click for details</p>`;
  }

  const mini = table.slice(0, 6).map(r =>
    `<tr class="${r.tid === s.userTid ? "user-row" : ""}"><td>${r.pos}</td><td>${teamLink(FGM.teamById(r.tid))}</td><td class="num">${r.p}</td><td class="num"><strong>${r.pts}</strong></td></tr>`
  ).join("");

  const form = userRow.form.map(f => `<span class="form-${f}">${f}</span>`).join("");
  const news = s.news.slice(0, 8).map(n => `<div class="news-item"><span class="date">${FGM.seasonLabel(n.season)} W${n.week}</span>${esc(n.text)}</div>`).join("");

  content.innerHTML = `
    <h1>${teamDot(t)} ${esc(t.name)}</h1>
    <p class="sub">${esc(FGM.leagueName(t.league))} · ${FGM.seasonLabel()} · <strong>${userRow.pos}${ord(userRow.pos)}</strong> · ${userRow.pts} pts ·
      XI ${ovrSpan(Math.round(ratings.ovr))} · Form <span class="form-str">${form || "—"}</span>${inCL ? " · <span class='badge badge-gold'>UCL</span>" : inEL ? " · <span class='badge badge-gold'>UEL</span>" : ""}</p>
    <div class="cards">
      <div class="card"><h3>Next match</h3>${nextHtml}</div>
      <div class="card"><h3>Last result</h3>${lastHtml}</div>
      <div class="card"><h3>Top of the table</h3><div class="tbl-wrap"><table><tbody>${mini}</tbody></table></div>
        <p style="margin-top:8px"><a href="#standings">Full table →</a></p></div>
    </div>
    <div class="cards">
      <div class="card"><h3>Latest news</h3>${news || "<p class='mute'>Nothing yet.</p>"}</div>
    </div>`;
}

// Encode a reference to a match so click handlers can find it again.
const matchRegistry = [];
function matchRef(entry) {
  matchRegistry.push(entry.m);
  return matchRegistry.length - 1;
}

function rosterTable(players, opts) {
  opts = opts || {};
  const cols = [
    ["name", "Name"], ["pos", "Pos"], ["age", "Age"], ["ovr", "Ovr"], ["pot", "Pot"],
    ["natl", "Nation"], ["apps", "Apps"], ["goals", "G"], ["assists", "A"],
    ["value", "Value"], ["wage", "Wage"], ["years", "Yrs"],
  ];
  if (opts.showTeam) cols.splice(2, 0, ["team", "Team"]);
  const key = sortState.key, dir = sortState.dir;
  const val = (p, k) => {
    if (k === "apps" || k === "goals" || k === "assists") return p.stats[k];
    if (k === "value") return FGM.playerValue(p);
    if (k === "team") return FGM.teamAbbrev(p.tid);
    return p[k];
  };
  players = players.slice().sort((a, b) => {
    const x = val(a, key), y = val(b, key);
    if (typeof x === "string") return dir * x.localeCompare(y);
    return dir * (y - x);
  });
  const head = cols.map(([k, label]) => `<th class="${k === key ? "sorted" : ""} ${["age", "ovr", "pot", "apps", "goals", "assists", "value", "wage", "years"].includes(k) ? "num" : ""}" data-sort="${k}">${label}</th>`).join("");
  const rows = players.map(p => `
    <tr>
      <td>${playerLink(p)}${injBadge(p)}${listedBadge(p)}${wantsBadge(p)}</td>
      ${opts.showTeam ? `<td>${p.tid >= 0 ? esc(FGM.teamAbbrev(p.tid)) : "FA"}</td>` : ""}
      <td>${posBadge(p.pos)}</td>
      <td class="num">${p.age}</td>
      <td class="num">${ovrSpan(p.ovr)}</td>
      <td class="num mute">${p.pot}</td>
      <td class="mute">${esc(p.natl)}</td>
      <td class="num">${p.stats.apps}</td>
      <td class="num">${p.stats.goals}</td>
      <td class="num">${p.stats.assists}</td>
      <td class="num">${money(FGM.playerValue(p))}</td>
      <td class="num">£${p.wage}k</td>
      <td class="num">${p.years}</td>
    </tr>`).join("");
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function viewRoster() {
  const s = FGM.state;
  const t = FGM.teamById(s.userTid);
  const players = FGM.teamPlayers(s.userTid);
  const xi = FGM.bestXI(s.userTid);
  const wageBill = players.reduce((sum, p) => sum + p.wage, 0);
  const xiHtml = xi.map(sl => sl.player
    ? `<tr><td>${sl.slot}</td><td>${playerLink(sl.player)}</td><td>${posBadge(sl.player.pos)}</td><td class="num">${ovrSpan(sl.player.ovr)}</td><td class="num mute">${sl.eff}</td></tr>`
    : `<tr><td>${sl.slot}</td><td class="mute">—</td><td></td><td></td><td></td></tr>`).join("");

  content.innerHTML = `
    <h1>${teamDot(t)} ${esc(t.name)} — Roster</h1>
    <p class="sub">${players.length} players · Wage £${wageBill}k/wk · Budget <span class="money">${money(t.budget)}</span> · Tap a player for details &amp; actions</p>
    <div class="flex">
      <div>
        <h2>Squad</h2>
        ${rosterTable(players)}
      </div>
      <div style="max-width:380px">
        <h2>Best XI (4-3-3)</h2>
        <div class="tbl-wrap"><table><thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th class="num">Ovr</th><th class="num">Eff</th></tr></thead><tbody>${xiHtml}</tbody></table></div>
      </div>
    </div>`;
}

function viewStandings(args) {
  const s = FGM.state;
  const lid = (args && args[0]) || viewLeague || FGM.userLeague();
  viewLeague = lid;
  const table = FGM.standings(lid);
  const rows = table.map(r => {
    const zone = r.pos <= 4 ? "zone-cl" : r.pos >= table.length - 2 ? "zone-rel" : "";
    return `<tr class="${zone} ${r.tid === s.userTid ? "user-row" : ""}">
      <td>${r.pos}</td><td>${teamLink(FGM.teamById(r.tid))}</td>
      <td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td>
      <td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gd > 0 ? "+" : ""}${r.gd}</td>
      <td class="num"><strong>${r.pts}</strong></td>
      <td><span class="form-str">${r.form.map(f => `<span class="form-${f}">${f}</span>`).join("")}</span></td>
    </tr>`;
  }).join("");
  content.innerHTML = `
    <h1>${esc(FGM.leagueName(lid))} Table</h1>
    ${leagueTabs(lid, "standings")}
    <p class="sub">${FGM.seasonLabel()} · <span style="color:var(--accent)">■</span> Champions League · <span style="color:var(--red)">■</span> Relegation</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th><th>Form</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function viewFixtures(args) {
  const s = FGM.state;
  const lid = (args && args[0]) || viewLeague || FGM.userLeague();
  viewLeague = lid;
  const lg = s.leagues[lid];
  const total = lg.schedule.length;
  let round = args && args.length > 1 ? parseInt(args[1], 10) : -1;
  if (isNaN(round) || round < 0) {
    round = 0;
    for (let i = 0; i < total; i++) { if (lg.schedule[i].some(m => m.played)) round = i; }
    if (lg.schedule[round].every(m => m.played) && round < total - 1) round++;
  }
  round = Math.max(0, Math.min(total - 1, round));
  matchRegistry.length = 0;
  const rows = lg.schedule[round].map(m => {
    const h = FGM.teamById(m.home), a = FGM.teamById(m.away);
    if (!h || !a) return "";
    const score = m.played ? `${m.hg}–${m.ag}` : "vs";
    return `<div class="match-row match-open" data-mref="${matchRef({ m })}">
      <span class="team-name right ${m.played && m.hg > m.ag ? "win" : ""}">${teamDot(h)}${esc(h.name)}</span>
      <span class="score">${score}</span>
      <span class="team-name ${m.played && m.ag > m.hg ? "win" : ""}">${teamDot(a)}${esc(a.name)}</span>
    </div>`;
  }).join("");
  const options = Array.from({ length: total }, (_, i) =>
    `<option value="${i}" ${i === round ? "selected" : ""}>Matchday ${i + 1}</option>`).join("");
  content.innerHTML = `
    <h1>Fixtures &amp; Results</h1>
    ${leagueTabs(lid, "fixtures")}
    <div class="controls">
      <button class="btn btn-small" id="fx-prev" ${round === 0 ? "disabled" : ""}>←</button>
      <select id="fx-round">${options}</select>
      <button class="btn btn-small" id="fx-next" ${round === total - 1 ? "disabled" : ""}>→</button>
      <span class="mute">Tap a played match for details</span>
    </div>
    ${rows}`;
  $("#fx-round").addEventListener("change", e => { location.hash = `#fixtures/${lid}/${e.target.value}`; });
  const prev = $("#fx-prev"), next = $("#fx-next");
  if (prev) prev.addEventListener("click", () => { location.hash = `#fixtures/${lid}/${round - 1}`; });
  if (next) next.addEventListener("click", () => { location.hash = `#fixtures/${lid}/${round + 1}`; });
}

function viewEurope(args) {
  const s = FGM.state;
  let sel = (args && args[0]) || "ucl";
  if (sel !== "uel") sel = "ucl";
  const cl = sel === "uel" ? s.el : s.cl;
  const groupTable = sel === "uel" ? FGM.elGroupTable : FGM.clGroupTable;
  const title = sel === "uel" ? "🏅 Europa League" : "🏆 Champions League";
  const winTitle = sel === "uel" ? "🏆 Europa League winners" : "🏆⭐ Champions of Europe";
  const tabs = `<div class="ltabs">
    <a class="ltab ${sel === "ucl" ? "active" : ""}" href="#europe/ucl">Champions League</a>
    <a class="ltab ${sel === "uel" ? "active" : ""}" href="#europe/uel">Europa League</a></div>`;
  if (!cl) { content.innerHTML = `<h1>${title}</h1>${tabs}<p class='mute'>No competition yet.</p>`; return; }
  matchRegistry.length = 0;
  const groupHtml = cl.groups.map((g, gi) => {
    const rows = groupTable(gi).map((r, i) => {
      const t = FGM.teamById(r.tid);
      return `<tr class="${i < 2 ? "zone-cl" : ""} ${r.tid === s.userTid ? "user-row" : ""}">
        <td>${t ? teamLink(t) : "?"}</td><td class="num">${r.p}</td><td class="num">${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td class="num"><strong>${r.pts}</strong></td></tr>`;
    }).join("");
    return `<div class="card cl-group"><h3>Group ${String.fromCharCode(65 + gi)}</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Club</th><th class="num">P</th><th class="num">GD</th><th class="num">Pts</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join("");

  const koBlock = (title, matches) => {
    if (!matches.length) return "";
    const rows = matches.map(m => {
      const h = FGM.teamById(m.home), a = FGM.teamById(m.away);
      if (!h || !a) return "";
      const score = m.played ? `${m.hg}–${m.ag}${m.pens ? " p" : ""}` : "vs";
      return `<div class="match-row match-open" data-mref="${matchRef({ m })}">
        <span class="team-name right ${m.played && m.winner === m.home ? "win" : ""}">${teamDot(h)}${esc(h.name)}</span>
        <span class="score">${score}</span>
        <span class="team-name ${m.played && m.winner === m.away ? "win" : ""}">${teamDot(a)}${esc(a.name)}</span>
      </div>`;
    }).join("");
    return `<h2>${title}</h2>${rows}`;
  };
  const winner = cl.winner ? FGM.teamById(cl.winner) : null;
  content.innerHTML = `
    <h1>${title}</h1>
    ${tabs}
    <p class="sub">${FGM.seasonLabel()} · Group matchdays are played midweek (weeks ${FGM.CL_GROUP_WEEKS.map(w => w + 1).join(", ")}); knockouts in spring · single-leg knockout ties · tap any tie to watch it</p>
    ${winner ? `<div class="card" style="border-color:var(--gold)"><h3>${winTitle}</h3><p class="big">${teamLink(winner)}</p></div>` : ""}
    ${koBlock("Final", cl.final)}
    ${koBlock("Semi-finals", cl.sf)}
    ${koBlock("Quarter-finals", cl.qf)}
    ${koBlock("Round of 16", cl.r16)}
    <h2>Groups</h2>
    <div class="cards">${groupHtml}</div>`;
}

function viewCups(args) {
  const s = FGM.state;
  const cups = FGM.userCups();
  if (!cups.length) { content.innerHTML = "<h1>Domestic Cups</h1><p class='mute'>No cups in your league yet — they start with the season.</p>"; return; }
  matchRegistry.length = 0;
  let sel = (args && args[0]) || cups[0].id;
  if (!cups.some(c => c.id === sel)) sel = cups[0].id;
  const cup = cups.find(c => c.id === sel);
  const tabs = cups.map(c => `<a class="ltab ${c.id === sel ? "active" : ""}" href="#cups/${c.id}">${esc(c.name)}</a>`).join("");

  const winner = cup.winner !== null ? FGM.teamById(cup.winner) : null;
  // Rounds already played (most recent first), with a note for teams still alive.
  const roundBlocks = cup.rounds.slice().reverse().map(r => {
    const rows = r.matches.map(m => {
      const h = FGM.teamById(m.home), a = FGM.teamById(m.away);
      if (!h || !a) return "";
      const score = m.played ? `${m.hg}–${m.ag}${m.pens ? " p" : ""}` : "vs";
      return `<div class="match-row match-open" data-mref="${matchRef({ m })}">
        <span class="team-name right ${m.winner === m.home ? "win" : ""}">${teamDot(h)}${esc(h.name)}</span>
        <span class="score">${score}</span>
        <span class="team-name ${m.winner === m.away ? "win" : ""}">${teamDot(a)}${esc(a.name)}</span>
      </div>`;
    }).join("");
    return `<h2>${esc(r.name)} <span class="mute" style="font-weight:400;font-size:13px">· week ${r.week + 1}</span></h2>${rows || "<p class='mute'>Byes only.</p>"}`;
  }).join("");

  // Teams still in the hat
  const alive = cup.survivors.filter(tid => tid !== null).map(tid => FGM.teamById(tid)).filter(Boolean);
  const aliveHtml = (!winner && alive.length > 1)
    ? `<div class="card"><h3>Still in the cup (${alive.length})</h3><div class="worldxi-chips">${alive.sort((a, b) => a.name.localeCompare(b.name)).map(t => `<span class="xi-chip">${teamDot(t)}${esc(t.name)}</span>`).join("")}</div></div>`
    : "";

  content.innerHTML = `
    <h1>Domestic Cups</h1>
    <div class="ltabs">${tabs}</div>
    <p class="sub">${esc(cup.name)} · ${FGM.seasonLabel()} · single-leg knockout, replays settled on penalties · top seeds get a first-round bye</p>
    ${winner ? `<div class="card" style="border-color:var(--gold)"><h3>🏆 Winner</h3><p class="big">${teamLink(winner)}</p></div>` : aliveHtml}
    ${roundBlocks || "<p class='mute'>First round hasn't been played yet — sim into week " + (cup.weeks[0] + 1) + ".</p>"}`;
}

function viewStats() {
  const cats = [
    ["goals", "Top Scorers (all comps)", "Goals"],
    ["assists", "Most Assists", "Assists"],
    ["cs", "Golden Glove (Clean Sheets)", "CS"],
    ["apps", "Most Appearances", "Apps"],
  ];
  const blocks = cats.map(([stat, title, label]) => {
    const rows = FGM.leaders(stat, 12).map((p, i) => `
      <tr><td>${i + 1}</td><td>${playerLink(p)}</td><td>${p.tid >= 0 ? esc(FGM.teamAbbrev(p.tid)) : "FA"}</td>
      <td>${posBadge(p.pos)}</td><td class="num"><strong>${p.stats[stat]}</strong></td><td class="num mute">${p.stats.apps}</td></tr>`).join("");
    return `<div class="card"><h3>${title}</h3><div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th class="num">${label}</th><th class="num">Apps</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='6' class='mute'>No stats yet — sim some matches!</td></tr>"}</tbody></table></div></div>`;
  }).join("");
  content.innerHTML = `<h1>Stat Leaders</h1><p class="sub">${FGM.seasonLabel()} · all competitions — leagues, Champions League, Europa League &amp; domestic cups</p><div class="cards" style="align-items:flex-start">${blocks}</div>`;
}

function viewAllPlayers(args) {
  const filter = (args && args[0]) || "ALL";
  let pool = FGM.allActivePlayers();
  if (filter !== "ALL") pool = pool.filter(p => { const t = FGM.teamById(p.tid); return t && t.league === filter; });
  const all = pool.sort((a, b) => b.ovr - a.ovr).slice(0, 180);
  const opts = [["ALL", "All leagues"]].concat(FGM.LEAGUE_DEFS.map(d => [d.id, d.name])).concat([["FOR", "Rest of world"]]);
  const tabs = opts.map(([id, label]) => `<a class="ltab ${id === filter ? "active" : ""}" href="#players/${id}">${esc(label)}</a>`).join("");
  content.innerHTML = `
    <h1>All Players</h1>
    <div class="ltabs">${tabs}</div>
    <p class="sub">Top ${all.length} by rating — sort by any column, tap a name for the full profile. Every player has a price.</p>
    ${rosterTable(all, { showTeam: true })}`;
}

function viewTransfers() {
  const s = FGM.state;
  const user = FGM.teamById(s.userTid);
  const wanted = FGM.allActivePlayers().filter(p => p.agitateFor === s.userTid);
  const listed = FGM.allActivePlayers().filter(p => p.listed && p.tid !== s.userTid).sort((a, b) => b.ovr - a.ovr).slice(0, 60);
  const fas = FGM.freeAgents().sort((a, b) => b.ovr - a.ovr).slice(0, 40);

  const offerRows = s.offers.map(o => {
    const p = s.players[o.pid];
    const bidder = FGM.teamById(o.tid);
    if (!p || !bidder) return "";
    return `<tr><td>${playerLink(p)}</td><td>${posBadge(p.pos)}</td><td class="num">${ovrSpan(p.ovr)}</td>
      <td>${teamLink(bidder)}</td><td class="num money">${money(o.fee)}</td><td class="num mute">${money(FGM.playerValue(p))}</td>
      <td><button class="btn btn-small btn-accent" data-accept="${o.id}">Accept</button>
      <button class="btn btn-small" data-reject="${o.id}">Reject</button></td></tr>`;
  }).join("");

  const mkRow = p => {
    const price = FGM.askingPrice(p);
    const t = p.tid >= 0 ? FGM.teamById(p.tid) : null;
    const from = t ? `${esc(t.abbrev)} <span class="mute">(${esc(FGM.leagueName(t.league))})</span>` : "Free agent";
    const afford = price <= user.budget;
    return `<tr><td>${playerLink(p)}${wantsBadge(p)}</td><td>${posBadge(p.pos)}</td><td class="num">${p.age}</td>
      <td class="num">${ovrSpan(p.ovr)}</td><td class="num mute">${p.pot}</td><td>${from}</td>
      <td class="num ${afford ? "money" : "neg"}">${money(price)}</td>
      <td><button class="btn btn-small ${afford ? "btn-accent" : ""}" data-buy="${p.pid}" ${afford ? "" : "disabled"}>${p.tid === -1 ? "Sign" : "Buy"}</button></td></tr>`;
  };
  const tblHead = `<thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Pot</th><th>Club</th><th class="num">Price</th><th></th></tr></thead>`;

  content.innerHTML = `
    <h1>Transfer Market</h1>
    <p class="sub">Budget: <span class="money">${money(user.budget)}</span> · You can buy from any club in the world — including the non-playable leagues</p>
    ${wanted.length ? `<h2>📣 Pushing to join you</h2><div class="tbl-wrap"><table>${tblHead}<tbody>${wanted.map(mkRow).join("")}</tbody></table></div>` : ""}
    <h2>📨 Incoming offers for your players</h2>
    ${s.offers.length ? `<div class="tbl-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Ovr</th><th>Bidder</th><th class="num">Offer</th><th class="num">Value</th><th></th></tr></thead><tbody>${offerRows}</tbody></table></div>` : "<p class='mute'>No offers right now. Listing players attracts bids.</p>"}
    <h2>🛒 Transfer-listed across the world</h2>
    ${listed.length ? `<div class="tbl-wrap"><table>${tblHead}<tbody>${listed.map(mkRow).join("")}</tbody></table></div>` : "<p class='mute'>Nobody is listed right now.</p>"}
    <h2>🆓 Free agents</h2>
    <div class="tbl-wrap"><table>${tblHead}<tbody>${fas.map(mkRow).join("") || "<tr><td colspan='8' class='mute'>Empty.</td></tr>"}</tbody></table></div>`;
}

function viewFinances() {
  const s = FGM.state;
  const t = FGM.teamById(s.userTid);
  const players = FGM.teamPlayers(s.userTid);
  const wageBill = players.reduce((sum, p) => sum + p.wage, 0);
  const cap = t.wageBudget || FGM.wageBudgetFor(t.stature);
  const pct = Math.min(100, Math.round(wageBill / cap * 100));
  const over = wageBill > cap;
  const yearly = Math.round(wageBill * 52 / 100) / 10;
  const top = players.slice().sort((a, b) => b.wage - a.wage).slice(0, 12)
    .map(p => `<tr><td>${playerLink(p)}</td><td>${posBadge(p.pos)}</td><td class="num">£${p.wage}k</td><td class="num">${p.years}</td></tr>`).join("");
  content.innerHTML = `
    <h1>Finances</h1>
    <div class="cards">
      <div class="card"><h3>Transfer budget</h3><p class="big money">${money(t.budget)}</p><p class="mute">Fees only — wages come out of the wage budget</p></div>
      <div class="card"><h3>Wage budget</h3>
        <p class="big ${over ? "neg" : ""}">£${wageBill}k <span class="mute" style="font-size:14px">/ £${cap}k per week</span></p>
        <div class="wage-bar"><div class="wage-fill ${over ? "over" : pct > 85 ? "warn" : ""}" style="width:${pct}%"></div></div>
        <p class="mute">${over ? "⚠ Over budget — sell or trim wages before signing." : `${pct}% used · £${cap - wageBill}k/week headroom`}</p></div>
      <div class="card"><h3>Club stature</h3><p class="big">${"★".repeat(t.stature)}${"☆".repeat(5 - t.stature)}</p><p class="mute">≈ ${money(yearly)}/yr in wages · drives sponsorship &amp; youth</p></div>
    </div>
    <h2>Top earners</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Wage</th><th class="num">Years</th></tr></thead><tbody>${top}</tbody></table></div>
    <p class="mute" style="margin-top:10px">Transfer income: league prize money by final position, sponsorship by stature, Champions League bonuses — minus part of the wage bill. Wages and fees both scale with the era (a 2000 save runs on 2000 money).</p>`;
}

function viewHistory() {
  const s = FGM.state;
  const blocks = s.history.slice().reverse().map(h => {
    const aw = (label, a) => a ? `<tr><td>${label}</td><td>${esc(a.name)} (${esc(a.abbrev)})</td><td class="num">${a.value} ${a.label === "rating" ? "" : a.label}</td></tr>` : "";
    const champs = FGM.LEAGUE_DEFS.map(d => h.champions[d.id]
      ? `<tr><td>${esc(d.name)}</td><td>🏆 ${esc(h.champions[d.id].name)}</td><td class="num">${h.champions[d.id].pts}</td></tr>` : "").join("");
    const podium = (h.bdor && h.bdor.length)
      ? `<div class="bdor-podium">${h.bdor.map((b, i) => `<div class="bdor-slot bdor-${i + 1}"><span class="bdor-medal">${["🥇", "🥈", "🥉"][i]}</span><strong>${esc(b.name)}</strong><span class="mute">${esc(b.abbrev)}</span></div>`).join("")}</div>`
      : "";
    const xi = (h.worldXI && h.worldXI.length)
      ? `<div class="worldxi"><strong>🌍 FIFPRO World XI</strong><div class="worldxi-chips">${h.worldXI.map(w => `<span class="xi-chip">${posBadge(w.pos)} ${esc(w.name)} <span class="mute">${esc(w.abbrev)}</span></span>`).join("")}</div></div>`
      : "";
    const cupsHtml = (h.cups && h.cups.length)
      ? `<div class="worldxi"><strong>🏆 Domestic cup winners</strong><div class="worldxi-chips">${h.cups.map(c => `<span class="xi-chip">${esc(c.name)}: <strong>${esc(c.winner)}</strong></span>`).join("")}</div></div>`
      : "";
    const intlLine = h.international ? `<p class="mute" style="margin:2px 0 8px">🌍 ${esc(h.international.comp)} ${h.international.year}: <strong>${esc(h.international.winner)}</strong></p>` : "";
    const bootAw = (label, b) => b ? `<tr><td>${label}</td><td>${esc(b.name)} <span class="mute">${esc(b.abbrev)}</span> <span class="num">${b.value}g</span></td></tr>` : "";
    return `<div class="card">
      <h3>${FGM.seasonLabel(h.season)}${h.clWinner ? ` — 🏆⭐ ${esc(h.clWinner.name)} won the Champions League` : ""}${h.elWinner ? ` · 🏅 ${esc(h.elWinner.name)} won the Europa League` : ""}</h3>
      ${intlLine}
      ${podium}
      <div class="flex">
        <div><strong>League champions</strong><div class="tbl-wrap"><table><tbody>${champs}</tbody></table></div>
        <p class="mute" style="margin-top:6px">Your finish: ${h.userPos}${ord(h.userPos)} in the ${esc(FGM.leagueName(h.userLeague))} (${esc(h.userTeam)})</p></div>
        <div><strong>Individual awards</strong><div class="tbl-wrap"><table><tbody>
          ${aw("👟 European Golden Boot", h.goldenBoot)}${bootAw("👟🏆 UCL Golden Boot", h.clBoot)}${bootAw("👟🏅 UEL Golden Boot", h.elBoot)}${aw("🎯 Playmaker", h.playmaker)}${aw("🧤 Yashin Trophy", h.goldenGlove)}
          ${aw("🌟 Golden Boy", h.ypoty)}
        </tbody></table></div></div>
      </div>
      ${leagueAwardsBlock(h)}
      ${xi}${cupsHtml}</div>`;
  }).join("");
  const pre = FGM.preHistory();
  const preRows = pre.map(r => `
    <tr><td><strong>${FGM.seasonLabel(r.year)}</strong></td>
    <td>${r.bdor ? esc(r.bdor) : "<span class='mute'>—</span>"}</td>
    <td>${r.boot ? esc(r.boot) : "—"}</td>
    <td>${r.cl ? "⭐ " + esc(r.cl) : "—"}</td>
    <td>${esc(r.champs.EPL || "—")}</td><td>${esc(r.champs.LIGA || "—")}</td><td>${esc(r.champs.SA || "—")}</td><td>${esc(r.champs.BL || "—")}</td><td>${esc(r.champs.L1 || "—")}</td></tr>`).join("");
  const preBlock = pre.length ? `
    <h2>📜 The record books — before your save</h2>
    <p class="sub">Real winners from every season up to your ${FGM.seasonLabel(FGM.state.startSeason || FGM.state.season)} start.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Season</th><th>🏅 Ballon d'Or</th><th>👟 Golden Boot</th><th>Champions League</th><th>England</th><th>Spain</th><th>Italy</th><th>Germany</th><th>France</th></tr></thead>
      <tbody>${preRows}</tbody></table></div>` : "";

  // International tournaments: in-game results + the real pre-save winners.
  const start = FGM.state.startSeason || FGM.state.season;
  const gameIntl = FGM.internationals().slice().reverse()
    .map(t => `<tr><td>${t.year}</td><td>${esc(t.comp)}</td><td>🏆 <strong>${esc(t.winner)}</strong></td><td class="mute">${esc(t.runnerUp)}</td><td>${t.goldenBall ? esc(t.goldenBall.name) : "—"}</td></tr>`).join("");
  const realIntl = FGM.INTL_WINNERS.filter(w => w.year <= start).slice().reverse()
    .map(w => `<tr><td>${w.year}</td><td>${esc(w.comp)}</td><td>🏆 <strong>${esc(w.winner)}</strong></td><td class="mute">—</td><td class="mute">real</td></tr>`).join("");
  const intlBlock = `
    <h2>🌍 International tournaments</h2>
    <p class="sub">World Cup, Euros &amp; Copa América — your save's results plus the real pre-save winners.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Year</th><th>Tournament</th><th>Winner</th><th>Runner-up</th><th>Golden Ball</th></tr></thead>
      <tbody>${gameIntl}${realIntl}</tbody></table></div>`;

  content.innerHTML = `<h1>History</h1>
    ${s.history.length ? `<div class="cards" style="flex-direction:column">${blocks}</div>` : "<p class='mute'>No completed seasons in your save yet — your first Ballon d'Or night comes at the end of this season.</p>"}
    ${intlBlock}
    ${preBlock}`;
}

// Per-league Golden Boots + Players of the Season table for a history entry.
function leagueAwardsBlock(h) {
  if (!h.leagueAwards) return "";
  const rows = FGM.LEAGUE_DEFS.map(d => {
    const la = h.leagueAwards[d.id];
    if (!la) return "";
    return `<tr><td>${esc(d.name)}</td>
      <td>👟 ${esc(la.boot.name)} <span class="mute">${esc(la.boot.abbrev)}</span> <span class="num">${la.boot.value}g</span></td>
      <td>⭐ ${esc(la.poty.name)} <span class="mute">${esc(la.poty.abbrev)}</span></td></tr>`;
  }).join("");
  if (!rows) return "";
  return `<div class="worldxi"><strong>👟 Golden Boots &amp; Players of the Season — by league</strong>
    <div class="tbl-wrap"><table><thead><tr><th>League</th><th>Golden Boot</th><th>Player of the Season</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---------- Season Review (dedicated year-end results) ----------
function viewSeasonReview() {
  const s = FGM.state;
  if (!s.history.length) {
    content.innerHTML = `<h1>🏅 Season Review</h1>
      <p class='mute'>Your first season is still in progress. When it finishes, the full end-of-season awards ceremony — Ballon d'Or, FIFPRO World XI, every league's Golden Boot and Player of the Season, cup winners and champions — lands here.</p>`;
    return;
  }
  const h = s.history[s.history.length - 1];
  const teamByAbbrev = ab => s.teams.find(t => t.abbrev === ab);
  const nameChip = a => a ? `<span class="player-search" data-name="${esc(a.name)}">${esc(a.name)}</span> <span class="mute">${esc(a.abbrev)}</span>` : "—";

  const podium = (h.bdor && h.bdor.length)
    ? `<div class="bdor-podium">${h.bdor.map((b, i) => `<div class="bdor-slot bdor-${i + 1}"><span class="bdor-medal">${["🥇", "🥈", "🥉"][i]}</span><strong>${esc(b.name)}</strong><span class="mute">${esc(b.abbrev)}</span></div>`).join("")}</div>`
    : "";
  const champCards = FGM.LEAGUE_DEFS.map(d => {
    const c = h.champions[d.id]; if (!c) return "";
    const t = teamByAbbrev(c.abbrev);
    return `<div class="review-champ" ${t ? `style="border-left:4px solid ${t.colors[0]}"` : ""}>
      <div class="mute">${esc(d.name)}</div><div class="review-champ-name">🏆 ${esc(c.name)}</div><div class="mute">${c.pts} pts</div></div>`;
  }).join("");
  const leagueRows = FGM.LEAGUE_DEFS.map(d => {
    const la = h.leagueAwards ? h.leagueAwards[d.id] : null;
    if (!la) return "";
    return `<tr><td><strong>${esc(d.name)}</strong></td>
      <td>👟 ${nameChip(la.boot)} <span class="num">${la.boot.value}g</span></td>
      <td>⭐ ${nameChip(la.poty)}</td></tr>`;
  }).join("");
  const bootRow = (label, b) => b ? `<tr><td>${label}</td><td>${nameChip(b)} <span class="num">${b.value}g</span></td></tr>` : "";
  const indiv = [
    ["🏅 Ballon d'Or", h.bdor && h.bdor[0]],
    ["👟 European Golden Boot", h.goldenBoot],
    ["🎯 Playmaker of the Season", h.playmaker],
    ["🧤 Yashin Trophy", h.goldenGlove],
    ["🌟 Golden Boy (best U21)", h.ypoty],
  ].filter(x => x[1]).map(([label, a]) => `<tr><td>${label}</td><td>${nameChip(a)}</td></tr>`).join("")
    + bootRow("👟🏆 Champions League Golden Boot", h.clBoot)
    + bootRow("👟🏅 Europa League Golden Boot", h.elBoot);
  const xi = (h.worldXI && h.worldXI.length)
    ? `<div class="worldxi-chips">${h.worldXI.map(w => `<span class="xi-chip">${posBadge(w.pos)} <span class="player-search" data-name="${esc(w.name)}">${esc(w.name)}</span> <span class="mute">${esc(w.abbrev)}</span></span>`).join("")}</div>`
    : "<p class='mute'>—</p>";
  const cups = (h.cups && h.cups.length)
    ? `<div class="worldxi-chips">${h.cups.map(c => `<span class="xi-chip">${esc(c.name)}: <strong>${esc(c.winner)}</strong></span>`).join("")}</div>`
    : "<p class='mute'>—</p>";
  const intlCard = h.international
    ? `<div class="card" style="border-color:var(--accent)"><h3>🌍 ${esc(h.international.comp)} ${h.international.year}</h3>
        <p class="big">🏆 ${esc(h.international.winner)}</p>
        <p class="mute">Beat ${esc(h.international.runnerUp)} in the final${h.international.goldenBall ? ` · Golden Ball: <span class="player-search" data-name="${esc(h.international.goldenBall.name)}">${esc(h.international.goldenBall.name)}</span> (${esc(h.international.goldenBall.natl)})` : ""}</p></div>`
    : "";

  content.innerHTML = `
    <h1>🏅 ${FGM.seasonLabel(h.season)} Season Review</h1>
    <p class="sub">The full end-of-season ceremony. Your finish: <strong>${h.userPos}${ord(h.userPos)}</strong> in the ${esc(FGM.leagueName(h.userLeague))} with ${esc(h.userTeam)}.${h.clWinner ? ` · 🏆⭐ ${esc(h.clWinner.name)} won the Champions League.` : ""}</p>
    <div class="cards">
      <div class="card" style="border-color:var(--gold)"><h3>🏅 Ballon d'Or</h3>${podium || "<p class='mute'>—</p>"}</div>
      ${h.clWinner ? `<div class="card" style="border-color:var(--gold)"><h3>🏆⭐ Champions League</h3><p class="big">${esc(h.clWinner.name)}</p></div>` : ""}
      ${h.elWinner ? `<div class="card" style="border-color:var(--gold)"><h3>🏅 Europa League</h3><p class="big">${esc(h.elWinner.name)}</p></div>` : ""}
      ${intlCard}
    </div>
    <h2>League champions</h2>
    <div class="review-champs">${champCards}</div>
    <h2>Golden Boots &amp; Players of the Season — every league</h2>
    <div class="tbl-wrap"><table><thead><tr><th>League</th><th>Golden Boot</th><th>Player of the Season</th></tr></thead><tbody>${leagueRows}</tbody></table></div>
    <div class="flex" style="margin-top:8px">
      <div><h2>Global individual awards</h2><div class="tbl-wrap"><table><tbody>${indiv}</tbody></table></div></div>
      <div><h2>🏆 Cup winners</h2>${cups}</div>
    </div>
    <h2>🌍 FIFPRO World XI</h2>${xi}
    <p class="mute" style="margin-top:14px"><a href="#history">See all past seasons in League History →</a></p>`;
}

// ---------- Search every player ----------
let searchQuery = "";
function viewSearch(args) {
  if (args && args.length && !searchQuery) searchQuery = decodeURIComponent(args[0]);
  const q = searchQuery.trim().toLowerCase();
  let results = [];
  if (q.length >= 2) {
    const all = Object.values(FGM.state.players).filter(p => p.name.toLowerCase().includes(q));
    // active first (by rating), then retired/foreign
    all.sort((a, b) => {
      const ar = a.retired ? 2 : (a.tid >= 0 ? 0 : 1), br = b.retired ? 2 : (b.tid >= 0 ? 0 : 1);
      return ar - br || b.ovr - a.ovr;
    });
    results = all.slice(0, 80);
  }
  const rows = results.map(p => {
    const club = p.retired ? "Retired" : (p.tid >= 0 ? `${esc(FGM.teamAbbrev(p.tid))} <span class="mute">${esc(FGM.leagueName(FGM.teamById(p.tid).league))}</span>` : "Free agent");
    return `<tr>
      <td>${playerLink(p)}${p.retired ? " <span class='badge badge-inj'>RET</span>" : ""}</td>
      <td>${posBadge(p.pos)}</td><td class="num">${p.age}</td><td class="num">${ovrSpan(p.ovr)}</td>
      <td class="mute">${esc(p.natl)}</td><td>${club}</td><td class="num">${money(FGM.playerValue(p))}</td></tr>`;
  }).join("");
  content.innerHTML = `
    <h1>🔎 Search Players</h1>
    <p class="sub">Find any player in the world — active, free agent, abroad or retired.</p>
    <div class="controls">
      <input type="text" id="search-input" placeholder="Type a name… (e.g. Messi, Haaland, Zidane)" value="${esc(searchQuery)}" style="flex:1;min-width:220px;font-size:15px;padding:9px 12px" autocomplete="off">
      ${searchQuery ? `<button class="btn" id="search-clear">Clear</button>` : ""}
    </div>
    ${q.length < 2
      ? "<p class='mute'>Type at least 2 letters to search.</p>"
      : results.length
        ? `<p class="mute">${results.length}${results.length === 80 ? "+" : ""} result${results.length === 1 ? "" : "s"}</p>
           <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th>Nation</th><th>Club</th><th class="num">Value</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : "<p class='mute'>No players match that search.</p>"}`;
  const input = document.getElementById("search-input");
  if (input) {
    input.focus();
    // keep cursor at end
    const v = input.value; input.value = ""; input.value = v;
    let deb;
    input.addEventListener("input", e => {
      searchQuery = e.target.value;
      clearTimeout(deb);
      deb = setTimeout(() => { viewSearch([]); }, 160);
    });
  }
  const clear = document.getElementById("search-clear");
  if (clear) clear.addEventListener("click", () => { searchQuery = ""; viewSearch([]); });
}

function viewNews() {
  const s = FGM.state;
  const items = s.news.map(n => `<div class="news-item"><span class="date">${FGM.seasonLabel(n.season)} W${n.week}</span>${esc(n.text)}</div>`).join("");
  content.innerHTML = `<h1>News Feed</h1>${items || "<p class='mute'>Quiet day in the football world.</p>"}`;
}

function viewSettings() {
  const s = FGM.state;
  const teamOpts = s.teams.filter(t => t.league !== "FOR").sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.tid}" ${t.tid === s.userTid ? "selected" : ""}>${esc(t.name)} (${esc(FGM.leagueName(t.league))})</option>`).join("");
  content.innerHTML = `
    <h1>Settings</h1>
    <div class="cards" style="flex-direction:column;max-width:640px">
      <div class="card"><h3>Save game</h3>
        <p class="mute" style="margin-bottom:8px">Autosaves to your browser after every sim and transfer.</p>
        <div class="controls">
          <button class="btn" id="btn-export">⬇ Export save (JSON)</button>
          <button class="btn" id="btn-import">⬆ Import save</button>
          <input type="file" id="import-file" accept=".json" style="display:none">
        </div></div>
      <div class="card"><h3>Switch club (god mode)</h3>
        <div class="controls"><select id="switch-team">${teamOpts}</select>
        <button class="btn" id="btn-switch">Take over</button></div></div>
      <div class="card"><h3>Danger zone</h3>
        <button class="btn btn-danger" id="btn-reset">🗑 Delete save &amp; start a new career</button></div>
      <div class="card"><h3>About</h3>
        <p class="mute">Football GM — a Basketball GM-inspired sim. Five playable leagues with real 2025-26 squads, Champions League, era starts back to 2000 with real career timelines and scheduled wonderkid debuts, plus a world transfer market.</p></div>
    </div>`;
  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([FGM.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `footballgm_${FGM.seasonLabel()}.json`;
    a.click();
  });
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { FGM.importJSON(reader.result); toast("Save imported!"); render(); }
      catch (err) { toast("Import failed: " + err.message); }
    };
    reader.readAsText(f);
  });
  $("#btn-switch").addEventListener("click", () => {
    FGM.setUserTid(parseInt($("#switch-team").value, 10));
    FGM.save(); toast("You're the new boss of " + FGM.teamById(FGM.state.userTid).name);
    location.hash = "#dashboard"; render();
  });
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Delete your save and start over? This cannot be undone.")) {
      FGM.reset(); location.reload();
    }
  });
}

// ---------- Player modal ----------
function showPlayerModal(pid) {
  const s = FGM.state;
  const p = s.players[pid];
  if (!p) return;
  const subs = FGM.subRatings(p);
  const attrs = Object.entries(subs).map(([k, v]) => `
    <div class="attr"><div class="label"><span>${k[0].toUpperCase() + k.slice(1)}</span><span>${v}</span></div>
    <div class="bar"><div class="fill" style="width:${v}%;background:${v >= 80 ? "var(--green)" : v >= 65 ? "var(--accent)" : "#8b98a8"}"></div></div></div>`).join("");
  const careerRows = p.career.slice().reverse().map(c => `
    <tr><td>${FGM.seasonLabel(c.season)}</td><td>${esc(c.team)}</td><td class="num">${c.age}</td><td class="num">${ovrSpan(c.ovr)}</td>
    <td class="num">${c.apps}</td><td class="num">${c.goals}</td><td class="num">${c.assists}</td><td class="num">${c.cs}</td></tr>`).join("");
  const curRow = p.retired ? "" : `<tr><td>${FGM.seasonLabel()} *</td><td>${p.tid >= 0 ? esc(FGM.teamAbbrev(p.tid)) : "FA"}</td>
    <td class="num">${p.age}</td><td class="num">${ovrSpan(p.ovr)}</td>
    <td class="num">${p.stats.apps}</td><td class="num">${p.stats.goals}</td><td class="num">${p.stats.assists}</td><td class="num">${p.stats.cs}</td></tr>`;

  const isUser = p.tid === s.userTid;
  const isFA = p.tid === -1;
  let actions = "";
  if (isUser) {
    actions = `
      <button class="btn ${p.listed ? "" : "btn-accent"}" data-act="list" data-pid="${p.pid}">${p.listed ? "Remove from transfer list" : "Add to transfer list"}</button>
      <button class="btn" data-act="extend" data-pid="${p.pid}">Extend contract</button>`;
  } else if (!p.retired && p.tid >= -1) {
    const price = FGM.askingPrice(p);
    actions = `<button class="btn btn-accent" data-act="buy" data-pid="${p.pid}">${isFA ? "Sign free agent" : "Buy"} — ${money(price)}</button>`;
  }
  const club = p.tid >= 0 ? FGM.teamById(p.tid) : null;

  openModal(`
    <h1>${esc(p.name)} ${p.retired ? "<span class='badge badge-inj'>RETIRED</span>" : ""}${injBadge(p)}${listedBadge(p)}${wantsBadge(p)}</h1>
    <p class="sub">${posBadge(p.pos)} · Age ${p.age} · ${esc(p.natl)} · ${club ? `${esc(club.name)} <span class="mute">(${esc(FGM.leagueName(club.league))})</span>` : (p.retired ? "Retired" : "Free agent")}
    · Ovr ${ovrSpan(p.ovr)} / Pot <span class="mute">${p.pot}</span>
    · Value <span class="money">${money(FGM.playerValue(p))}</span> · £${p.wage}k/wk, ${p.years} yr${p.years === 1 ? "" : "s"}</p>
    <div class="controls">${actions}</div>
    ${honoursHtml(p)}
    <h2>Attributes</h2>
    <div class="attr-grid">${attrs}</div>
    <h2>Career</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Season</th><th>Team</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Apps</th><th class="num">G</th><th class="num">A</th><th class="num">CS</th></tr></thead>
    <tbody>${curRow}${careerRows || ""}</tbody></table></div>
    ${p.retired ? "" : "<p class='mute' style='margin-top:6px'>* current season in progress</p>"}`);
}

function honourIcon(a, h) {
  if (h && h.intl) return a.includes("World Cup") ? "🌐" : "🌎";
  if (h && h.trophy) return a.includes("Champions League") ? "🏆⭐" : "🏆";
  return a.startsWith("Ballon") ? "🏅" : a.includes("Boot") ? "👟" : a.includes("World XI") ? "🌍"
    : a.includes("Yashin") ? "🧤" : a.includes("Golden Boy") ? "🌟" : a.includes("Golden Ball") ? "⚽" : "🎯";
}
function honoursHtml(p) {
  const hon = FGM.honoursFor(p.name);
  if (!hon.length) return "";
  // Split into trophies (club + international) and individual awards.
  const trophies = hon.filter(h => h.trophy || h.intl);
  const awards = hon.filter(h => !h.trophy && !h.intl);
  const summarize = list => {
    const counts = {};
    for (const h of list) { const k = h.award; (counts[k] = counts[k] || { n: 0, h }); counts[k].n++; }
    return Object.entries(counts).map(([a, v]) => `<span class="badge badge-gold">${honourIcon(a, v.h)} ${v.n > 1 ? v.n + "× " : ""}${esc(a)}</span>`).join(" ");
  };
  const rows = hon.slice().reverse().map(h => `<div class="honour-line"><span class="mute">${FGM.seasonLabel(h.season)}</span> ${honourIcon(h.award, h)} ${esc(h.award)}${h.real ? " <span class='mute'>(pre-save)</span>" : ""}</div>`).join("");
  return `<h2>Honours <span class="mute" style="font-weight:400;font-size:13px">· ${hon.length}</span></h2>
    ${trophies.length ? `<div class="honours-wrap"><div class="mute" style="font-size:12px;margin-bottom:4px">TROPHIES</div>${summarize(trophies)}</div>` : ""}
    ${awards.length ? `<div class="honours-wrap"><div class="mute" style="font-size:12px;margin:8px 0 4px">INDIVIDUAL AWARDS</div>${summarize(awards)}</div>` : ""}
    <details class="honours-detail"><summary>Season-by-season list</summary>${rows}</details>`;
}

// ---------- Team modal ----------
function showTeamModal(tid) {
  const t = FGM.teamById(tid);
  if (!t) return;
  const players = FGM.teamPlayers(tid).sort((a, b) => b.ovr - a.ovr);
  const ratings = FGM.teamRatings(tid);
  const rows = players.map(p => `
    <tr><td>${playerLink(p)}${injBadge(p)}${listedBadge(p)}</td><td>${posBadge(p.pos)}</td><td class="num">${p.age}</td>
    <td class="num">${ovrSpan(p.ovr)}</td><td class="num mute">${p.pot}</td><td class="num">${p.stats.goals}</td><td class="num">${p.stats.assists}</td>
    <td class="num">${money(FGM.playerValue(p))}</td></tr>`).join("");
  const hist = t.history.slice().reverse().slice(0, 8).map(h =>
    `<tr><td>${FGM.seasonLabel(h.season)}</td><td class="num">${h.pos}${ord(h.pos)}</td><td class="num">${h.pts}</td></tr>`).join("");
  openModal(`
    <h1>${teamDot(t)} ${esc(t.name)}</h1>
    <p class="sub">${esc(FGM.leagueName(t.league))}${t.country ? ` · ${esc(t.country)}` : ""} · ${esc(t.stadium)} · XI ${ovrSpan(Math.round(ratings.ovr))} · Budget <span class="money">${money(t.budget)}</span> · ${"★".repeat(t.stature)}</p>
    <div class="flex">
      <div><h2>Squad</h2><div class="tbl-wrap"><table>
        <thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Pot</th><th class="num">G</th><th class="num">A</th><th class="num">Value</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>
      ${hist ? `<div style="max-width:260px"><h2>Recent seasons</h2><div class="tbl-wrap"><table><thead><tr><th>Season</th><th class="num">Pos</th><th class="num">Pts</th></tr></thead><tbody>${hist}</tbody></table></div></div>` : ""}
    </div>`);
}

// ---------- Match modal ----------
function showMatchModal(m) {
  const h = FGM.teamById(m.home), a = FGM.teamById(m.away);
  if (!h || !a) return;
  if (!m.played) {
    openModal(`<h1>${esc(h.name)} vs ${esc(a.name)}</h1><p class="sub">${esc(h.stadium)} — not played yet</p>`);
    return;
  }
  const events = (m.events || []).map(ev => {
    const team = FGM.teamById(ev.tid);
    return `<div class="event-line"><span class="event-min">${ev.min}'</span> ⚽ <strong>${esc(ev.name)}</strong> (${team ? esc(team.abbrev) : ""})${esc(ev.text || "")}</div>`;
  }).join("");
  let pensHtml = "";
  if (m.pens && m.shootout && m.shootout.length) {
    const kicks = m.shootout.map(k => {
      const team = FGM.teamById(k.tid);
      return `<div class="event-line"><span class="event-min">${k.scored ? "✅" : "❌"}</span> <strong>${esc(k.name)}</strong> <span class="mute">${team ? esc(team.abbrev) : ""}</span> — ${k.scored ? "scored" : "saved"} <span class="mute">(${esc(k.tally)})</span></div>`;
    }).join("");
    pensHtml = `<h2>Penalty shootout — ${esc(h.name)} ${m.penHome}–${m.penAway} ${esc(a.name)}</h2>${kicks}`;
  }
  const penNote = m.pens ? ` · ${esc(FGM.teamName(m.winner))} win ${m.penHome != null ? `${m.penHome}–${m.penAway} ` : ""}on penalties` : "";
  openModal(`
    <h1 style="text-align:center">${esc(h.name)} <span style="background:var(--bg3);padding:2px 14px;border-radius:6px">${m.hg}–${m.ag}</span> ${esc(a.name)}</h1>
    <p class="sub" style="text-align:center">${esc(h.stadium)}${penNote}${m.comp && m.comp !== FGM.userLeague() ? ` · ${esc(FGM.compName(m.comp))}` : (m.ko ? " · Champions League" : "")}</p>
    <div class="controls" style="justify-content:center;margin:4px 0 10px"><button class="btn btn-accent" data-watch="1">▶ Watch this match</button></div>
    <h2>Goals</h2>
    ${events || "<p class='mute'>A goalless affair. The purists loved it.</p>"}
    ${pensHtml}`);
  const watch = document.querySelector("[data-watch]");
  if (watch) watch.addEventListener("click", () => playLiveMatch(m, () => showMatchModal(m)));
}

// ---------- Global click handling ----------
document.addEventListener("click", e => {
  const pl = e.target.closest(".player-link");
  if (pl) { showPlayerModal(parseInt(pl.dataset.pid, 10)); return; }
  const ps = e.target.closest(".player-search");
  if (ps) {
    const name = ps.dataset.name;
    const match = Object.values(FGM.state.players).find(p => p.name === name);
    if (match) showPlayerModal(match.pid);
    return;
  }
  const tl = e.target.closest(".team-link");
  if (tl) { showTeamModal(parseInt(tl.dataset.tid, 10)); return; }
  const mo = e.target.closest(".match-open");
  if (mo) {
    const m = matchRegistry[parseInt(mo.dataset.mref, 10)];
    if (m) showMatchModal(m);
    return;
  }
  const th = e.target.closest("th[data-sort]");
  if (th) {
    const k = th.dataset.sort;
    if (sortState.key === k) sortState.dir *= -1; else { sortState.key = k; sortState.dir = 1; }
    render(location.hash.slice(1).split("/").slice(1));
    return;
  }
  const buy = e.target.closest("[data-buy]");
  if (buy) { openNegotiation(parseInt(buy.dataset.buy, 10), "sign"); return; }
  const acc = e.target.closest("[data-accept]");
  if (acc) { const r = FGM.userSell(parseInt(acc.dataset.accept, 10)); toast(r.msg, r.ok ? "toast-W" : "toast-L"); FGM.save(); render(); return; }
  const rej = e.target.closest("[data-reject]");
  if (rej) { FGM.rejectOffer(parseInt(rej.dataset.reject, 10)); FGM.save(); render(); return; }
  const act = e.target.closest("[data-act]");
  if (act) {
    const pid = parseInt(act.dataset.pid, 10);
    if (act.dataset.act === "list") { FGM.toggleListed(pid); FGM.save(); showPlayerModal(pid); }
    else if (act.dataset.act === "extend") { openNegotiation(pid, "extend"); }
    else if (act.dataset.act === "buy") { openNegotiation(pid, "sign"); }
    return;
  }
});

// ---------- Contract negotiation modal ----------
function openNegotiation(pid, context) {
  const p = FGM.state.players[pid];
  if (!p) return;
  // Pre-checks for signings (fee / budget / squad) before wasting the player's time.
  if (context === "sign") {
    const user = FGM.teamById(FGM.state.userTid);
    const price = FGM.askingPrice(p);
    if (FGM.teamPlayers(FGM.state.userTid).length >= 32) { toast("Squad is full (32 max).", "toast-L"); return; }
    if (price > user.budget) { toast(`Can't afford the £${price}m fee (budget ${money(user.budget)}).`, "toast-L"); return; }
    const seller = p.tid >= 0 ? FGM.teamById(p.tid) : null;
    if (seller && FGM.teamPlayers(seller.tid).length <= 15) { toast(`${seller.name} won't sell — squad too thin.`, "toast-L"); return; }
  }
  const demand = FGM.contractDemand(p, context);
  // Negotiation state lives here in the UI; engine just judges each offer.
  const neg = { pid, context, round: 1, maxRounds: 4, demand, offerWage: Math.round(demand.wage * 0.9), offerYears: demand.years, log: [], done: false };
  renderNegotiation(neg);
}

function renderNegotiation(neg) {
  const p = FGM.state.players[neg.pid];
  const price = neg.context === "sign" ? FGM.askingPrice(p) : 0;
  const club = p.tid >= 0 ? FGM.teamById(p.tid) : null;
  const wageStep = p.ovr >= 80 ? 10 : 5;
  const logHtml = neg.log.map(l => `<div class="neg-line neg-${l.who}">${l.who === "you" ? "🧑‍💼 You" : "🗣️ " + esc(p.name)}: ${esc(l.text)}</div>`).join("");
  const bodyTop = neg.context === "sign"
    ? `<p class="sub">Transfer fee <span class="money">${money(price)}</span>${club ? ` to ${esc(club.name)}` : " (free agent)"} — agreed. Now settle personal terms.</p>`
    : `<p class="sub">Contract renewal · current deal £${p.wage}k/week, ${p.years} yr${p.years === 1 ? "" : "s"} left.</p>`;

  openModal(`
    <h1>${neg.context === "sign" ? "Sign" : "Renew"} ${esc(p.name)}</h1>
    ${bodyTop}
    <div class="neg-grid">
      <div class="neg-demand">
        <h3>Player wants</h3>
        <div class="neg-figure">£${neg.demand.wage}k<span>/week</span></div>
        <div class="neg-figure small">${neg.demand.years} year${neg.demand.years === 1 ? "" : "s"}</div>
      </div>
      <div class="neg-offer">
        <h3>Your offer</h3>
        <div class="neg-control">
          <button class="btn neg-step" data-neg-wage="-1">−</button>
          <div class="neg-figure">£${neg.offerWage}k<span>/week</span></div>
          <button class="btn neg-step" data-neg-wage="1">+</button>
        </div>
        <div class="neg-control">
          <button class="btn neg-step" data-neg-years="-1">−</button>
          <div class="neg-figure small">${neg.offerYears} year${neg.offerYears === 1 ? "" : "s"}</div>
          <button class="btn neg-step" data-neg-years="1">+</button>
        </div>
      </div>
    </div>
    ${logHtml ? `<div class="neg-log">${logHtml}</div>` : ""}
    ${wageRoomHtml(neg)}
    <div class="controls" style="margin-top:14px">
      <button class="btn btn-accent" data-neg-submit="1" ${neg.done ? "disabled" : ""}>Make offer (round ${neg.round}/${neg.maxRounds})</button>
      <button class="btn" data-neg-meet="1" ${neg.done ? "disabled" : ""}>Meet their demand</button>
      <button class="btn" data-neg-cancel="1">Walk away</button>
    </div>
    <p class="mute" style="margin-top:6px">Wages draw against your wage budget; lowball too hard and they'll walk.</p>`);

  document.querySelectorAll("[data-neg-wage]").forEach(b => b.addEventListener("click", () => {
    neg.offerWage = Math.max(5, neg.offerWage + parseInt(b.dataset.negWage, 10) * wageStep);
    renderNegotiation(neg);
  }));
  document.querySelectorAll("[data-neg-years]").forEach(b => b.addEventListener("click", () => {
    neg.offerYears = clampN(neg.offerYears + parseInt(b.dataset.negYears, 10), 1, 6);
    renderNegotiation(neg);
  }));
  const meet = document.querySelector("[data-neg-meet]");
  if (meet) meet.addEventListener("click", () => { neg.offerWage = neg.demand.wage; neg.offerYears = neg.demand.years; submitOffer(neg); });
  document.querySelector("[data-neg-submit]").addEventListener("click", () => submitOffer(neg));
  document.querySelector("[data-neg-cancel]").addEventListener("click", () => { closeModal(); if (neg.context === "extend") showPlayerModal(neg.pid); });
}

function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Show how the offered wage sits against the user's wage budget.
function wageRoomHtml(neg) {
  const t = FGM.teamById(FGM.state.userTid);
  if (!t || t.wageBudget === undefined) return "";
  const room = FGM.wageRoomAfter(FGM.state.userTid, neg.pid, neg.offerWage);
  const cap = t.wageBudget, bill = FGM.wageBill(t.tid);
  const projected = neg.context === "sign" ? bill + neg.offerWage : bill - (FGM.state.players[neg.pid].wage) + neg.offerWage;
  const over = room < 0;
  return `<div class="neg-budget ${over ? "neg-over" : ""}">
    Wage budget: £${projected}k / £${cap}k per week
    ${over ? `<strong> — £${Math.round(-room)}k over the cap</strong>` : `· £${Math.round(room)}k headroom`}
  </div>`;
}

function submitOffer(neg) {
  const p = FGM.state.players[neg.pid];
  neg.log.push({ who: "you", text: `£${neg.offerWage}k/week over ${neg.offerYears} year${neg.offerYears === 1 ? "" : "s"}.` });
  const res = FGM.evaluateContractOffer(p, neg.demand, neg.offerWage, neg.offerYears, neg.round);
  if (res.accepted) {
    const r = neg.context === "sign"
      ? FGM.agreeSigning(neg.pid, neg.offerWage, neg.offerYears)
      : FGM.agreeExtension(neg.pid, neg.offerWage, neg.offerYears);
    FGM.save();
    closeModal();
    toast(r.msg, r.ok ? "toast-W" : "toast-L", 4200);
    render();
    return;
  }
  if (res.walk) {
    neg.log.push({ who: "them", text: "That's an insult. These talks are over." });
    neg.done = true;
    renderNegotiation(neg);
    toast(`${p.name} walked away from negotiations.`, "toast-L");
    return;
  }
  // Counter-offer: adopt softened demand, advance round.
  neg.demand = res.counter;
  neg.offerWage = Math.max(neg.offerWage, Math.round(res.counter.wage * 0.95));
  neg.offerYears = res.counter.years;
  neg.round++;
  neg.log.push({ who: "them", text: `Closer... I'd take £${res.counter.wage}k/week over ${res.counter.years} years.` });
  if (neg.round > neg.maxRounds) {
    neg.done = true;
    neg.log.push({ who: "them", text: "We're going in circles. I'm done here." });
    renderNegotiation(neg);
    toast("Negotiations broke down.", "toast-L");
    return;
  }
  renderNegotiation(neg);
}

// ---------- New game flow ----------
let ngSeason = 2025, ngLeague = "EPL", ngPick = null;

function clubPreview(t, season) {
  const modern = season === 2025;
  const xi = modern ? Math.round(t.players.slice().sort((a, b) => b[3] - a[3]).slice(0, 11).reduce((s2, p) => s2 + p[3], 0) / 11) : null;
  const stars = modern ? t.players.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map(p => p[0]) : [];
  return { xi, stars };
}

function showNewGameFlow() {
  $("#top-status").textContent = "New career";
  $("#top-team").textContent = "";
  const seasonOpts = [];
  for (let y = FGM.MAX_START; y >= FGM.MIN_START; y--) {
    seasonOpts.push(`<option value="${y}" ${y === ngSeason ? "selected" : ""}>${y}-${String((y + 1) % 100).padStart(2, "0")}${y === 2025 ? " · current squads" : ""}</option>`);
  }
  const eraChips = [[2025, "Today"], [2015, "2015"], [2010, "2010"], [2005, "2005"], [2000, "2000"]]
    .map(([y, label]) => `<a class="ltab ${y === ngSeason ? "active" : ""}" data-ng-era="${y}" href="javascript:void(0)">${label}</a>`).join("");
  const leagueTabsHtml = FGM.LEAGUE_DEFS.map(d =>
    `<a class="ltab ${d.id === ngLeague ? "active" : ""}" data-ng-league="${d.id}" href="javascript:void(0)">${esc(d.name)}</a>`).join("");
  const def = FGM.LEAGUE_DEFS.find(d => d.id === ngLeague);
  const clubs = def.teams().slice().sort((a, b) => b.stature - a.stature || a.name.localeCompare(b.name));
  const cards = clubs.map(t => {
    const pv = clubPreview(t, ngSeason);
    return `<div class="club-card" data-ng-pick="${esc(t.abbrev)}" role="button" tabindex="0">
      <div class="club-stripe" style="background:linear-gradient(90deg, ${t.colors[0]}, ${t.colors[1]})"></div>
      <div class="club-card-body">
        <div class="club-name">${esc(t.name)}</div>
        <div class="club-meta">
          <span class="club-stars">${"★".repeat(t.stature)}<span class="mute">${"★".repeat(5 - t.stature)}</span></span>
          ${pv.xi !== null ? `<span>XI ${ovrSpan(pv.xi)}</span>` : ""}
          <span class="mute">${money(t.budget)}</span>
        </div>
        ${pv.stars.length ? `<div class="club-stars-line mute">${esc(pv.stars.join(" · "))}</div>` : `<div class="club-stars-line mute">Squad rebuilt from real ${ngSeason} careers</div>`}
      </div>
      <div class="club-go">›</div>
    </div>`;
  }).join("");
  content.innerHTML = `
    <div class="ng-wrap">
      <h1>⚽ Football GM</h1>
      <p class="sub">Real clubs, real players, real career arcs — Europe's top five leagues plus the Champions League.</p>
      <div class="card ng-step"><h3><span class="step-n">1</span> When does your story start?</h3>
        <div class="ltabs" style="margin:4px 0 8px">${eraChips}</div>
        <div class="controls" style="margin:0"><select id="ng-season">${seasonOpts.join("")}</select></div>
        <p class="mute" style="margin-top:8px">${ngSeason === 2025 ? "Hand-rated 2025-26 squads, fresh from the summer window." : `Squads rebuilt as they were in ${ngSeason} — and future stars (Messi, Ronaldo, Mbappé…) will debut right on schedule as the years pass.`}</p></div>
      <div class="card ng-step"><h3><span class="step-n">2</span> Pick your league</h3>
        <div class="ltabs" style="margin:4px 0 0">${leagueTabsHtml}</div></div>
      <div class="card ng-step"><h3><span class="step-n">3</span> Tap the club you want to manage</h3>
        <div class="club-grid">${cards}</div></div>
    </div>`;
  $("#ng-season").addEventListener("change", e => { ngSeason = parseInt(e.target.value, 10); showNewGameFlow(); });
  content.querySelectorAll("[data-ng-era]").forEach(a => a.addEventListener("click", () => { ngSeason = parseInt(a.dataset.ngEra, 10); showNewGameFlow(); }));
  content.querySelectorAll("[data-ng-league]").forEach(a => a.addEventListener("click", () => { ngLeague = a.dataset.ngLeague; showNewGameFlow(); }));
  content.querySelectorAll("[data-ng-pick]").forEach(c => {
    const open = () => showConfirmClub(c.dataset.ngPick);
    c.addEventListener("click", open);
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function showConfirmClub(abbrev) {
  const def = FGM.LEAGUE_DEFS.find(d => d.id === ngLeague);
  const t = def.teams().find(x => x.abbrev === abbrev);
  if (!t) return;
  ngPick = abbrev;
  const pv = clubPreview(t, ngSeason);
  const starRows = ngSeason === 2025
    ? t.players.slice().sort((a, b) => b[3] - a[3]).slice(0, 6).map(p =>
        `<tr><td>${esc(p[0])}</td><td>${posBadge(p[1])}</td><td class="num">${p[2]}</td><td class="num">${ovrSpan(p[3])}</td><td class="num mute">${p[4]}</td></tr>`).join("")
    : "";
  openModal(`
    <div class="confirm-head" style="background:linear-gradient(120deg, ${t.colors[0]}22, ${t.colors[1]}22); border-left: 5px solid ${t.colors[0]}">
      <h1 style="margin:0">${esc(t.name)}</h1>
      <p class="sub" style="margin:4px 0 0">${esc(def.name)} · ${esc(t.stadium)} · ${"★".repeat(t.stature)}${"☆".repeat(5 - t.stature)}
      ${pv.xi !== null ? ` · XI ${ovrSpan(pv.xi)}` : ""} · Budget <span class="money">${money(t.budget)}</span></p>
    </div>
    ${starRows ? `<h2>Key players</h2><div class="tbl-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Pot</th></tr></thead><tbody>${starRows}</tbody></table></div>`
      : `<p class="mute" style="margin:14px 0">Your ${ngSeason} squad will be rebuilt from real career timelines the moment you take the job — legends included.</p>`}
    <div class="confirm-actions">
      <button class="btn btn-start" id="ng-confirm">🤝 Take the job — start ${ngSeason}-${String((ngSeason + 1) % 100).padStart(2, "0")}</button>
      <button class="btn" id="ng-cancel">← Choose another club</button>
    </div>
    <p class="mute" style="text-align:center;margin-top:8px">Starting a career replaces any existing save.</p>`);
  $("#ng-cancel").addEventListener("click", closeModal);
  $("#ng-confirm").addEventListener("click", () => {
    closeModal();
    content.innerHTML = `<div class="ng-wrap"><h1>⚽ Building your world…</h1><p class="sub">Assembling ${esc(t.name)}'s squad${ngSeason < 2025 ? `, rewinding to ${ngSeason} and scheduling ${2025 - ngSeason} years of real debuts` : ""}…</p></div>`;
    setTimeout(() => {
      FGM.newLeague(ngSeason, ngLeague, ngPick);
      FGM.save();
      location.hash = "#dashboard";
      currentView = "dashboard";
      render();
      toast(`🤝 You're the new manager of ${FGM.teamById(FGM.state.userTid).name}. The board expects results.`, "toast-W", 4500);
    }, 30);
  });
}

// ---------- Boot ----------
if (FGM.load()) navigate();
else showNewGameFlow();

})();
