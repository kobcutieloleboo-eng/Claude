// Football GM — club crests & competition emblems.
//
// Every badge in the game is drawn here as inline SVG rather than shipped as an
// image. That is deliberate on three counts: real club and competition marks are
// trademarked and this is a free fan project, the game has to stay a single file
// with no network requests, and 125 clubs would otherwise mean 125 binaries in a
// repo that is currently all text.
//
// Each club already carries its two real kit colours, so a crest is generated
// from those plus a pattern chosen by hashing the club's name — the same club
// always gets the same badge, and neighbouring clubs in a table rarely collide.
// DOM-free: returns markup strings, so the test suite can check it under Node.
(function (root) {
"use strict";

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Perceived brightness (ITU-R BT.601), used to keep text and outlines legible on
// whatever the club plays in — several clubs are white or near-black.
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}
function isLight(hex) { return luminance(hex) > 0.62; }

// The badge outline. Every crest shares this one path so a single clipPath —
// defined once in the page, see index.html — can mask all of them, whatever
// size they render at, as long as they share this viewBox.
const SHIELD = "M5 4 H59 V37 C59 53.5 45.5 65.5 32 70.5 C18.5 65.5 5 53.5 5 37 Z";
const VIEWBOX = "0 0 64 74";
const CLIP = 'clip-path="url(#fgmShield)"';

// Seven kit patterns, drawn to fill the whole viewBox and masked to the shield.
// `a` is the club's primary colour, `b` its secondary.
const PATTERNS = [
  // 0 — solid
  (a, b) => `<rect width="64" height="74" fill="${a}"/>`,
  // 1 — vertical stripes
  (a, b) => `<rect width="64" height="74" fill="${a}"/>` +
    [12, 28, 44].map(x => `<rect x="${x}" width="8" height="74" fill="${b}"/>`).join(""),
  // 2 — halves
  (a, b) => `<rect width="32" height="74" fill="${a}"/><rect x="32" width="32" height="74" fill="${b}"/>`,
  // 3 — hoops
  (a, b) => `<rect width="64" height="74" fill="${a}"/>` +
    [12, 30, 48].map(y => `<rect y="${y}" width="64" height="9" fill="${b}"/>`).join(""),
  // 4 — diagonal sash
  (a, b) => `<rect width="64" height="74" fill="${a}"/><path d="M-8 26 L34 -8 L58 -8 L-8 50 Z" fill="${b}"/>`,
  // 5 — quartered
  (a, b) => `<rect width="64" height="74" fill="${a}"/><rect x="32" width="32" height="37" fill="${b}"/>` +
    `<rect y="37" width="32" height="37" fill="${b}"/>`,
  // 6 — chevron
  (a, b) => `<rect width="64" height="74" fill="${a}"/><path d="M32 8 L64 34 V50 L32 24 L0 50 V34 Z" fill="${b}"/>`,
];

// A club whose two colours are both very light or both very dark would produce a
// pattern you cannot read, so fall back to a solid field in that case.
function patternFor(team) {
  const a = team.colors[0], b = team.colors[1] || "#ffffff";
  const idx = hash(team.name + team.abbrev) % PATTERNS.length;
  if (idx === 0) return 0;
  return Math.abs(luminance(a) - luminance(b)) < 0.12 ? 0 : idx;
}

/**
 * A club crest as an inline <svg> string.
 * Below ~30px the three-letter code is dropped — it would be unreadable, and the
 * shape plus colours already do the identifying at that size.
 */
function clubCrest(team, size) {
  if (!team || !team.colors) return "";
  const px = size || 18;
  const a = team.colors[0], b = team.colors[1] || "#ffffff";
  const body = PATTERNS[patternFor(team)](a, b);
  const rim = isLight(a) && isLight(b) ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.42)";
  let text = "";
  if (px >= 30) {
    // Outlined text stays readable over stripes, halves and sashes alike, where
    // a single fill colour would vanish against one half of the badge.
    const light = isLight(a);
    const fill = light ? "#10151c" : "#ffffff";
    const stroke = light ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.6)";
    // textLength pins the code to a width that always clears the shield's edges,
    // whatever the font the browser actually resolves — wide codes like "WOL"
    // otherwise spill past the rim.
    text = `<text x="32" y="42" text-anchor="middle" font-size="19" font-weight="800"
      textLength="34" lengthAdjust="spacingAndGlyphs"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      fill="${fill}" stroke="${stroke}" stroke-width="3.2" paint-order="stroke">${esc(team.abbrev)}</text>`;
  }
  return `<svg class="crest" viewBox="${VIEWBOX}" width="${px}" height="${Math.round(px * 74 / 64)}" ` +
    `role="img" aria-label="${esc(team.name)} crest">` +
    `<g ${CLIP}>${body}</g>` +
    `<path d="${SHIELD}" fill="none" stroke="${rim}" stroke-width="3"/>` +
    text + `</svg>`;
}

