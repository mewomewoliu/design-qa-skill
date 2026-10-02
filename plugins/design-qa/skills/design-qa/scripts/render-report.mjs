#!/usr/bin/env node
// Render a design-qa results.json into a self-contained report.html, and rebuild
// qa-tests/index.html. No dependencies — Node 18+.
//
//   node render-report.mjs <path/to/results.json> [--out report.html] [--no-index]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (!input) {
  console.error('Usage: node render-report.mjs <results.json> [--out report.html] [--no-index]');
  process.exit(2);
}
const outIdx = args.indexOf('--out');
const resultsPath = path.resolve(input);
const runDir = path.dirname(resultsPath);
const outPath = outIdx > -1 ? path.resolve(args[outIdx + 1]) : path.join(runDir, 'report.html');
const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const css = fs.readFileSync(path.join(here, '../assets/report.css'), 'utf8');
const js = fs.readFileSync(path.join(here, '../assets/report.js'), 'utf8');

// ---------- enums ----------
const RESULTS = ['pass', 'partial', 'fail', 'unknown', 'na'];
const RESULT_LABEL = { pass: 'Pass', partial: 'Partial', fail: 'Fail', unknown: 'Unknown', na: 'N/A' };
const KINDS = ['core', 'alternate', 'edge', 'counterexample'];
const KIND_LABEL = { core: 'Core', alternate: 'Alternate', edge: 'Edge case', counterexample: 'Counterexample' };
const IMPORTANCE = ['critical', 'major', 'minor'];
const PRIORITIES = ['P1', 'P2', 'P3'];
const PRIORITY_LABEL = { P1: 'Fix before build', P2: 'Fix before release', P3: 'Later / polish' };
const CATEGORIES = { design_gap: 'Design gap', mismatch: 'Demo/spec mismatch', demo_limitation: 'Demo limitation', evidence_gap: 'Evidence gap', new_ask: 'New implementation ask' };
const ACTIONS = { fix: 'Fix', decision: 'Decision needed', research: 'Research', dependency: 'Dependency' };
const CONFIDENCE = { observed: 'Observed in demo', static: 'Static evidence', hypothesis: 'Hypothesis' };
const METHODS = { executed: 'Executed', 'source-only': 'Source only', 'not-run': 'Not run' };
const CHANGES = ['new', 'fixed', 'regressed', 'unchanged', 'unverified'];
const CORE_JOB = { supported: 'Core job supported', partial: 'Core job partly supported', not_supported: 'Core job not supported', unknown: 'Core job unverified' };
const VALUE = { supported: 'Value supported by evidence', plausible: 'Value plausible, unvalidated', challenged: 'Value challenged by evidence' };
const COVER = ['covered', 'partial', 'gap', 'na'];

// ---------- validation ----------
const errors = [];
const warnings = [];
const scenarios = data.scenarios || [];
const findings = data.findings || [];
const evidence = data.evidence || [];
const ids = (list) => new Set(list.map((x) => x.id));
const eIds = ids(evidence), sIds = ids(scenarios), fIds = ids(findings);

function dupCheck(list, label) {
  const seen = new Set();
  for (const x of list) {
    if (!x.id) errors.push(`${label} without id: ${x.title || x.claim || '?'}`);
    else if (seen.has(x.id)) errors.push(`Duplicate ${label} id ${x.id}`);
    seen.add(x.id);
  }
}
dupCheck(evidence, 'evidence'); dupCheck(scenarios, 'scenario'); dupCheck(findings, 'finding');
const need = (cond, msg) => { if (!cond) errors.push(msg); };

for (const s of scenarios) {
  need(KINDS.includes(s.kind), `${s.id}: kind "${s.kind}" not one of ${KINDS.join('|')}`);
  need(IMPORTANCE.includes(s.importance), `${s.id}: importance "${s.importance}" not one of ${IMPORTANCE.join('|')}`);
  for (const layer of ['design', 'demo']) {
    need(s[layer] && RESULTS.includes(s[layer].result), `${s.id}: ${layer}.result missing or not one of ${RESULTS.join('|')}`);
  }
  if (s.demo?.method) need(METHODS[s.demo.method], `${s.id}: demo.method "${s.demo.method}" unknown`);
  if (s.change) need(CHANGES.includes(s.change), `${s.id}: change "${s.change}" unknown`);
  for (const e of s.evidence || []) need(eIds.has(e), `${s.id}: unknown evidence ${e}`);
  for (const f of s.findings || []) need(fIds.has(f), `${s.id}: unknown finding ${f}`);
  const bad = [s.design?.result, s.demo?.result].some((r) => r === 'fail' || r === 'partial');
  if (bad && !(s.findings || []).length) warnings.push(`${s.id}: failing/partial but linked to no finding`);
  if ([s.design?.result, s.demo?.result].includes('fail') && !(s.visuals || []).length && !findings.some((f) => (f.scenarios || []).includes(s.id) && (f.visuals || []).length))
    warnings.push(`${s.id}: fails but has no visual example`);
  if (s.demo?.result === 'pass' && s.demo?.method !== 'executed') warnings.push(`${s.id}: demo pass without executed method`);
}
for (const f of findings) {
  need(PRIORITIES.includes(f.priority), `${f.id}: priority "${f.priority}" not one of P1|P2|P3`);
  if (f.category) need(CATEGORIES[f.category], `${f.id}: category "${f.category}" unknown`);
  if (f.confidence) need(CONFIDENCE[f.confidence], `${f.id}: confidence "${f.confidence}" unknown`);
  need(f.action && ACTIONS[f.action.type], `${f.id}: action.type missing or unknown`);
  for (const s of f.scenarios || []) need(sIds.has(s), `${f.id}: unknown scenario ${s}`);
  if (!(f.scenarios || []).length) warnings.push(`${f.id}: linked to no scenario`);
  if (f.action?.type === 'decision' && (f.action.options || []).length < 3) warnings.push(`${f.id}: decision with fewer than three options`);
}
for (const c of [...(data.coverage?.requirements || []), ...(data.coverage?.constraints || [])]) {
  need(COVER.includes(c.status), `coverage "${c.item}": status "${c.status}" not one of ${COVER.join('|')}`);
  for (const s of c.scenarios || []) need(sIds.has(s), `coverage "${c.item}": unknown scenario ${s}`);
}
if (!scenarios.some((s) => s.kind === 'counterexample')) warnings.push('No counterexample scenario');

