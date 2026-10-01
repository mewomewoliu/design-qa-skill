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
const list = (items, tag = 'ul') => (items && items.length ? `<${tag}>${items.map((i) => `<li>${md(i)}</li>`).join('')}</${tag}>` : '');
const pill = (r) => `<span class="pill r-${esc(r)}">${esc(RESULT_LABEL[r] || r || '—')}</span>`;
const chip = (text, cls = '') => (text ? `<span class="chip ${cls}">${esc(text)}</span>` : '');
const idLink = (id) => `<a class="idlink" href="#${esc(id)}">${esc(id)}</a>`;
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

let embeddedBytes = 0;
// PNG width/height from the IHDR chunk; other formats report null and keep the default cell.
const pngSize = (buf) => (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);
function dataUri(src, owner) {
  const p = path.resolve(runDir, src);
  if (!fs.existsSync(p)) { errors.push(`${owner}: visual not found: ${src}`); return null; }
  const buf = fs.readFileSync(p);
  embeddedBytes += buf.length;
  return { uri: `data:${MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'};base64,${buf.toString('base64')}`, size: pngSize(buf) };
}
function visual(v, owner) {
  const kind = v.kind || 'actual';
  const kindLabel = { actual: 'What happens', expected: 'What should happen', spec: 'Spec' }[kind] || kind;
  if (v.excerpt) {
    return `<figure class="vis vis-excerpt k-${esc(kind)}"><figcaption><span class="vk">${esc(kindLabel)}</span>${v.ref ? ` <code>${esc(v.ref)}</code>` : ''}</figcaption><blockquote>${md(v.excerpt)}</blockquote>${v.caption ? `<p class="cap">${md(v.caption)}</p>` : ''}</figure>`;
  }
  const img = v.src ? dataUri(v.src, owner) : null;
  const uri = img?.uri;
  // Landscape captures (desktop screens, cropped panels) span the gallery so callouts stay legible.
  const land = img?.size && img.size.w / img.size.h > 1.15 ? ' land' : '';
  if (!uri) return `<figure class="vis k-${esc(kind)} missing"><div class="ph">Image missing: ${esc(v.src || '?')}</div></figure>`;
  const anns = v.annotations || [];
  const boxes = anns.map((a, i) => `<span class="ann" style="left:${+a.x}%;top:${+a.y}%;width:${+a.w}%;height:${+a.h}%"><b>${i + 1}</b></span>`).join('');
  const legend = anns.length ? `<ol class="legend">${anns.map((a) => `<li>${md(a.label)}</li>`).join('')}</ol>` : '';
  return `<figure class="vis k-${esc(kind)}${land}"><figcaption><span class="vk">${esc(kindLabel)}</span></figcaption><button class="shot" type="button" aria-label="Enlarge: ${esc(v.caption || kindLabel)}"><img src="${uri}" alt="${esc(v.caption || kindLabel)}" loading="lazy">${boxes}</button>${v.caption ? `<p class="cap">${md(v.caption)}</p>` : ''}${legend}</figure>`;
}
const gallery = (vs, owner) => (vs && vs.length ? `<div class="gallery">${vs.map((v) => visual(v, owner)).join('')}</div>` : '');

function counts(layer) {
  const c = Object.fromEntries(RESULTS.map((r) => [r, 0]));
  for (const s of scenarios) if (s[layer]?.result in c) c[s[layer].result]++;
  return c;
}
function stackBar(c, label) {
  const segs = RESULTS.filter((r) => c[r]).map((r) => `<span class="seg r-${r}" style="flex:${c[r]}" title="${RESULT_LABEL[r]}: ${c[r]}"></span>`).join('');
  const keys = RESULTS.map((r) => `<span class="k"><i class="dot r-${r}"></i>${RESULT_LABEL[r]} <b>${c[r]}</b></span>`).join('');
  return `<div class="stat"><div class="stat-h">${esc(label)} <small>${scenarios.length} scenarios</small></div><div class="bar">${segs}</div><div class="keys">${keys}</div></div>`;
}

// ---------- sections ----------
const m = data.meta || {};
const v = data.verdict || {};
const dC = counts('design'), xC = counts('demo');
const failing = (s) => ['fail', 'partial'].includes(s.design?.result) || ['fail', 'partial'].includes(s.demo?.result);
const critFail = scenarios.filter((s) => s.importance === 'critical' && (s.design?.result === 'fail' || s.demo?.result === 'fail'));
const byP = Object.fromEntries(PRIORITIES.map((p) => [p, findings.filter((f) => f.priority === p).length]));
const hasChange = scenarios.some((s) => s.change);

