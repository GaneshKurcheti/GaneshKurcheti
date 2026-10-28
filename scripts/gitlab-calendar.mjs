// Draws the public GitLab contribution calendar as two SVGs (light + dark) for the profile README.
// Run: node scripts/gitlab-calendar.mjs [gitlabUser]   (no dependencies; Node 18+ for fetch)
import { writeFileSync, mkdirSync } from 'node:fs';

const USER = process.argv[2] || 'GaneshKurcheti';
const res = await fetch(`https://gitlab.com/users/${USER}/calendar.json`);
if (!res.ok) throw new Error(`GitLab calendar: HTTP ${res.status}`);
const counts = await res.json(); // { "YYYY-MM-DD": n } for days with activity

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = Date.UTC(...new Date().toISOString().slice(0, 10).split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
const start = today - 52 * 7 * DAY - new Date(today).getUTCDay() * DAY; // Sunday, 53 columns back

const days = [];
for (let t = start; t <= today; t += DAY) days.push({ t, n: counts[iso(t)] || 0 });

// Stats
const total = days.reduce((a, d) => a + d.n, 0);
const active = days.filter((d) => d.n > 0).length;
let longest = 0, run = 0;
for (const d of days) { run = d.n ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].n) current++;
  else if (i === days.length - 1) continue; // an empty today doesn't break the streak yet
  else break;
}

// Levels from quartiles of active days, so one huge day doesn't wash out the rest
const sorted = days.filter((d) => d.n).map((d) => d.n).sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 1;
const cuts = [q(0.25), q(0.5), q(0.75)];
const level = (n) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);

const THEMES = {
  // GitHub's own contribution greens and box border, so the graph sits naturally on a profile page
  light: { text: '#59636e', strong: '#1f2328', border: '#d1d9e0', cells: ['#eff2f5', '#aceebb', '#4ac26b', '#2da44e', '#116329'] },
  dark: { text: '#9198a1', strong: '#f0f6fc', border: '#3d444d', cells: ['#151b23', '#033a16', '#196c2e', '#2ea043', '#56d364'] },
};
const CELL = 11, GAP = 3, STEP = CELL + GAP, PAD = 16, BOX = 40, LEFT = PAD + 30, TOP = BOX + 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cols = Math.ceil(days.length / 7);
const width = LEFT + cols * STEP + PAD;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const height = TOP + 7 * STEP + 40;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svg(theme) {
  const c = THEMES[theme];
  const out = [];
  let lastMonth = -1;
  days.forEach((d, i) => {
    const col = Math.floor(i / 7), row = new Date(d.t).getUTCDay();
    const x = LEFT + col * STEP, y = TOP + row * STEP;
    const m = new Date(d.t).getUTCMonth();
    if (row === 0 && m !== lastMonth && col < cols - 2 && !(col < 2 && new Date(d.t + 14 * DAY).getUTCMonth() !== m)) {
      out.push(`<text x="${x}" y="${TOP - 6}" class="t">${MONTHS[m]}</text>`);
      lastMonth = m;
    }
    out.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${c.cells[level(d.n)]}"><title>${d.n} contribution${d.n === 1 ? '' : 's'} on ${iso(d.t)}</title></rect>`);
  });
  ['Mon', 'Wed', 'Fri'].forEach((w, i) => out.push(`<text x="${PAD}" y="${TOP + (1 + i * 2) * STEP + 9}" class="t">${w}</text>`));
  const legendX = width - PAD - 5 * STEP - 60;
  const legendY = TOP + 7 * STEP + 14;
  out.push(`<text x="${legendX}" y="${legendY + 9}" class="t">Less</text>`);
  c.cells.forEach((fill, i) => out.push(`<rect x="${legendX + 28 + i * STEP}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"/>`));
  out.push(`<text x="${legendX + 28 + 5 * STEP + 2}" y="${legendY + 9}" class="t">More</text>`);
  out.push(`<text x="${LEFT}" y="${legendY + 9}" class="t">Updated ${iso(Date.now())} from gitlab.com/${esc(USER)}</text>`);

  const headline = `${total.toLocaleString('en-US')} contributions on GitLab in the last year`;
  const sub = `${plural(active, "active day")} · longest streak ${plural(longest, "day")} · current streak ${plural(current, "day")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(headline)}">
<style>.t{font:11px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;fill:${c.text}}.h{font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;fill:${c.strong}}</style>
<rect x="0.5" y="${BOX + 0.5}" width="${width - 1}" height="${height - BOX - 1}" rx="6" fill="none" stroke="${c.border}"/>
<text x="0" y="14" class="h">${esc(headline)}</text>
<text x="0" y="30" class="t">${esc(sub)}</text>
${out.join('\n')}
</svg>
`;
}

mkdirSync('assets', { recursive: true });
for (const theme of Object.keys(THEMES)) writeFileSync(`assets/gitlab-contributions-${theme}.svg`, svg(theme));
console.log(`${total} contributions, ${active} active days, longest ${longest}, current ${current}`);