// Concise copy keeps the report scannable. Over-long fields are warnings, not errors.
const LIMITS = { headline: 140, key_point: 110, scenario_title: 70, finding_title: 90, expected: 180, actual: 180, recommendation: 220 };
const tooLong = (text, limit, where) => { if (text && String(text).length > limit) warnings.push(`${where}: ${String(text).length} chars — aim for ≤ ${limit}`); };
tooLong(data.verdict?.headline, LIMITS.headline, 'verdict.headline');
const keyPoints = data.verdict?.key_points || [];
if (!keyPoints.length) warnings.push('verdict.key_points missing — the overview falls back to the top finding titles');
if (keyPoints.length > 4) warnings.push(`verdict.key_points has ${keyPoints.length} items — keep it to 3–4`);
keyPoints.forEach((k, i) => tooLong(k, LIMITS.key_point, `verdict.key_points[${i}]`));
for (const s of scenarios) tooLong(s.title, LIMITS.scenario_title, `${s.id}.title`);
for (const f of findings) {
  tooLong(f.title, LIMITS.finding_title, `${f.id}.title`);
  tooLong(f.expected, LIMITS.expected, `${f.id}.expected`);
  tooLong(f.actual, LIMITS.actual, `${f.id}.actual`);
  tooLong(f.action?.recommendation, LIMITS.recommendation, `${f.id}.action.recommendation`);
}

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^(https?:|mailto:|#|\.{0,2}\/|[\w-]+(\/|\.|#))/i.test(u) && !/^\s*javascript:/i.test(u) ? u : '#');
function md(v) {
  let s = esc(v);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, l, u) => `<a href="${esc(safeUrl(u))}">${l}</a>`);
  return s;
}
const ICONS = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4m0 3h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  half: '<path d="M5 12h14"/>',
  q: '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4 8 8 0 1 0 20 14z"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.dot}</svg>`;
const RESULT_ICON = { pass: 'check', partial: 'half', fail: 'x', unknown: 'q', na: 'dot' };
const COVER_ICON = { covered: 'check', partial: 'half', gap: 'x', na: 'dot' };
const COVER_LABEL = { covered: 'Covered', partial: 'Partial', gap: 'Gap', na: 'N/A' };
const pill = (r) => `<span class="pill r-${esc(r || 'unknown')}">${icon(RESULT_ICON[r] || 'q')}${esc(RESULT_LABEL[r] || 'Unknown')}</span>`;
const idLink = (id) => `<a class="idlink" href="#${esc(id)}">${esc(id)}</a>`;
const idLinks = (arr) => ((arr || []).length ? `<span class="ids">${arr.map(idLink).join('')}</span>` : '');
// Turn finding and scenario IDs in short copy ("… (F01)") into jump links.
const linkIds = (html) => html.replace(/\b([FS]-?\d{1,3})\b/g, (id) => (fIds.has(id) || sIds.has(id) ? idLink(id) : id));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

let embeddedBytes = 0;
// PNG width/height from the IHDR chunk; other formats report null.
const pngSize = (buf) => (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);
const uriCache = new Map();
function dataUri(src, owner) {
  const p = path.resolve(runDir, src);
  if (uriCache.has(p)) return uriCache.get(p);
  if (!fs.existsSync(p)) { errors.push(`${owner}: visual not found: ${src}`); return null; }
  const buf = fs.readFileSync(p);
  embeddedBytes += buf.length;
  const out = { uri: `data:${MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'};base64,${buf.toString('base64')}`, size: pngSize(buf) };
  uriCache.set(p, out);
  return out;
}
const KIND_VIS = { actual: 'What happens', expected: 'What should happen', spec: 'Spec' };
function visual(v, owner, { legend = true } = {}) {
  const kind = v.kind || 'actual';
  const head = `<figcaption><i class="kd"></i>${esc(KIND_VIS[kind] || kind)}${v.ref ? ` · ${esc(v.ref)}` : ''}</figcaption>`;
  if (v.excerpt) return `<figure class="vis vis-excerpt k-${esc(kind)}">${head}<blockquote class="excerpt">${md(v.excerpt)}</blockquote>${v.caption ? `<p class="cap">${md(v.caption)}</p>` : ''}</figure>`;
  const img = v.src ? dataUri(v.src, owner) : null;
  if (!img) return `<figure class="vis k-${esc(kind)}"><div class="ph">Image missing: ${esc(v.src || '?')}</div></figure>`;
  const anns = v.annotations || [];
  const boxes = anns.map((a, i) => `<span class="ann" style="left:${+a.x}%;top:${+a.y}%;width:${+a.w}%;height:${+a.h}%"><b>${i + 1}</b></span>`).join('');
  const legendHtml = legend && anns.length ? `<ol class="legend">${anns.map((a) => `<li>${md(a.label)}</li>`).join('')}</ol>` : '';
  const alt = v.caption || KIND_VIS[kind] || 'Screenshot';
  return `<figure class="vis k-${esc(kind)}">${head}<div class="frame"><button class="shot" type="button" aria-label="Enlarge: ${esc(alt)}"><img src="${img.uri}" alt="${esc(alt)}" loading="lazy">${boxes}</button></div>${v.caption ? `<p class="cap">${md(v.caption)}</p>` : ''}${legendHtml}</figure>`;
}
const gallery = (vs, owner) => (vs && vs.length ? `<div class="gallery">${vs.map((x) => visual(x, owner, { legend: true })).join('')}</div>` : '');

