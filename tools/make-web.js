// Builds docs/ for GitHub Pages from the app build in www/:
//   docs/index.html     download page (template: tools/download.html)
//   docs/app/           the web version, installable on iPhone and offline after the first visit
//   docs/version.json   what the Android app checks to offer a newer APK
// Run after make-www.js (build.sh does both).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OWNER = 'Newtr0n55', REPO = 'apple-estimator';
const PAGE = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;
const APK = `https://github.com/${OWNER}/${REPO}/releases/latest/download/UsedAppleEstimator.apk`;

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www'), docs = path.join(root, 'docs'), app = path.join(docs, 'app');
const manifest = fs.readFileSync(path.join(root, 'src', 'AndroidManifest.xml'), 'utf8');
const code = Number(manifest.match(/android:versionCode="(\d+)"/)[1]);
const name = manifest.match(/android:versionName="([^"]+)"/)[1];
const today = new Date().toISOString().slice(0, 10);

fs.rmSync(app, { recursive: true, force: true });
fs.cpSync(www, app, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js'), path.join(app, 'icons')], { stdio: 'inherit' });

// web-only head tags and the offline service worker
let html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const headTags = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icons/favicon-32.png" sizes="32x32">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Estimator">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="theme-color" content="#EDEEF2" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#0E1120" media="(prefers-color-scheme: dark)">'
].join('\n');
html = html.replace('</head>', headTags + '\n</head>');
html = html.replace('</body>', '<script>if(\'serviceWorker\' in navigator && location.protocol === \'https:\') navigator.serviceWorker.register(\'sw.js\').catch(() => {});</script>\n</body>');
fs.writeFileSync(path.join(app, 'index.html'), html);

fs.writeFileSync(path.join(app, 'manifest.webmanifest'), JSON.stringify({
  name: 'Used Apple Estimator', short_name: 'Estimator', start_url: './', scope: './', display: 'standalone',
  background_color: '#EDEEF2', theme_color: '#2B3AC4',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 1));

const files = [];
(function walk(dir, rel) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f), r = rel ? rel + '/' + f : f;
    if (fs.statSync(p).isDirectory()) walk(p, r); else files.push(r);
  }
})(app, '');
const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);
fs.writeFileSync(path.join(app, 'sw.js'), `// Offline copy of the web version. Network first, so a new build shows up on the next visit.
const CACHE = 'estimator-${code}-${hash}';
const FILES = ${JSON.stringify(['./', ...files.filter(f => f !== 'index.html')])};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Supabase and the price file go to the network
  e.respondWith(fetch(e.request)
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
`);

fs.writeFileSync(path.join(docs, 'version.json'), JSON.stringify({ versionCode: code, versionName: name, date: today, apk: APK, page: PAGE }, null, 1) + '\n');

let page = fs.readFileSync(path.join(__dirname, 'download.html'), 'utf8');
page = page.split('{{VERSION}}').join(name).split('{{DATE}}').join(today).split('{{APK}}').join(APK).split('{{PAGE}}').join(PAGE);
fs.writeFileSync(path.join(docs, 'index.html'), page);
fs.writeFileSync(path.join(docs, '.nojekyll'), '');   // serve files as they are
if (!fs.existsSync(path.join(docs, 'qr.svg'))) console.warn('docs/qr.svg is missing (see SETUP.md)');
console.log('web: docs/ written, version', name, '(' + code + ')');