// ---------- Competition emblems ----------
// Original designs, one family: a plate (rounded square for leagues, a disc for
// the two European competitions) carrying a device and a monogram. They borrow
// each competition's familiar colours, which are not protectable, but none of
// the real marks — no lion, no starball, no snarling anything.

function ball(cx, cy, r, fill, ink) {
  // A simple panelled football: circle plus a pentagon and three seams.
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
    `<path d="M${cx} ${cy - r * 0.52} L${cx + r * 0.5} ${cy - r * 0.16} L${cx + r * 0.31} ${cy + r * 0.42} ` +
    `L${cx - r * 0.31} ${cy + r * 0.42} L${cx - r * 0.5} ${cy - r * 0.16} Z" fill="${ink}"/>` +
    `<g stroke="${ink}" stroke-width="${r * 0.13}" fill="none" stroke-linecap="round">` +
    `<path d="M${cx} ${cy - r * 0.52} V${cy - r}"/>` +
    `<path d="M${cx + r * 0.5} ${cy - r * 0.16} L${cx + r * 0.95} ${cy - r * 0.31}"/>` +
    `<path d="M${cx - r * 0.5} ${cy - r * 0.16} L${cx - r * 0.95} ${cy - r * 0.31}"/>` +
    `<path d="M${cx + r * 0.31} ${cy + r * 0.42} L${cx + r * 0.58} ${cy + r * 0.81}"/>` +
    `<path d="M${cx - r * 0.31} ${cy + r * 0.42} L${cx - r * 0.58} ${cy + r * 0.81}"/></g>`;
}

// A generic trophy silhouette for the European competitions.
function trophy(cx, cy, s, fill) {
  return `<g fill="${fill}"><path d="M${cx - 9 * s} ${cy - 14 * s} h${18 * s} v${6 * s} ` +
    `a${9 * s} ${11 * s} 0 0 1 -${18 * s} 0 Z"/>` +
    `<path d="M${cx - 13 * s} ${cy - 13 * s} a${5 * s} ${5 * s} 0 0 0 ${5 * s} ${7 * s} ` +
    `l0 -${3 * s} a${3 * s} ${3 * s} 0 0 1 -${2 * s} -${4 * s} Z"/>` +
    `<path d="M${cx + 13 * s} ${cy - 13 * s} a${5 * s} ${5 * s} 0 0 1 -${5 * s} ${7 * s} ` +
    `l0 -${3 * s} a${3 * s} ${3 * s} 0 0 0 ${2 * s} -${4 * s} Z"/>` +
    `<rect x="${cx - 2 * s}" y="${cy - 1 * s}" width="${4 * s}" height="${7 * s}"/>` +
    `<rect x="${cx - 8 * s}" y="${cy + 6 * s}" width="${16 * s}" height="${4 * s}" rx="${1.5 * s}"/></g>`;
}

function starRing(cx, cy, r, n, size, fill) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    // Five-pointed star, drawn small enough to read as a ring of dots at 20px.
    let pts = "";
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? size * 0.42 : size;
      const a2 = (k / 10) * Math.PI * 2 - Math.PI / 2;
      pts += `${(x + Math.cos(a2) * rr).toFixed(2)},${(y + Math.sin(a2) * rr).toFixed(2)} `;
    }
    out += `<polygon points="${pts.trim()}" fill="${fill}"/>`;
  }
  return out;
}

function mono(text, x, y, size, fill, weight) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight || 800}"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fill="${fill}" letter-spacing="-0.5">${esc(text)}</text>`;
}

// Rounded-square plate used by the five domestic leagues.
function plate(bg, accent) {
  return `<rect width="64" height="64" rx="14" fill="${bg}"/>` +
    (accent ? `<rect width="64" height="64" rx="14" fill="none" stroke="${accent}" stroke-width="2"/>` : "");
}