function counts(layer) {
  const c = Object.fromEntries(RESULTS.map((r) => [r, 0]));
  for (const s of scenarios) if (s[layer]?.result in c) c[s[layer].result]++;
  return c;
}
const segs = (c, keys = RESULTS, cls = 'm') => keys.filter((r) => c[r]).map((r) => `<span class="seg ${cls}-${r}" style="flex:${c[r]}" title="${esc((RESULT_LABEL[r] || COVER_LABEL[r]))}: ${c[r]}"></span>`).join('');
const legendRow = (c, keys, labels, cls = 'm') => `<div class="legend-row">${keys.filter((r) => c[r]).map((r) => `<span><i class="dot ${cls}-${r}"></i>${esc(labels[r])} <b>${c[r]}</b></span>`).join('')}</div>`;
function barRow(c, label) {
  return `<div class="bar-row"><div class="bar-h">${esc(label)}<span>${c.pass}/${scenarios.length} pass</span></div><div class="bar" role="img" aria-label="${esc(label)}: ${RESULTS.filter((r) => c[r]).map((r) => `${c[r]} ${RESULT_LABEL[r]}`).join(', ')}">${segs(c)}</div>${legendRow(c, RESULTS, RESULT_LABEL)}</div>`;
}

// ---------- data ----------
const m = data.meta || {};
const v = data.verdict || {};
const dC = counts('design'), xC = counts('demo');
const failing = (s) => ['fail', 'partial'].includes(s.design?.result) || ['fail', 'partial'].includes(s.demo?.result);
const failingList = scenarios.filter(failing);
const critFail = scenarios.filter((s) => s.importance === 'critical' && (s.design?.result === 'fail' || s.demo?.result === 'fail'));
const byP = Object.fromEntries(PRIORITIES.map((p) => [p, findings.filter((f) => f.priority === p).length]));
const sortedFindings = PRIORITIES.flatMap((p) => findings.filter((f) => f.priority === p));
const owners = { design: 'Design', engineering: 'Engineering', product: 'Product', research: 'Research', client: 'Client' };
const it = data.intent || {};
const cov = data.coverage || {};
const nextActions = data.next_actions || [];
const openQs = data.open_questions || [];

// ---------- sidebar ----------
const NAV = [
  ['overview', 'Overview', 'home', null],
  ['failed', 'What failed', 'alert', findings.length, findings.some((f) => f.priority === 'P1')],
  ['actions', 'Next actions', 'todo', nextActions.length],
  ['scenarios', 'Scenarios', 'list', scenarios.length],
  ['coverage', 'Coverage', 'grid', null],
  ['intent', 'Intent', 'target', null],
  ['open', 'Open questions', 'help', openQs.length],
  ['run', 'Run details', 'info', null],
];
const sidebar = `
<aside class="side" aria-label="Report navigation">
  <div class="brand">
    <div class="eyebrow">Design QA · ${esc(m.date || '')}</div>
    <div class="name">${esc(m.feature || 'Untitled feature')}</div>
    <span class="verdict-mini cj cj-${esc(v.core_job || 'unknown')}">${esc(CORE_JOB[v.core_job] || CORE_JOB.unknown)}</span>
  </div>
  <nav class="nav" aria-label="Sections">
    ${NAV.map(([id, label, ic, n, bad]) => `<a href="#${id}" aria-current="${id === 'overview'}">${icon(ic)}<span>${label}</span>${n != null ? `<span class="count${bad ? ' bad' : ''}">${n}</span>` : ''}</a>`).join('')}
  </nav>
  <div class="side-foot">
    <button class="theme" type="button" aria-pressed="false" aria-label="Dark theme">${icon('moon')}<span>Dark theme</span></button>
    <small>${esc(m.run || m.date || '')}</small>
  </div>
</aside>`;

// ---------- overview ----------
const points = keyPoints.length
  ? keyPoints.map((k) => `<li><span class="bullet">${icon('arrow')}</span><span>${linkIds(md(k))}</span></li>`).join('')
  : sortedFindings.slice(0, 3).map((f) => `<li><span class="prio p-${esc(f.priority)}">${esc(f.priority)}</span><a href="#${esc(f.id)}">${md(f.title)}</a></li>`).join('');
