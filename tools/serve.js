// Minimal static server for previewing www/ in a desktop browser: node tools/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www'), port = Number(process.argv[2]) || 8737;
const types = {'.html':'text/html; charset=utf-8', '.css':'text/css', '.woff2':'font/woff2', '.js':'text/javascript', '.json':'application/json'};
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); res.end(d); });
}).listen(port, () => console.log('http://localhost:' + port));