const EMBLEMS = {
  // Premier League — purple plate, a ball above three rising bars (a league table
  // climbing). Kept chunky: these render at 16px in the league tabs.
  EPL: () => plate("#38003c", "#7b2b83") +
    ball(32, 21, 13, "#ffffff", "#38003c") +
    `<g fill="#00ff85"><rect x="14" y="45" width="10" height="10" rx="2"/>` +
    `<rect x="27" y="40" width="10" height="15" rx="2"/>` +
    `<rect x="40" y="35" width="10" height="20" rx="2"/></g>`,

  // La Liga — crimson plate crossed by a gold band carrying the monogram.
  LIGA: () => plate("#c8102e", "#ff5a72") +
    `<path d="M0 24 L64 12 V32 L0 44 Z" fill="#ffb81c"/>` +
    mono("LL", 32, 34, 19, "#8c0018") +
    `<circle cx="18" cy="54" r="3" fill="#ffb81c"/><circle cx="32" cy="54" r="3" fill="#ffb81c"/>` +
    `<circle cx="46" cy="54" r="3" fill="#ffb81c"/>`,

  // Serie A — navy plate with the Italian tricolour running up the left edge.
  SA: () => plate("#0b2340", "#2c4a72") +
    `<g><rect x="8" y="12" width="6" height="40" fill="#008c45"/>` +
    `<rect x="14" y="12" width="6" height="40" fill="#f4f5f0"/>` +
    `<rect x="20" y="12" width="6" height="40" fill="#cd212a"/></g>` +
    mono("A", 43, 45, 30, "#ffffff"),

  // Bundesliga — red plate split by a black diagonal.
  BL: () => plate("#d20515", "#ff4757") +
    `<path d="M0 64 L64 0 V22 L22 64 Z" fill="#111418"/>` +
    ball(20, 20, 9, "#ffffff", "#111418") +
    mono("BL", 43, 52, 17, "#ffffff"),

  // Ligue 1 — blue plate, white hexagon (l'Hexagone) carrying the numeral. Solid
  // rather than outlined: an inner ring reads as mud once it shrinks to 16px.
  L1: () => plate("#091c3e", "#2b4b80") +
    `<polygon points="32,7 55,20.5 55,47.5 32,61 9,47.5 9,20.5" fill="#eef2fa"/>` +
    mono("1", 32, 46, 34, "#091c3e"),

  // Champions League — navy disc, a ring of ten stars around a trophy.
  UCL: () => `<circle cx="32" cy="32" r="31" fill="#0a1a3f"/>` +
    `<circle cx="32" cy="32" r="31" fill="none" stroke="#3f6fd1" stroke-width="2"/>` +
    starRing(32, 32, 25, 10, 3.6, "#ffffff") +
    trophy(32, 33, 1.05, "#d9e4ff"),

  // Europa League — near-black disc, orange rays behind a trophy.
  UEL: () => `<circle cx="32" cy="32" r="31" fill="#141414"/>` +
    `<circle cx="32" cy="32" r="31" fill="none" stroke="#ff6a13" stroke-width="2"/>` +
    `<g stroke="#ff6a13" stroke-width="2.4" stroke-linecap="round">` +
    [0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
      const r0 = 19, r1 = 27, a = deg * Math.PI / 180;
      return `<path d="M${(32 + Math.cos(a) * r0).toFixed(1)} ${(32 + Math.sin(a) * r0).toFixed(1)} ` +
        `L${(32 + Math.cos(a) * r1).toFixed(1)} ${(32 + Math.sin(a) * r1).toFixed(1)}"/>`;
    }).join("") + `</g>` +
    trophy(32, 33, 1.05, "#ff8c33"),
};

const COMP_LABEL = {
  EPL: "Premier League", LIGA: "La Liga", SA: "Serie A", BL: "Bundesliga",
  L1: "Ligue 1", UCL: "Champions League", UEL: "Europa League",
};

/** A competition emblem as an inline <svg> string, or "" for anything unknown. */
function compEmblem(id, size) {
  const draw = EMBLEMS[id];
  if (!draw) return "";
  const px = size || 22;
  return `<svg class="emblem" viewBox="0 0 64 64" width="${px}" height="${px}" ` +
    `role="img" aria-label="${esc(COMP_LABEL[id] || id)} emblem">${draw()}</svg>`;
}

function hasEmblem(id) { return !!EMBLEMS[id]; }

// The shared clipPath markup, so index.html and the bundle can't drift apart.
const SHIELD_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">` +
  `<defs><clipPath id="fgmShield"><path d="${SHIELD}"/></clipPath></defs></svg>`;

const FGMArt = { clubCrest, compEmblem, hasEmblem, SHIELD_DEFS, SHIELD, COMP_LABEL, luminance };
root.FGMArt = FGMArt;
if (typeof module !== "undefined") module.exports = FGMArt;

})(typeof globalThis !== "undefined" ? globalThis : this);
