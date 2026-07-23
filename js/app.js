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
    const comp = m.comp === "UCL" ? " · UCL" : "";
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
    fixtures: viewFixtures, europe: viewEurope, stats: viewStats, players: viewAllPlayers,
    transfers: viewTransfers, finances: viewFinances, history: viewHistory,
    news: viewNews, settings: viewSettings,
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

  const matches = FGM.teamMatches(s.userTid).filter(x => x.m.played || x.comp !== "UCL" || x.stage === undefined);
  const upcoming = FGM.teamMatches(s.userTid).filter(x => !x.m.played);
  const played = FGM.teamMatches(s.userTid).filter(x => x.m.played);
  played.sort((a, b) => 0); // schedule order is fine
  const next = upcoming[0];
  const last = played[played.length - 1];

  let nextHtml = "<p class='mute'>Season complete.</p>";
  if (next) {
    const h = FGM.teamById(next.m.home), a = FGM.teamById(next.m.away);
    if (h && a) nextHtml = `<p>${next.comp === "UCL" ? "🏆 Champions League" : esc(FGM.leagueName(next.comp))}</p>
      <p class="big">${teamLink(h)} vs ${teamLink(a)}</p><p class="mute">${esc(h.stadium)}</p>`;
  }
  let lastHtml = "<p class='mute'>No matches played yet.</p>";
  if (last) {
    const h = FGM.teamById(last.m.home), a = FGM.teamById(last.m.away);
    if (h && a) lastHtml = `<p class="big match-open" data-mref="${matchRef(last)}" style="cursor:pointer">
      ${esc(h.name)} ${last.m.hg}–${last.m.ag} ${esc(a.name)}</p>
      <p class="mute">${last.comp === "UCL" ? "Champions League" : "League"} — click for details</p>`;
  }

  const mini = table.slice(0, 6).map(r =>
    `<tr class="${r.tid === s.userTid ? "user-row" : ""}"><td>${r.pos}</td><td>${teamLink(FGM.teamById(r.tid))}</td><td class="num">${r.p}</td><td class="num"><strong>${r.pts}</strong></td></tr>`
  ).join("");

  const form = userRow.form.map(f => `<span class="form-${f}">${f}</span>`).join("");
  const news = s.news.slice(0, 8).map(n => `<div class="news-item"><span class="date">${FGM.seasonLabel(n.season)} W${n.week}</span>${esc(n.text)}</div>`).join("");

  content.innerHTML = `
    <h1>${teamDot(t)} ${esc(t.name)}</h1>
    <p class="sub">${esc(FGM.leagueName(t.league))} · ${FGM.seasonLabel()} · <strong>${userRow.pos}${ord(userRow.pos)}</strong> · ${userRow.pts} pts ·
      XI ${ovrSpan(Math.round(ratings.ovr))} · Form <span class="form-str">${form || "—"}</span>${inCL ? " · <span class='badge badge-gold'>UCL</span>" : ""}</p>
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

function viewEurope() {
  const s = FGM.state;
  const cl = s.cl;
  if (!cl) { content.innerHTML = "<h1>Champions League</h1><p class='mute'>No competition yet.</p>"; return; }
  matchRegistry.length = 0;
  const groupHtml = cl.groups.map((g, gi) => {
    const rows = FGM.clGroupTable(gi).map((r, i) => {
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
    <h1>🏆 Champions League</h1>
    <p class="sub">${FGM.seasonLabel()} · Group matchdays are played midweek (weeks ${FGM.CL_GROUP_WEEKS.map(w => w + 1).join(", ")}); knockouts in spring · single-leg knockout ties</p>
    ${winner ? `<div class="card" style="border-color:var(--gold)"><h3>🏆⭐ Champions of Europe</h3><p class="big">${teamLink(winner)}</p></div>` : ""}
    ${koBlock("Final", cl.final)}
    ${koBlock("Semi-finals", cl.sf)}
    ${koBlock("Quarter-finals", cl.qf)}
    ${koBlock("Round of 16", cl.r16)}
    <h2>Groups</h2>
    <div class="cards">${groupHtml}</div>`;
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
  content.innerHTML = `<h1>Stat Leaders</h1><p class="sub">${FGM.seasonLabel()} · all playable leagues + Champions League</p><div class="cards" style="align-items:flex-start">${blocks}</div>`;
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
  const yearly = Math.round(wageBill * 52 / 100) / 10;
  const top = players.slice().sort((a, b) => b.wage - a.wage).slice(0, 10)
    .map(p => `<tr><td>${playerLink(p)}</td><td>${posBadge(p.pos)}</td><td class="num">£${p.wage}k</td><td class="num">${p.years}</td></tr>`).join("");
  content.innerHTML = `
    <h1>Finances</h1>
    <div class="cards">
      <div class="card"><h3>Transfer budget</h3><p class="big money">${money(t.budget)}</p></div>
      <div class="card"><h3>Wage bill</h3><p class="big">£${wageBill}k <span class="mute" style="font-size:14px">/week</span></p><p class="mute">≈ ${money(yearly)} per year</p></div>
      <div class="card"><h3>Club stature</h3><p class="big">${"★".repeat(t.stature)}${"☆".repeat(5 - t.stature)}</p><p class="mute">Drives sponsorship &amp; youth quality</p></div>
    </div>
    <h2>Top earners</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Wage</th><th class="num">Years</th></tr></thead><tbody>${top}</tbody></table></div>
    <p class="mute" style="margin-top:10px">Season income: league prize money by final position, sponsorship by stature, Champions League participation & progress bonuses — minus part of the wage bill.</p>`;
}