const kindCount = (k) => scenarios.filter((s) => s.kind === k).length;
const tile = (label, num, sub, tone) => `<div class="tile" style="--tone:var(--${tone})"><span class="t-label">${esc(label)}</span><span class="t-num">${num}</span><span class="t-sub">${sub}</span></div>`;
const cell = (s) => {
  const half = (layer) => `<span class="m-${esc(s[layer]?.result || 'unknown')}" title="${layer === 'design' ? 'Design' : 'Demo'}: ${esc(RESULT_LABEL[s[layer]?.result] || 'Unknown')}">${icon(RESULT_ICON[s[layer]?.result] || 'q')}</span>`;
  return `<a class="cell" href="#${esc(s.id)}" title="${esc(s.id)} · ${esc(s.title)}"><span class="cid">${esc(s.id)}${s.importance === 'critical' ? '<span class="crit" aria-label="critical">!</span>' : ''}</span><span class="halves">${half('design')}${half('demo')}</span></a>`;
};
const overview = `
<section id="overview">
  <div class="hero">
    <div class="eyebrow">Design QA · ${esc(m.date || '')}${m.run && m.run !== m.date ? ` · ${esc(m.run)}` : ''}</div>
    <h1${String(m.feature || '').length > 42 ? ' class="long"' : ''}>${esc(m.feature || 'Untitled feature')}</h1>
    <div class="tags">${m.option ? `<span class="tag">${md(m.option)}</span>` : ''}${m.surface ? `<span class="tag">${esc(m.surface)}</span>` : ''}${(m.roles || []).map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div>
  </div>
  <div class="card verdict">
    <div class="badges"><span class="cj cj-${esc(v.core_job || 'unknown')}">${esc(CORE_JOB[v.core_job] || CORE_JOB.unknown)}</span>${v.user_value ? `<span class="cj val val-${esc(v.user_value)}">${esc(VALUE[v.user_value])}</span>` : ''}</div>
    <p class="headline">${md(v.headline || '')}</p>
    ${points ? `<ul class="points">${points}</ul>` : ''}
    ${v.summary || v.user_value_note ? `<details class="more"><summary>${icon('chevron')}Full summary</summary><div class="more-body">${v.summary ? `<p>${md(v.summary)}</p>` : ''}${v.user_value_note ? `<p><strong>User value.</strong> ${md(v.user_value_note)}</p>` : ''}</div></details>` : ''}
  </div>
  <div class="tiles">
    ${tile('Scenarios tested', scenarios.length, `${kindCount('core')} core · ${kindCount('edge') + kindCount('counterexample')} edge · ${kindCount('alternate')} alt`, 'sky')}
    ${tile('Failing or partial', failingList.length, failingList.length ? `in design or demo` : 'all pass or unverified', failingList.length ? 'peach' : 'mint')}
    ${tile('Critical failing', critFail.length, critFail.length ? critFail.map((s) => esc(s.id)).join(' · ') : 'none', critFail.length ? 'peach' : 'mint')}
    ${tile('Fix before build', byP.P1, `P1 · plus ${byP.P2} P2 · ${byP.P3} P3`, byP.P1 ? 'lemon' : 'mint')}
  </div>
  <div class="two">
    <div class="card bars">${barRow(dC, 'Design spec')}${barRow(xC, 'Demo behavior')}</div>
    <div class="card">
      <div class="map-h"><h3>Every scenario at a glance</h3><span>left = design · right = demo</span></div>
      <div class="map">${scenarios.map(cell).join('')}</div>
      <div class="map-key"><span>${icon('check')} pass · ${icon('half')} partial · ${icon('x')} fail · ? unknown</span><span><b class="crit" style="color:var(--fail-m)">!</b> critical</span></div>
    </div>
  </div>
</section>`;

