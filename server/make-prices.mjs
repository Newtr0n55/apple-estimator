// Writes server/prices.json version 1 from the base prices built into the page.
// Run once when setting up: node server/make-prices.mjs path/to/used-apple-estimator.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: node server/make-prices.mjs <used-apple-estimator.html>'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const start = html.indexOf('const P = '), end = html.indexOf('const SRC = ');
if (start < 0 || end < 0) throw new Error('MODELS block not found in ' + src);
const MODELS = new Function(html.slice(start, end) + '; return MODELS;')();

const base = {};
for (const m of MODELS) if (!m.custom) base[m.id] = m.base;
const out = { version: 1, date: '2026-10-19', note: 'Built-in prices from Marketplace listings', base, deals: {} };
fs.writeFileSync(path.join(here, 'prices.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote server/prices.json with', Object.keys(base).length, 'models');