function viewHistory() {
  const s = FGM.state;
  if (!s.history.length) {
    content.innerHTML = "<h1>History</h1><p class='mute'>No completed seasons yet. Champions, awards and Champions League winners will appear here.</p>";
    return;
  }
  const blocks = s.history.slice().reverse().map(h => {
    const aw = (label, a) => a ? `<tr><td>${label}</td><td>${esc(a.name)} (${esc(a.abbrev)})</td><td class="num">${a.value} ${a.label === "rating" ? "" : a.label}</td></tr>` : "";
    const champs = FGM.LEAGUE_DEFS.map(d => h.champions[d.id]
      ? `<tr><td>${esc(d.name)}</td><td>🏆 ${esc(h.champions[d.id].name)}</td><td class="num">${h.champions[d.id].pts}</td></tr>` : "").join("");
    return `<div class="card">
      <h3>${FGM.seasonLabel(h.season)}${h.clWinner ? ` — 🏆⭐ ${esc(h.clWinner.name)} won the Champions League` : ""}</h3>
      <div class="flex">
        <div><strong>League champions</strong><div class="tbl-wrap"><table><tbody>${champs}</tbody></table></div>
        <p class="mute" style="margin-top:6px">Your finish: ${h.userPos}${ord(h.userPos)} in the ${esc(FGM.leagueName(h.userLeague))} (${esc(h.userTeam)})</p></div>
        <div><strong>Awards</strong><div class="tbl-wrap"><table><tbody>
          ${aw("👟 Golden Shoe", h.goldenBoot)}${aw("🎯 Playmaker", h.playmaker)}${aw("🧤 Golden Glove", h.goldenGlove)}
          ${aw("⭐ Player of the Season", h.poty)}${aw("🌟 Young Player", h.ypoty)}
        </tbody></table></div></div>
      </div></div>`;
  }).join("");
  content.innerHTML = `<h1>History</h1><div class="cards" style="flex-direction:column">${blocks}</div>`;
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
    <h2>Attributes</h2>
    <div class="attr-grid">${attrs}</div>
    <h2>Career</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Season</th><th>Team</th><th class="num">Age</th><th class="num">Ovr</th><th class="num">Apps</th><th class="num">G</th><th class="num">A</th><th class="num">CS</th></tr></thead>
    <tbody>${curRow}${careerRows || ""}</tbody></table></div>
    ${p.retired ? "" : "<p class='mute' style='margin-top:6px'>* current season in progress</p>"}`);
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
  openModal(`
    <h1 style="text-align:center">${esc(h.name)} <span style="background:var(--bg3);padding:2px 14px;border-radius:6px">${m.hg}–${m.ag}</span> ${esc(a.name)}</h1>
    <p class="sub" style="text-align:center">${esc(h.stadium)}${m.pens ? ` · ${esc(FGM.teamName(m.winner))} win on penalties` : ""}${m.comp === "UCL" || m.ko ? " · Champions League" : ""}</p>
    <h2>Goals</h2>
    ${events || "<p class='mute'>A goalless affair. The purists loved it.</p>"}`);
}

// ---------- Global click handling ----------
document.addEventListener("click", e => {
  const pl = e.target.closest(".player-link");
  if (pl) { showPlayerModal(parseInt(pl.dataset.pid, 10)); return; }
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
  if (buy) { const r = FGM.userBuy(parseInt(buy.dataset.buy, 10)); toast(r.msg, r.ok ? "toast-W" : "toast-L"); FGM.save(); render(); return; }
  const acc = e.target.closest("[data-accept]");
  if (acc) { const r = FGM.userSell(parseInt(acc.dataset.accept, 10)); toast(r.msg, r.ok ? "toast-W" : "toast-L"); FGM.save(); render(); return; }
  const rej = e.target.closest("[data-reject]");
  if (rej) { FGM.rejectOffer(parseInt(rej.dataset.reject, 10)); FGM.save(); render(); return; }
  const act = e.target.closest("[data-act]");
  if (act) {
    const pid = parseInt(act.dataset.pid, 10);
    if (act.dataset.act === "list") { FGM.toggleListed(pid); FGM.save(); showPlayerModal(pid); }
    else if (act.dataset.act === "extend") { const r = FGM.extendContract(pid); toast(r.msg, r.ok ? "toast-W" : "toast-L"); FGM.save(); showPlayerModal(pid); }
    else if (act.dataset.act === "buy") { const r = FGM.userBuy(pid); toast(r.msg, r.ok ? "toast-W" : "toast-L"); FGM.save(); closeModal(); render(); }
    return;
  }
});

// ---------- New game flow ----------
let ngSeason = 2025, ngLeague = "EPL";
function showNewGameFlow() {
  $("#top-status").textContent = "New career";
  $("#top-team").textContent = "";
  const seasonOpts = [];
  for (let y = FGM.MAX_START; y >= FGM.MIN_START; y--) {
    seasonOpts.push(`<option value="${y}" ${y === ngSeason ? "selected" : ""}>${y}-${String((y + 1) % 100).padStart(2, "0")}${y === 2025 ? " (current)" : ""}</option>`);
  }
  const leagueTabsHtml = FGM.LEAGUE_DEFS.map(d =>
    `<a class="ltab ${d.id === ngLeague ? "active" : ""}" data-ng-league="${d.id}" href="javascript:void(0)">${esc(d.name)}</a>`).join("");
  const def = FGM.LEAGUE_DEFS.find(d => d.id === ngLeague);
  const clubs = def.teams().slice().sort((a, b) => b.stature - a.stature || a.name.localeCompare(b.name));
  const rows = clubs.map(t => {
    const modern = ngSeason === 2025;
    const best = modern ? t.players.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map(p => p[0]).join(", ") : "Era squad built from real career timelines";
    return `<tr>
      <td><span class="team-dot" style="background:${t.colors[0]}"></span><strong>${esc(t.name)}</strong></td>
      <td>${"★".repeat(t.stature)}</td>
      <td class="mute">${esc(best)}</td>
      <td><button class="btn btn-small btn-accent" data-ng-pick="${esc(t.abbrev)}">Manage</button></td></tr>`;
  }).join("");
  content.innerHTML = `
    <h1>⚽ Welcome to Football GM</h1>
    <p class="sub">Real clubs, real players, real career arcs — across Europe's top five leagues, with the Champions League on top. Start in any season back to 2000: begin in the past and watch Messi, Ronaldo &amp; co. debut right on schedule.</p>
    <div class="card" style="margin-bottom:14px"><h3>1 · Choose your starting season</h3>
      <div class="controls"><select id="ng-season">${seasonOpts.join("")}</select>
      <span class="mute" id="ng-season-hint">${ngSeason === 2025 ? "Authored 2025-26 squads." : "Rosters rebuilt from real career timelines; future stars debut on schedule."}</span></div></div>
    <div class="card" style="margin-bottom:14px"><h3>2 · Choose your league</h3><div class="ltabs" style="margin:0">${leagueTabsHtml}</div></div>
    <h3 style="margin:6px 0">3 · Choose your club</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Club</th><th>Stature</th><th>Notable players (2025-26)</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  $("#ng-season").addEventListener("change", e => { ngSeason = parseInt(e.target.value, 10); showNewGameFlow(); });
  content.querySelectorAll("[data-ng-league]").forEach(a => a.addEventListener("click", () => { ngLeague = a.dataset.ngLeague; showNewGameFlow(); }));
  content.querySelectorAll("[data-ng-pick]").forEach(b => b.addEventListener("click", () => {
    content.innerHTML = "<h1>⚽ Building your world…</h1><p class='sub'>Assembling squads" + (ngSeason < 2025 ? `, rewinding to ${ngSeason} and scheduling ${2025 - ngSeason} years of real debuts` : "") + "…</p>";
    setTimeout(() => {
      FGM.newLeague(ngSeason, ngLeague, b.dataset.ngPick);
      FGM.save();
      location.hash = "#dashboard";
      currentView = "dashboard";
      render();
      toast(`You're the new manager of ${FGM.teamById(FGM.state.userTid).name}. The board expects results.`, "toast-W", 4500);
    }, 30);
  }));
}

// ---------- Boot ----------
if (FGM.load()) navigate();
else showNewGameFlow();

})();