// ---------- what failed ----------
// ---------- Claude Code prompt per finding ----------
// Plain text a developer can paste into Claude Code: context, problem, fix, done-when.
const plain = (v) => String(v ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)').trim();
const ACTION_ASK = {
  fix: 'What to fix',
  decision: 'Decision needed first',
  research: 'Evidence needed first (not a code change yet)',
  dependency: 'Blocked on a dependency',
};
function claudePrompt(f) {
  const scns = (f.scenarios || []).map((id) => scenarios.find((s) => s.id === id)).filter(Boolean);
  // A scenario ref is often "file.md — section"; give it the full path from meta.reviewed.
  const reviewed = (m.reviewed || []).map((r) => plain(r.ref)).filter(Boolean);
  const withPath = (ref) => {
    const mm = ref.match(/^([^\s/—§]+\.\w+)\s*(?:[—§:-]\s*)?(.*)$/);
    const full = mm && reviewed.find((r) => r.split(/[,;]\s*/).some((x) => x.endsWith(`/${mm[1]}`)));
    return full ? `${full.split(/[,;]\s*/).find((x) => x.endsWith(`/${mm[1]}`))}${mm[2] ? ` (${mm[2]})` : ''}` : ref;
  };
  // Refs that are only evidence IDs ("E09, E13") point at their sources instead.
  const expand = (ref) => (/^(E\d+[,\s]*)+$/.test(ref) ? ref.match(/E\d+/g).map((id) => plain(evidence.find((e) => e.id === id)?.source || id)) : [ref]);
  const files = [...new Set([...scns.map((s) => s.design?.ref).filter(Boolean).flatMap((r) => expand(plain(r))).map(withPath), ...reviewed])]
    .filter((x, _, all) => !all.some((y) => y !== x && y.startsWith(`${x} (`)))
    .slice(0, 6);
  const L = [];
  L.push(`Design QA finding ${f.id} (${f.priority} · ${PRIORITY_LABEL[f.priority] || ''}) — ${plain(m.feature)}${m.surface ? `, ${plain(m.surface)}` : ''}${(m.roles || []).length ? `, for ${m.roles.map(plain).join(' / ')}` : ''}.`);
  L.push('', `Problem: ${plain(f.title)}`);
  if (f.expected) L.push(`Expected: ${plain(f.expected)}`);
  if (f.actual) L.push(`Actual: ${plain(f.actual)}`);
  if (f.why) L.push(`Why it matters: ${plain(f.why)}`);
  if (scns.length) {
    L.push('', 'Where it shows up:');
    for (const s of scns.slice(0, 3)) L.push(`- ${s.id} ${plain(s.title)}${(s.steps || []).length ? ` — ${s.steps.map(plain).join(' → ')}` : ''}`);
  }
  if (files.length) L.push('', `Context to read first: ${files.join('; ')}`);
  if (m.demo?.url) L.push(`Demo: ${plain(m.demo.url)}`);
  L.push('', `${ACTION_ASK[f.action?.type] || 'What to do'}: ${plain(f.action?.recommendation)}`);
  if ((f.action?.options || []).length) {
    L.push('Options:');
    for (const o of f.action.options) L.push(`- ${plain(o.label)}${o.tradeoff ? ` (trade-off: ${plain(o.tradeoff)})` : ''}`);
  }
  if (f.action?.type === 'decision') L.push('Don\'t choose an option yourself — ask me which one to implement, then plan it.');
  if (f.action?.type === 'research' || f.action?.type === 'dependency') L.push('Don\'t change code for this yet — tell me what you find and what it unblocks.');
  if (f.retest) L.push('', `Done when: ${plain(f.retest)}`);
  L.push('', 'Keep the change scoped to this finding. Reuse existing components and design tokens, name anything new, and don\'t edit unrelated files. Read the context before changing anything.');
  return L.join('\n');
}
const splitOpt = (label) => { const mm = String(label || '').match(/^([A-Z0-9]{1,2})\s*[—–:-]\s*(.+)$/s); return mm ? [mm[1], mm[2]] : ['•', label]; };
const findingCard = (f) => {
  const vis = (f.visuals || []).length ? f.visuals : (f.scenarios || []).flatMap((id) => scenarios.find((s) => s.id === id)?.visuals || []);
  const imgs = vis.filter((x) => x.src);
  const lead = imgs[0] || vis[0];
  const rest = vis.filter((x) => x !== lead).slice(0, 3);
  const opts = (f.action?.options || []).length ? `<div class="opts">${f.action.options.map((o) => { const [k, t] = splitOpt(o.label); return `<div class="opt"><div class="ol"><span>${esc(k)}</span>${md(t)}</div>${o.tradeoff ? `<p>${md(o.tradeoff)}</p>` : ''}</div>`; }).join('')}</div>` : '';
  const more = [f.why && `<p><strong>Why it matters.</strong> ${md(f.why)}</p>`, f.retest && `<p><strong>Retest.</strong> ${md(f.retest)}</p>`].filter(Boolean).join('');
  return `
  <article class="finding${lead ? '' : ' no-vis'}" id="${esc(f.id)}">
    <div>
      <div class="f-head"><span class="prio p-${esc(f.priority)}">${esc(f.priority)}</span><h3><span class="fid">${esc(f.id)}</span>${md(f.title)}</h3><button class="copy-cc" type="button" data-copy="cc-${esc(f.id)}" title="Copy this issue as a prompt for Claude Code">${icon('copy')}<span>Copy for Claude Code</span></button></div>
      <textarea class="cc-prompt" id="cc-${esc(f.id)}" hidden readonly aria-hidden="true">${esc(claudePrompt(f))}</textarea>
      <div class="f-meta">${esc(PRIORITY_LABEL[f.priority] || '')}${f.category ? ` · ${esc(CATEGORIES[f.category] || f.category)}` : ''}${f.confidence ? ` · ${esc(CONFIDENCE[f.confidence] || f.confidence)}` : ''} ${idLinks(f.scenarios)}</div>
      <div class="ea">
        <div><div class="eh"><span class="mk r-pass">${icon('check')}</span>Should</div>${md(f.expected)}</div>
        <div><div class="eh"><span class="mk r-fail">${icon('x')}</span>Does</div>${md(f.actual)}</div>
      </div>
      <div class="do"><b>${esc(ACTIONS[f.action?.type] || 'Do')}</b><span>${md(f.action?.recommendation)}</span></div>
      ${opts}
      ${more ? `<details class="more"><summary>${icon('chevron')}Why it matters &amp; retest</summary><div class="more-body">${more}</div></details>` : ''}
    </div>
    ${lead ? `<div class="f-vis">${visual(lead, f.id)}${rest.length ? `<div class="thumbs">${rest.map((x) => visual(x, f.id, { legend: false })).join('')}</div>` : ''}</div>` : ''}
  </article>`;
};
const failed = `
<section id="failed">
  <div class="sec-h"><h2>What failed</h2><span>${plural(findings.length, 'finding')} · ${byP.P1} P1 · ${byP.P2} P2 · ${byP.P3} P3</span></div>
  ${findings.length ? sortedFindings.map(findingCard).join('') : `<div class="empty good">${icon('check')}Nothing failed in this run.</div>`}
</section>`;