const header = `
<header class="top">
  <div class="eyebrow">Design QA · ${esc(m.date || '')}${m.run && m.run !== m.date ? ` · ${esc(m.run)}` : ''}</div>
  <h1>${esc(m.feature || 'Untitled feature')}</h1>
  <p class="sub">${m.option ? `${esc(m.option)} · ` : ''}${esc(m.surface || '')}${(m.roles || []).length ? ` · ${esc(m.roles.join(', '))}` : ''}</p>
  <nav class="toc" aria-label="Sections"><a href="#verdict">Verdict</a><a href="#glance">Results</a><a href="#failed">What failed</a><a href="#actions">Next actions</a><a href="#scenarios">All scenarios</a><a href="#intent">Intent &amp; evidence</a><a href="#coverage">Coverage</a><a href="#open">Open questions</a></nav>
  <button class="theme" type="button" aria-label="Toggle light/dark">◐</button>
</header>`;

const verdict = `
<section id="verdict" class="verdict cj-${esc(v.core_job || 'unknown')}">
  <div class="v-badges">${chip(CORE_JOB[v.core_job] || CORE_JOB.unknown, 'cj')}${v.user_value ? chip(VALUE[v.user_value], `val val-${esc(v.user_value)}`) : ''}</div>
  <h2 class="headline">${md(v.headline || '')}</h2>
  <p class="summary">${md(v.summary || '')}</p>
  <div class="stats">
    ${stackBar(dC, 'Design coverage')}
    ${stackBar(xC, 'Demo behavior')}
    <div class="stat nums">
      <div><b class="n ${critFail.length ? 'bad' : ''}">${critFail.length}</b><span>critical scenarios failing</span></div>
      <div><b class="n">${byP.P1}</b><span>P1 · ${PRIORITY_LABEL.P1.toLowerCase()}</span></div>
      <div><b class="n">${byP.P2}</b><span>P2 · ${PRIORITY_LABEL.P2.toLowerCase()}</span></div>
      <div><b class="n">${byP.P3}</b><span>P3 · later</span></div>
    </div>
  </div>
  ${v.user_value_note ? `<p class="valnote"><strong>User value.</strong> ${md(v.user_value_note)}</p>` : ''}
</section>`;

const rows = scenarios.map((s) => `
  <tr data-kind="${esc(s.kind)}" data-imp="${esc(s.importance)}" data-failing="${failing(s)}">
    <td>${idLink(s.id)}</td>
    <td><div class="st">${md(s.title)}</div><div class="meta">${chip(KIND_LABEL[s.kind], `kind kind-${esc(s.kind)}`)}${s.lens ? chip(s.lens) : ''}${esc(s.role || '')}${s.assumption ? ' · <em>assumed situation</em>' : ''}</div></td>
    <td>${chip(s.importance, `imp imp-${esc(s.importance)}`)}</td>
    <td>${pill(s.design?.result)}</td>
    <td>${pill(s.demo?.result)}<div class="meta">${esc(METHODS[s.demo?.method] || '')}</div></td>
    <td>${(s.findings || []).map(idLink).join(' ') || '—'}</td>
    ${hasChange ? `<td>${s.change ? chip(s.change, `chg chg-${esc(s.change)}`) : ''}</td>` : ''}
  </tr>`).join('');

const glance = `
<section id="glance">
  <h2>Results at a glance</h2>
  <div class="filters" role="group" aria-label="Filter scenarios">
    <button type="button" data-filter="all" aria-pressed="true">All <b>${scenarios.length}</b></button>
    <button type="button" data-filter="failing" aria-pressed="false">Failing or partial <b>${scenarios.filter(failing).length}</b></button>
    <button type="button" data-filter="critical" aria-pressed="false">Critical <b>${scenarios.filter((s) => s.importance === 'critical').length}</b></button>
    <button type="button" data-filter="edge" aria-pressed="false">Edge cases <b>${scenarios.filter((s) => s.kind === 'edge' || s.kind === 'counterexample').length}</b></button>
  </div>
  <div class="tablewrap"><table class="matrix">
    <thead><tr><th>ID</th><th>Scenario</th><th>Importance</th><th>Design</th><th>Demo</th><th>Findings</th>${hasChange ? `<th>vs ${esc(m.previous_run || 'last run')}</th>` : ''}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="note">Design = do the specs support every success condition. Demo = did the prototype actually do it. Scenarios marked <em>assumed situation</em> are test constructions, not observed sessions.</p>
</section>`;

