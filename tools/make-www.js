// Builds android-app/www/ from the desktop page: bundles the Google Fonts offline,
// wraps the page in a full document and adds the mobile app shell (CSS + JS).
// Usage: node make-www.js <path to used-apple-estimator.html>
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('usage: node make-www.js <source.html>'); process.exit(1); }
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const fontDir = path.join(out, 'fonts');
fs.mkdirSync(fontDir, { recursive: true });

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const KEEP = new Set(['latin', 'latin-ext', 'arabic']);

async function bundleFonts() {
  const css = await (await fetch(FONT_CSS, { headers: { 'User-Agent': UA } })).text();
  // Each block is "/* subset */ @font-face{...}"
  const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter(b => b.includes('@font-face'));
  let outCss = '', n = 0;
  for (const b of blocks) {
    const subset = b.match(/\/\*\s*([\w-]+)\s*\*\//)[1];
    if (!KEEP.has(subset)) continue;
    const url = b.match(/url\((https:[^)]+)\)/)[1];
    const fam = b.match(/font-family:\s*'([^']+)'/)[1].replace(/\s+/g, '');
    const file = fam + '-' + subset + '-' + (n++) + '.woff2';
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(path.join(fontDir, file), buf);
    outCss += b.replace(url, file).trim() + '\n';
  }
  fs.writeFileSync(path.join(fontDir, 'fonts.css'), outCss);
  console.log('fonts:', n, 'files');
}

const MOBILE_CSS = fs.readFileSync(path.join(__dirname, 'mobile.css'), 'utf8');
const MOBILE_JS = fs.readFileSync(path.join(__dirname, 'mobile.js'), 'utf8');
const SYNC_JS = fs.readFileSync(path.join(__dirname, 'sync.js'), 'utf8');

// Moroccan Darija replaces the Standard Arabic strings. darija.json lists them in the
// same order as the page's TR.ar keys; strings-new.json adds the app-only strings.
function translationsScript(html) {
  const window = {}; let TR;   // eslint-disable-line no-unused-vars
  for (const m of html.matchAll(/<script>((?:window\.TR|Object\.assign\(TR)[\s\S]*?)<\/script>/g)) eval(m[1].replace('window.TR', 'TR'));
  const keys = Object.keys(TR.ar);
  const darija = JSON.parse(fs.readFileSync(path.join(__dirname, 'darija.json'), 'utf8'));
  if (keys.length !== darija.length) throw new Error('darija.json has ' + darija.length + ' strings, the page has ' + keys.length);
  const ar = {}, fr = {};
  keys.forEach((k, i) => { ar[k] = darija[i]; });
  const extra = JSON.parse(fs.readFileSync(path.join(__dirname, 'strings-new.json'), 'utf8'));
  for (const k in extra) { fr[k] = extra[k][0]; ar[k] = extra[k][1]; }
  return '<script>Object.assign(TR.ar, ' + JSON.stringify(ar) + ');\nObject.assign(TR.fr, ' + JSON.stringify(fr) + ');</script>\n';
}

// replace exactly one occurrence, or fail loudly if the desktop page changed
function swap(html, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error('expected one match for: ' + from.slice(0, 60) + ' (found ' + n + ')');
  return html.replace(from, () => to);
}

function buildPage() {
  let html = fs.readFileSync(src, 'utf8');
  // drop the online font links, use the bundled copy
  html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '')
             .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
  html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">', '');
  // mobile CSS goes at the end of the page's own stylesheet so it wins
  html = html.replace('</style>', MOBILE_CSS + '\n</style>');
  // Share button next to Copy (shown only inside the app)
  html = swap(html, '<button class="btn pri" id="copyBtn" type="button">Copy summary</button>',
    '<button class="btn pri" id="copyBtn" type="button">Copy summary</button>\n          <button class="btn" id="shareBtn" type="button" hidden>Share</button>');
  // containers filled by sync.js: deal box, reminder card, Data sharing panel, first-launch screen
  html = swap(html, '<textarea class="copybox"', '<div class="deal" id="dealBox"></div>\n        <textarea class="copybox"');
  html = swap(html, '<div class="app">', '<div class="updbar" id="updateBar" role="status" hidden></div>\n  <div class="prompt" id="askPrompt" role="status" hidden></div>\n\n  <div class="app">');
  html = swap(html, '</details>', '</details>\n\n  <details class="set" id="dataSet"><summary>Data sharing</summary><div class="setbody" id="dataBody"></div></details>');
  html = swap(html, '<script>window.TR = {fr:{}, ar:{}};</script>', '<div class="onboard" id="onboard" hidden></div>\n\n<script>window.TR = {fr:{}, ar:{}};</script>');
  html = swap(html, '>العربية</button>', '>الدارجة</button>');
  // Darija and new-string translations go in after the page's own TR scripts, before the main script
  html = swap(html, '<script>\n/* ---------- data ---------- */', translationsScript(html) + '<script>\n/* ---------- data ---------- */');
  const manifest = fs.readFileSync(path.join(root, 'src', 'AndroidManifest.xml'), 'utf8');
  const build = { code: Number(manifest.match(/android:versionCode="(\d+)"/)[1]), name: manifest.match(/android:versionName="([^"]+)"/)[1] };
  const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<script>window.APP_BUILD = ' + JSON.stringify(build) + ';</script>\n';
  // <title> and the font link come before the page's <style>, so <body> starts there
  html = head + html.replace('<style>', '</head>\n<body>\n<style>') +
    '\n<script>\n' + MOBILE_JS + '\n</script>\n<script src="config.js"></script>\n<script>\n' + SYNC_JS + '\n</script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'config.js'), path.join(out, 'config.js'));
  console.log('page:', html.length, 'bytes');
}

(async () => {
  buildPage();
  if (!fs.existsSync(path.join(fontDir, 'fonts.css')) || process.argv.includes('--refetch-fonts')) await bundleFonts();
})().catch(e => { console.error(e); process.exit(1); });