// ---------- next actions ----------
const actions = `
<section id="actions">
  <div class="sec-h"><h2>Next actions</h2><span>${plural(nextActions.length, 'action')}</span></div>
  ${nextActions.length ? `<div class="rows">${PRIORITIES.flatMap((p) => nextActions.filter((a) => a.priority === p)).concat(nextActions.filter((a) => !PRIORITIES.includes(a.priority))).map((a) => `<div class="row"><span class="prio p-${esc(a.priority)}">${esc(a.priority || '—')}</span><span>${md(a.action)}</span><span class="owner">${a.owner ? `<span class="tag">${esc(owners[a.owner] || a.owner)}</span>` : ''}${a.finding ? idLink(a.finding) : ''}</span></div>`).join('')}</div>` : '<p class="empty">None recorded.</p>'}
</section>`;

// ---------- scenarios ----------
const scnRow = (s) => {
  const tags = [esc(KIND_LABEL[s.kind] || s.kind), s.importance === 'critical' ? '<span class="crit">critical</span>' : esc(s.importance), s.lens && esc(s.lens), s.role && esc(s.role), s.change && `<span class="chg-${esc(s.change)}">${esc(s.change)}</span>`, s.assumption && 'assumed situation'].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
  const layer = (name, r) => `<div class="layer"><div class="lh">${name} ${pill(r?.result)}${r?.method ? `<small>${esc(METHODS[r.method] || r.method)}</small>` : ''}</div>${r?.note ? `<p>${md(r.note)}</p>` : ''}${r?.ref ? `<p class="ref"><code>${esc(r.ref)}</code></p>` : ''}</div>`;
  return `
  <details class="scn" id="${esc(s.id)}" data-kind="${esc(s.kind)}" data-imp="${esc(s.importance)}" data-failing="${failing(s)}">
    <summary>
      <span class="sid">${esc(s.id)}</span>
      <span class="s-main"><span class="s-title">${md(s.title)}</span><span class="s-tags">${tags}</span></span>
      <span class="lays"><span class="lay-d">${pill(s.design?.result)}</span><span class="lay-x">${pill(s.demo?.result)}</span></span>
      <span class="chev">${icon('chevron')}</span>
    </summary>
    <div class="scn-body">
      ${s.trigger || s.goal ? `<div class="situ"><div><span class="label">When</span>${md(s.trigger)}${s.assumption ? ' <em class="muted">[assumption]</em>' : ''}</div><div class="arrow">${icon('arrow')}</div><div><span class="label">They want to</span>${md(s.goal)}</div></div>` : ''}
      <div class="layers">${layer('Design', s.design)}${layer('Demo', s.demo)}</div>
      <div class="cols">
        <div><span class="label">Steps</span>${(s.preconditions || []).length ? `<p class="pre">Given: ${s.preconditions.map(md).join(' · ')}</p>` : ''}${(s.steps || []).length ? `<ol class="steps">${s.steps.map((x) => `<li><span>${md(x)}</span></li>`).join('')}</ol>` : ''}</div>
        <div><span class="label">Passes if</span>${(s.success || []).length ? `<ul class="checks">${s.success.map((x) => `<li>${icon('todo')}<span>${md(x)}</span></li>`).join('')}</ul>` : ''}</div>
      </div>
      ${gallery(s.visuals, s.id)}
      ${(s.findings || []).length || (s.evidence || []).length ? `<div class="s-foot">${(s.findings || []).length ? `Findings ${idLinks(s.findings)}` : ''}${(s.evidence || []).length ? ` · Evidence ${idLinks(s.evidence)}` : ''}${s.persona ? ` · ${esc(s.persona)}` : ''}</div>` : ''}
    </div>
  </details>`;
};
const scenSection = `
<section id="scenarios">
  <div class="sec-h"><h2>Scenarios</h2><span>${dC.pass} design pass · ${xC.pass} demo pass · of ${scenarios.length}</span></div>
  <div class="filters" role="group" aria-label="Filter scenarios">
    <button type="button" data-filter="all" aria-pressed="true">All <b>${scenarios.length}</b></button>
    <button type="button" data-filter="failing" aria-pressed="false">Failing <b>${failingList.length}</b></button>
    <button type="button" data-filter="critical" aria-pressed="false">Critical <b>${scenarios.filter((s) => s.importance === 'critical').length}</b></button>
    <button type="button" data-filter="edge" aria-pressed="false">Edge cases <b>${scenarios.filter((s) => s.kind === 'edge' || s.kind === 'counterexample').length}</b></button>
    <span class="sp"></span>
    <button type="button" class="linkbtn" data-expand>Expand all</button><button type="button" class="linkbtn" data-collapse>Collapse</button>
  </div>
  <div class="scn-list">
    <div class="scn-cols" aria-hidden="true"><span>ID</span><span>Scenario</span><span>Design</span><span>Demo</span><span></span></div>
    ${scenarios.map(scnRow).join('')}
  </div>
</section>`;