const findingCards = PRIORITIES.flatMap((p) => findings.filter((f) => f.priority === p)).map((f) => {
  const scenVis = (f.visuals || []).length ? f.visuals : (f.scenarios || []).flatMap((id) => scenarios.find((s) => s.id === id)?.visuals || []).slice(0, 3);
  const opts = (f.action?.options || []).length
    ? `<table class="opts"><thead><tr><th>Option</th><th>Trade-off</th></tr></thead><tbody>${f.action.options.map((o) => `<tr><td>${md(o.label)}</td><td>${md(o.tradeoff)}</td></tr>`).join('')}</tbody></table>`
    : '';
  return `
  <article class="finding p-${esc(f.priority)}" id="${esc(f.id)}">
    <header>
      <span class="prio">${esc(f.priority)}</span>
      <div>
        <h3><span class="fid">${esc(f.id)}</span> ${md(f.title)}</h3>
        <div class="meta">${chip(CATEGORIES[f.category] || f.category)}${chip(CONFIDENCE[f.confidence] || f.confidence)} Affects ${(f.scenarios || []).map(idLink).join(', ') || '—'}</div>
      </div>
    </header>
    <div class="ea">
      <div class="exp"><h4>Expected</h4><p>${md(f.expected)}</p></div>
      <div class="act"><h4>Actual</h4><p>${md(f.actual)}</p></div>
    </div>
    ${f.why ? `<p class="why"><strong>Why it matters.</strong> ${md(f.why)}</p>` : ''}
    ${gallery(scenVis, f.id)}
    <div class="action a-${esc(f.action?.type)}">
      <h4>${esc(ACTIONS[f.action?.type] || 'Action')}</h4>
      <p>${md(f.action?.recommendation)}</p>
      ${opts}
    </div>
    ${f.retest ? `<p class="retest"><strong>Retest.</strong> ${md(f.retest)}</p>` : ''}
  </article>`;
}).join('');

const passedNote = scenarios.filter((s) => !failing(s) && [s.design?.result, s.demo?.result].every((r) => r === 'pass')).map((s) => idLink(s.id)).join(', ');
const failed = `
<section id="failed">
  <h2>What failed, why, and what to do</h2>
  ${findings.length ? findingCards : '<p class="empty">No findings in this run.</p>'}
  ${passedNote ? `<p class="note">Passed in both layers: ${passedNote}.</p>` : ''}
</section>`;

