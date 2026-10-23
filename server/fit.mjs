// Weekly price update. Reads the last 7 days of app records from Supabase, fits new base
// prices, tests old vs new prices on the newest deals, and writes server/prices.json only
// when the new prices predict those deals better.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (the secret/service_role key, never put it in the app)
// Options: --days 7   --min-test 8   --dry-run
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? Number(process.argv[i + 1]) : d; };
const DAYS = arg('days', 7);
const MIN_TEST = arg('min-test', Number(process.env.MIN_TEST) || 8);  // deals needed to judge old vs new prices
const DRY = process.argv.includes('--dry-run');

const K = 10;            // weight of the current price when blending, counted as K records
const MIN_N = 3;         // records a model needs before its price may move
const MAX_STEP = 0.15;   // a price moves at most 15% per week
const ASK_FACTOR = 0.95; // asking prices are discounted to approximate sale prices
const ASK_WEIGHT = 0.5;  // and count half as much as a real deal
const TEST_SHARE = 0.2;  // newest 20% of deals are held back for the test

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY'); process.exit(1); }

const pricesPath = path.join(here, 'prices.json');
const current = JSON.parse(fs.readFileSync(pricesPath, 'utf8'));
const report = [];
const say = s => { report.push(s); console.log(s); };

async function fetchRecords() {
  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  const headers = { apikey: KEY };
  if (/^eyJ/.test(KEY)) headers.Authorization = 'Bearer ' + KEY;
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const q = `${URL_}/rest/v1/records?select=*&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=1000&offset=${off}`;
    const res = await fetch(q, { headers });
    if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + await res.text());
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const isDeal = r => r.kind === 'bought' || r.kind === 'sold';

function clean(rows) {
  const seen = new Map(), perInstall = new Map();
  for (const r of rows) {
    if (!(r.model in current.base) || !(r.base_used > 0) || !(r.total > 0) || !(r.price > 0)) continue;
    const ratio = r.price / r.total;
    if (ratio < 0.4 || ratio > 2) continue;                          // typos and joke prices
    seen.set([r.install_id, r.model, r.kind, r.price].join('|'), r); // repeated entries count once
  }
  const out = [];
  for (const r of [...seen.values()].reverse()) {                    // newest first
    const n = perInstall.get(r.install_id) || 0;
    if (n >= 20) continue;                                           // one phone cannot dominate a week
    perInstall.set(r.install_id, n + 1); out.push(r);
  }
  return out.reverse();
}

// The record's price turned back into a clean, base-storage price: the app's own deductions are undone.
const implied = r => r.price * r.base_used / r.total * (isDeal(r) ? 1 : ASK_FACTOR);
const weight = r => isDeal(r) ? 1 : ASK_WEIGHT;
const predict = (r, base) => r.total * base[r.model] / r.base_used;

function weightedMedian(items) {
  items.sort((a, b) => a.v - b.v);
  const half = items.reduce((s, x) => s + x.w, 0) / 2;
  let acc = 0;
  for (const x of items) { acc += x.w; if (acc >= half) return x.v; }
  return items[items.length - 1].v;
}

function fit(rows, base) {
  const by = {};
  for (const r of rows) (by[r.model] ||= []).push({ v: implied(r), w: weight(r) });
  const next = { ...base }, changes = [];
  for (const [m, items] of Object.entries(by)) {
    const n = items.reduce((s, x) => s + x.w, 0);
    if (n < MIN_N) continue;
    const old = base[m], med = weightedMedian(items);
    let v = (old * K + med * n) / (K + n);
    v = Math.min(old * (1 + MAX_STEP), Math.max(old * (1 - MAX_STEP), v));
    v = Math.round(v / 50) * 50;
    if (v !== old) { next[m] = v; changes.push({ m, old, v, n, med: Math.round(med) }); }
  }
  return { base: next, changes };
}

function error(rows, base) {
  const e = rows.map(r => Math.abs(predict(r, base) - r.price) / r.price).sort((a, b) => a - b);
  return e.length ? e[Math.floor(e.length / 2)] : NaN;
}

const pct = x => (x * 100).toFixed(1) + '%';

const raw = await fetchRecords();
const rows = clean(raw);
const deals = rows.filter(isDeal);
say(`## Weekly price check, ${new Date().toISOString().slice(0, 10)}`);
say(`Records in the last ${DAYS} days: ${raw.length} received, ${rows.length} kept (${deals.length} deals, ${rows.length - deals.length} asking prices).`);
say(`Current price file: version ${current.version}.`);

// hold back the newest deals of every model, so each model's new price is tested on its own sales
const byModel = {};
for (const r of deals) (byModel[r.model] ||= []).push(r);
const test = Object.values(byModel).flatMap(list => list.length < 2 ? [] : list.slice(list.length - Math.ceil(list.length * TEST_SHARE)));
const testSet = new Set(test);
const train = rows.filter(r => !testSet.has(r));

let publish = false;
if (test.length < MIN_TEST) {
  say(`Kept version ${current.version}: only ${test.length} deals to test with, ${MIN_TEST} needed.`);
} else {
  const cand = fit(train, current.base);
  const e0 = error(test, current.base), e1 = error(test, cand.base);
  say(`Typical error on the ${test.length} newest deals: current prices ${pct(e0)}, new prices ${pct(e1)}.`);
  if (e1 < e0) publish = true;
  else say(`Kept version ${current.version}: the new prices were not more accurate.`);
}

if (publish) {
  const final = fit(rows, current.base);                 // passed the test, so refit on everything
  if (!final.changes.length) { say('No model had enough records to move.'); publish = false; }
  else {
    const out = { ...current, version: current.version + 1, date: new Date().toISOString().slice(0, 10),
      note: `Weekly update from ${deals.length} deals and ${rows.length - deals.length} asking prices`,
      base: final.base, deals: { ...current.deals } };
    for (const r of deals) out.deals[r.model] = (out.deals[r.model] || 0) + 1;
    say(`Published version ${out.version}. Changed models:`);
    for (const c of final.changes) say(`- ${c.m}: ${c.old} → ${c.v} MAD (${c.n} records, median ${c.med})`);
    if (!DRY) {
      fs.mkdirSync(path.join(here, 'history'), { recursive: true });
      fs.writeFileSync(path.join(here, 'history', `prices-v${current.version}.json`), JSON.stringify(current, null, 1) + '\n');
      fs.writeFileSync(pricesPath, JSON.stringify(out, null, 1) + '\n');
    } else say('(dry run, nothing written)');
  }
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join('\n') + '\n');