// ---------- coverage ----------
const covCard = (rowsIn, title) => {
  if (!(rowsIn || []).length) return '';
  const c = Object.fromEntries(COVER.map((k) => [k, rowsIn.filter((r) => r.status === k).length]));
  const order = (r) => ({ gap: 0, partial: 1, covered: 2, na: 3 }[r.status] ?? 4);
  return `<div class="cov-card"><h3>${esc(title)}<span>${c.covered}/${rowsIn.length} covered</span></h3>
    <div class="bar">${COVER.filter((k) => c[k]).map((k) => `<span class="seg m-${k === 'covered' ? 'pass' : k === 'gap' ? 'fail' : k}" style="flex:${c[k]}" title="${COVER_LABEL[k]}: ${c[k]}"></span>`).join('')}</div>
    <div class="legend-row">${COVER.filter((k) => c[k]).map((k) => `<span><i class="dot m-${k === 'covered' ? 'pass' : k === 'gap' ? 'fail' : k}"></i>${COVER_LABEL[k]} <b>${c[k]}</b></span>`).join('')}</div>
    <ul class="cov-list">${[...rowsIn].sort((a, b) => order(a) - order(b)).map((r) => `<li><span class="ci c-${esc(r.status)}" title="${esc(COVER_LABEL[r.status] || r.status)}">${icon(COVER_ICON[r.status] || 'q')}</span><div><div>${md(r.item)}</div>${r.gap ? `<div class="gap">${md(r.gap)}</div>` : ''}${idLinks(r.scenarios)}</div></li>`).join('')}</ul></div>`;
};
const coverage = `
<section id="coverage">
  <div class="sec-h"><h2>Coverage</h2><span>gaps listed first</span></div>
  <div class="cov-grid">${covCard(cov.requirements, 'Requirements & outcomes')}${covCard(cov.constraints, 'Constraint checklist')}</div>
  ${(cov.untested || []).length ? `<div class="card untested"><span class="label">Not tested in this run</span><ul>${cov.untested.map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>` : ''}
</section>`;

// ---------- intent ----------
const TONES = ['sky', 'lilac', 'lemon', 'mint'];
const CHAIN_LABELS = ['Situation', 'Job', 'Success', 'Benefit'];
const chainParts = String(it.outcome_chain || '').split(/\s*(?:→|->)\s*/).filter(Boolean);
const chain = chainParts.length > 1
  ? `<div class="chain">${chainParts.map((p, i) => `${i ? `<span class="arr">${icon('arrow')}</span>` : ''}<div class="step" style="--tone:var(--${TONES[i % TONES.length]})"><small>${esc(chainParts.length === 4 ? CHAIN_LABELS[i] : `Step ${i + 1}`)}</small>${md(p)}</div>`).join('')}</div>`
  : it.outcome_chain ? `<div class="card">${md(it.outcome_chain)}</div>` : '';
const intent = `
<section id="intent">
  <div class="sec-h"><h2>Intent</h2><span>${esc(it.status || '')}</span></div>
  ${chain}
  ${it.problem || it.users || it.job ? `<div class="trio">${[['Problem', it.problem], ['Users', it.users], ['Job to be done', it.job]].filter(([, x]) => x).map(([l, x]) => `<div class="card"><span class="label">${l}</span>${md(x)}</div>`).join('')}</div>` : ''}
  ${(it.success || []).length || (it.out_of_scope || []).length ? `<div class="duo">${(it.success || []).length ? `<div class="card"><span class="label">Success looks like</span><ul class="crit-list">${it.success.map((x) => `<li>${icon('todo')}<span>${md(x)}</span></li>`).join('')}</ul></div>` : ''}${(it.out_of_scope || []).length ? `<div class="card"><span class="label">Out of scope</span><ul class="crit-list">${it.out_of_scope.map((x) => `<li>${icon('x')}<span>${md(x)}</span></li>`).join('')}</ul></div>` : ''}</div>` : ''}
  <div class="src-line">Source: ${md(it.source)}${it.status === 'reconstructed' ? ' <span class="tag">reconstructed — [assumption]</span>' : ''}</div>
  ${evidence.length ? `<details class="more"><summary>${icon('chevron')}Evidence register (${evidence.length})</summary>
  <div class="tablewrap"><table><thead><tr><th>ID</th><th>Type</th><th>Claim</th><th>Source</th><th>Limits</th></tr></thead><tbody>
  ${evidence.map((e) => `<tr id="${esc(e.id)}"><td><span class="idlink">${esc(e.id)}</span></td><td><span class="tag">${esc(e.type)}</span></td><td>${md(e.claim)}</td><td><code>${esc(e.source)}</code>${e.date ? `<div class="muted">${esc(e.date)}</div>` : ''}</td><td class="muted">${md(e.limits)}</td></tr>`).join('')}
  </tbody></table></div></details>` : ''}
</section>`;

// ---------- open questions ----------
const open = `
<section id="open">
  <div class="sec-h"><h2>Open questions</h2><span>${plural(openQs.length, 'question')}</span></div>
  ${openQs.length ? `<div class="qs">${openQs.map((q) => `<div class="q"><p class="qq">${md(String(q.question || '').replace(/^\*\*\[open\]\*\*\s*/i, ''))}</p><dl>${q.resolves ? `<div><dt>Who settles</dt><dd>${md(q.resolves)}</dd></div>` : ''}${q.next ? `<div><dt>Next</dt><dd>${md(q.next)}</dd></div>` : ''}</dl>${idLinks(q.scenarios)}</div>`).join('')}</div>` : '<p class="empty">None recorded.</p>'}
</section>`;

// ---------- run details ----------
const run = `
<section id="run" class="run">
  <div class="sec-h"><h2>Run details</h2><span>${esc(m.author || 'Design QA')}</span></div>
  <div class="card"><dl>
    ${m.boundary ? `<div><dt>Scope</dt><dd>${md(m.boundary)}</dd></div>` : ''}
    ${(m.reviewed || []).length ? `<div><dt>Reviewed</dt><dd><ul>${m.reviewed.map((r) => `<li>${md(r.label)}${r.ref ? ` — <code>${esc(r.ref)}</code>` : ''}${r.note ? ` <span class="muted">(${md(r.note)})</span>` : ''}</li>`).join('')}</ul></dd></div>` : ''}
    ${m.demo ? `<div><dt>Demo</dt><dd>${md([m.demo.url, m.demo.build, m.demo.method].filter(Boolean).join(' · '))}</dd></div>` : ''}
    ${m.previous_run ? `<div><dt>Previous run</dt><dd><code>${esc(m.previous_run)}</code></dd></div>` : ''}
  </dl></div>
  <p class="disclaimer">${icon('info')}<span>Generated ${new Date().toISOString().slice(0, 10)} from results.json. A design evaluation — not proof of production readiness, adoption or real-user comprehension.</span></p>
</section>
<dialog class="lightbox" aria-label="Enlarged screenshot"><button type="button" class="close" aria-label="Close">×</button><div class="lb-body"></div></dialog>`;

// ---------- page ----------
const fontPath = path.join(here, '../assets/BarlowCondensed-SemiBold.ttf');
const fontFace = fs.existsSync(fontPath)
  ? `@font-face{font-family:"Studio Condensed";src:url(data:font/ttf;base64,${fs.readFileSync(fontPath).toString('base64')}) format("truetype");font-weight:600;font-style:normal;font-display:swap}\n`
  : '';
const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${fontFace}${css}</style>
</head>
<body>
${body}
<script>${js}</script>
</body>
</html>`;

const html = page(`${m.feature || 'Design'} QA`.slice(0, 60), `<div class="shell">
${sidebar}
<main class="main" id="main">
${overview}
${failed}
${actions}
${scenSection}
${coverage}
${intent}
${open}
${run}
</main>
</div>`);

fs.writeFileSync(outPath, html);
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${kb} KB, ${scenarios.length} scenarios, ${findings.length} findings)`);
if (fs.statSync(outPath).size > 15 * 1024 * 1024) warnings.push(`report is ${kb} KB — over 15 MB; compress screenshots (e.g. JPEG, 1x scale)`);