const owners = { design: 'Design', engineering: 'Engineering', product: 'Product', research: 'Research', client: 'Client' };
const actions = `
<section id="actions">
  <h2>Next actions</h2>
  ${(data.next_actions || []).length ? `<div class="tablewrap"><table><thead><tr><th>Priority</th><th>Action</th><th>Owner</th><th>From</th></tr></thead><tbody>${data.next_actions.map((a) => `<tr><td><span class="prio sm p-${esc(a.priority)}">${esc(a.priority)}</span></td><td>${md(a.action)}</td><td>${esc(owners[a.owner] || a.owner || '')}</td><td>${a.finding ? idLink(a.finding) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">None recorded.</p>'}
</section>`;

const scenDetails = scenarios.map((s) => `
  <details class="scn" id="${esc(s.id)}" ${failing(s) ? 'open' : ''}>
    <summary><span class="sid">${esc(s.id)}</span><span class="st">${md(s.title)}</span><span class="pills">${pill(s.design?.result)}${pill(s.demo?.result)}</span></summary>
    <div class="scn-body">
      <div class="meta">${chip(KIND_LABEL[s.kind], `kind kind-${esc(s.kind)}`)}${chip(s.importance, `imp imp-${esc(s.importance)}`)}${s.lens ? chip(s.lens) : ''}${esc([s.role, s.persona, s.surface].filter(Boolean).join(' · '))}${(s.evidence || []).length ? ` · Evidence ${s.evidence.map(idLink).join(', ')}` : ''}</div>
      <dl class="tg"><div><dt>Trigger</dt><dd>${md(s.trigger)}${s.assumption ? ' <em>[assumption]</em>' : ''}</dd></div><div><dt>Goal</dt><dd>${md(s.goal)}</dd></div></dl>
      <div class="cols">
        <div>${(s.preconditions || []).length ? `<h4>Preconditions</h4>${list(s.preconditions)}` : ''}<h4>Steps</h4>${list(s.steps, 'ol')}</div>
        <div><h4>Success looks like</h4>${list(s.success)}</div>
      </div>
      <div class="layers">
        <div class="layer"><h4>Design ${pill(s.design?.result)}</h4><p>${md(s.design?.note)}</p>${s.design?.ref ? `<p class="ref"><code>${esc(s.design.ref)}</code></p>` : ''}</div>
        <div class="layer"><h4>Demo ${pill(s.demo?.result)} <small>${esc(METHODS[s.demo?.method] || '')}</small></h4><p>${md(s.demo?.note)}</p></div>
      </div>
      ${gallery(s.visuals, s.id)}
      ${(s.findings || []).length ? `<p class="meta">Findings: ${s.findings.map(idLink).join(', ')}</p>` : ''}
    </div>
  </details>`).join('');

const scenSection = `
<section id="scenarios">
  <h2>All scenarios</h2>
  <p class="note">Failing scenarios are expanded. <button type="button" class="linkbtn" data-expand>Expand all</button> · <button type="button" class="linkbtn" data-collapse>Collapse all</button></p>
  ${scenDetails}
</section>`;

const it = data.intent || {};
const intent = `
<section id="intent">
  <h2>Intent &amp; evidence</h2>
  ${it.outcome_chain ? `<p class="chain">${md(it.outcome_chain)}</p>` : ''}
  <dl class="intent">
    <div><dt>Source</dt><dd>${md(it.source)} ${it.status ? chip(it.status, it.status === 'reconstructed' ? 'warn' : '') : ''}</dd></div>
    ${it.problem ? `<div><dt>Problem</dt><dd>${md(it.problem)}</dd></div>` : ''}
    ${it.users ? `<div><dt>Users</dt><dd>${md(it.users)}</dd></div>` : ''}
    ${it.job ? `<div><dt>Job to be done</dt><dd>${md(it.job)}</dd></div>` : ''}
    ${(it.success || []).length ? `<div><dt>Success</dt><dd>${list(it.success)}</dd></div>` : ''}
    ${(it.out_of_scope || []).length ? `<div><dt>Out of scope</dt><dd>${list(it.out_of_scope)}</dd></div>` : ''}
  </dl>
  <details class="plain"><summary>Evidence register (${evidence.length})</summary>
  <div class="tablewrap"><table><thead><tr><th>ID</th><th>Type</th><th>Claim</th><th>Source</th><th>Limits</th></tr></thead><tbody>
  ${evidence.map((e) => `<tr id="${esc(e.id)}"><td>${esc(e.id)}</td><td>${chip(e.type, `ev ev-${esc(e.type)}`)}</td><td>${md(e.claim)}</td><td><code>${esc(e.source)}</code>${e.date ? `<div class="meta">${esc(e.date)}</div>` : ''}</td><td>${md(e.limits)}</td></tr>`).join('')}
  </tbody></table></div></details>
</section>`;

const covTable = (rowsIn, title) => (rowsIn && rowsIn.length ? `<h3>${title}</h3><div class="tablewrap"><table><thead><tr><th>Item</th><th>Scenarios</th><th>Status</th><th>Gap</th></tr></thead><tbody>${rowsIn.map((c) => `<tr><td>${md(c.item)}</td><td>${(c.scenarios || []).map(idLink).join(', ') || '—'}</td><td>${chip(c.status === 'na' ? 'N/A' : c.status, `cov cov-${esc(c.status)}`)}</td><td>${md(c.gap)}</td></tr>`).join('')}</tbody></table></div>` : '');
const cov = data.coverage || {};
const coverage = `
<section id="coverage">
  <h2>Coverage</h2>
  ${covTable(cov.requirements, 'Requirements and outcomes')}
  ${covTable(cov.constraints, 'Constraint checklist')}
  ${(cov.untested || []).length ? `<h3>Not tested in this run</h3>${list(cov.untested)}` : ''}
</section>`;

const open = `
<section id="open">
  <h2>Open questions</h2>
  ${(data.open_questions || []).length ? `<div class="tablewrap"><table><thead><tr><th>Question</th><th>Affects</th><th>What resolves it</th><th>Next</th></tr></thead><tbody>${data.open_questions.map((q) => `<tr><td>${md(q.question)}</td><td>${(q.scenarios || []).map(idLink).join(', ')}</td><td>${md(q.resolves)}</td><td>${md(q.next)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">None recorded.</p>'}
</section>`;

const footer = `
<footer class="foot">
  ${m.boundary ? `<p><strong>Boundary.</strong> ${md(m.boundary)}</p>` : ''}
  ${(m.reviewed || []).length ? `<p><strong>Reviewed.</strong></p><ul>${m.reviewed.map((r) => `<li>${md(r.label)}${r.ref ? ` — <code>${esc(r.ref)}</code>` : ''}${r.note ? ` <em>(${md(r.note)})</em>` : ''}</li>`).join('')}</ul>` : ''}
  ${m.demo ? `<p><strong>Demo.</strong> ${esc([m.demo.url, m.demo.build, m.demo.method].filter(Boolean).join(' · '))}</p>` : ''}
  <p class="meta">${esc(m.author || 'Design QA')} · generated ${new Date().toISOString().slice(0, 10)} from <code>results.json</code>. A design evaluation — not proof of production readiness, adoption or real-user comprehension.</p>
</footer>
<dialog class="lightbox" aria-label="Enlarged screenshot"><button type="button" class="close" aria-label="Close">×</button><div class="lb-body"></div></dialog>`;

const title = `${m.feature || 'Design'} QA`.slice(0, 60);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<main class="wrap">
${header}
${verdict}
${glance}
${failed}
${actions}
${scenSection}
${intent}
${coverage}
${open}
${footer}
</main>
<script>${js}</script>
</body>
</html>`;

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
    for (const run of fs.readdirSync(path.join(root, feat.name), { withFileTypes: true })) {
      const rp = path.join(root, feat.name, run.name, 'results.json');
      if (!run.isDirectory() || !fs.existsSync(rp)) continue;
      try {
        const d = JSON.parse(fs.readFileSync(rp, 'utf8'));
        const c = (layer) => RESULTS.map((r) => (d.scenarios || []).filter((s) => s[layer]?.result === r).length);
        runs.push({ feat: feat.name, run: run.name, d, design: c('design'), demo: c('demo') });
      } catch { /* skip unreadable */ }
    }
  }
  runs.sort((a, b) => a.feat.localeCompare(b.feat) || b.run.localeCompare(a.run));
  const mini = (arr) => `<span class="bar mini">${RESULTS.map((r, i) => (arr[i] ? `<span class="seg r-${r}" style="flex:${arr[i]}" title="${RESULT_LABEL[r]}: ${arr[i]}"></span>` : '')).join('')}</span>`;
  const body = runs.map((r) => `<tr><td><strong>${esc(r.d.meta?.feature || r.feat)}</strong><div class="meta">${esc(r.feat)}</div></td><td><a href="${esc(`${r.feat}/${r.run}/report.html`)}">${esc(r.run)}</a><div class="meta">${esc(r.d.meta?.option || '')}</div></td><td>${chip(CORE_JOB[r.d.verdict?.core_job] || CORE_JOB.unknown, `cj cj-${esc(r.d.verdict?.core_job || 'unknown')}`)}</td><td>${mini(r.design)}</td><td>${mini(r.demo)}</td><td>${(r.d.findings || []).filter((f) => f.priority === 'P1').length}</td></tr>`).join('');
  const idx = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design QA runs</title><style>${css}</style></head><body><main class="wrap"><header class="top"><div class="eyebrow">Design QA</div><h1>All runs</h1><p class="sub">${runs.length} run${runs.length === 1 ? '' : 's'} in <code>qa-tests/</code>. Rebuilt ${new Date().toISOString().slice(0, 10)}.</p><button class="theme" type="button" aria-label="Toggle light/dark">◐</button></header><section><div class="tablewrap"><table><thead><tr><th>Feature</th><th>Run</th><th>Verdict</th><th>Design</th><th>Demo</th><th>P1</th></tr></thead><tbody>${body}</tbody></table></div></section></main><script>${js}</script></body></html>`;
  fs.writeFileSync(path.join(root, 'index.html'), idx);
  console.log(`Rebuilt ${path.relative(process.cwd(), path.join(root, 'index.html'))} (${runs.length} runs)`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (embeddedBytes) console.log(`Embedded ${Math.round(embeddedBytes / 1024)} KB of visuals`);
process.exit(errors.length ? 1 : 0);