// ---------- index ----------
if (!args.includes('--no-index')) {
  let qaRoot = runDir;
  while (qaRoot !== path.dirname(qaRoot) && path.basename(qaRoot) !== 'qa-tests') qaRoot = path.dirname(qaRoot);
  if (path.basename(qaRoot) === 'qa-tests') writeIndex(qaRoot);
  else warnings.push('results.json is not under a qa-tests/ folder — index not rebuilt');
}

function writeIndex(root) {
  const runs = [];
  for (const feat of fs.readdirSync(root, { withFileTypes: true })) {
    if (!feat.isDirectory()) continue;
    for (const r of fs.readdirSync(path.join(root, feat.name), { withFileTypes: true })) {
      const rp = path.join(root, feat.name, r.name, 'results.json');
      if (!r.isDirectory() || !fs.existsSync(rp)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(rp, 'utf8'));
        const c = (layer) => Object.fromEntries(RESULTS.map((x) => [x, (d.scenarios || []).filter((s) => s[layer]?.result === x).length]));
        runs.push({ feat: feat.name, run: r.name, d, design: c('design'), demo: c('demo') });
      } catch { /* skip unreadable */ }
    }
  }
  runs.sort((a, b) => a.feat.localeCompare(b.feat) || b.run.localeCompare(a.run));
  const mini = (c, label) => `<span>${label}<span class="bar mini">${segs(c)}</span></span>`;
  const body = runs.map((r) => {
    const p1 = (r.d.findings || []).filter((f) => f.priority === 'P1').length;
    return `<a class="run-row" href="${esc(`${r.feat}/${r.run}/report.html`)}"><span><b>${esc(r.d.meta?.feature || r.feat)}</b><small>${esc(r.feat)}</small></span><span class="hide-sm"><small>${esc(r.run)}</small></span><span class="cj cj-${esc(r.d.verdict?.core_job || 'unknown')}">${esc(CORE_JOB[r.d.verdict?.core_job] || CORE_JOB.unknown)}</span><span class="bar-stack hide-sm">${mini(r.design, 'Design')}${mini(r.demo, 'Demo&nbsp;&nbsp;')}</span><span class="prio ${p1 ? 'p-P1' : ''}" title="P1 findings">${p1}</span></a>`;
  }).join('');
  const idx = page('Design QA runs', `<main class="index-main"><div class="index-top"><div><div class="eyebrow">Design QA · qa-tests/</div><h1>All runs</h1><p>${plural(runs.length, 'run')}. Rebuilt ${new Date().toISOString().slice(0, 10)}.</p></div><button class="theme icon-btn" type="button" aria-pressed="false" aria-label="Dark theme">${icon('moon')}<span>Dark theme</span></button></div><div class="rows">${body || '<p class="empty">No runs yet.</p>'}</div></main>`);
  fs.writeFileSync(path.join(root, 'index.html'), idx);
  console.log(`Rebuilt ${path.relative(process.cwd(), path.join(root, 'index.html'))} (${runs.length} runs)`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (embeddedBytes) console.log(`Embedded ${Math.round(embeddedBytes / 1024)} KB of visuals`);
process.exit(errors.length ? 1 : 0);
