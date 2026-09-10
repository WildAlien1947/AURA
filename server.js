const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const port = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8'
};

async function proxyRequest(targetUrl, res) {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      }
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (contentType.includes('text/html')) {
      const html = rewriteProxyHtml(buffer.toString('utf8'), targetUrl);
      res.writeHead(response.status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      });
      res.end(html);
      return;
    }

    res.writeHead(response.status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(buffer);
  } catch (error) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AURA Proxy Error</title><style>body{font-family:system-ui,Segoe UI,sans-serif;background:#071a2e;color:#eaf7ff;display:grid;place-items:center;min-height:100vh;margin:0} .card{max-width:640px;padding:28px 32px;border-radius:18px;background:rgba(15,28,45,.9);border:1px solid rgba(117,190,255,.2);box-shadow:0 20px 45px rgba(15,54,124,.35)} h1{margin-top:0;font-size:1.4rem} p{color:#a9c9e8;line-height:1.6} a{color:#73d0ff;text-decoration:none;font-weight:700}</style></head><body><div class="card"><h1>AURA Proxy blocked this site</h1><p>The site could not be loaded in the preview because its protection blocked the fetch. Use the direct browser tab to open it normally.</p><p>Error: ${String(error.message || 'Proxy fetch failed').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p><a href="${String(targetUrl).replace(/</g,'&lt;').replace(/>/g,'&gt;')}" target="_blank" rel="noreferrer">Open directly</a></div></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  }
}

function rewriteProxyHtml(html, targetUrl) {
  const origin = new URL(targetUrl);
  const proxyUrl = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#') || /^(data|javascript|mailto|tel):/i.test(trimmed)) {
      return value;
    }

    try {
      return '/proxy?url=' + encodeURIComponent(new URL(trimmed, origin).toString());
    } catch {
      return value;
    }
  };

  return html.replace(
    /(\s(?:href|src|action|poster)\s*=\s*)(["'])(.*?)\2/gi,
    (match, prefix, quote, value) => prefix + quote + proxyUrl(value) + quote
  );
}

function resolvePath(requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const pathname = safePath.startsWith('/browser') ? '/browser.html' : safePath;
  return path.join(rootDir, pathname.replace(/^\//, ''));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname;

  if (requestPath === '/proxy') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing url query parameter');
      return;
    }

    await proxyRequest(targetUrl, res);
    return;
  }

  const filePath = resolvePath(requestPath);
  const normalizedPath = path.normalize(filePath);

  if (!normalizedPath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(normalizedPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const extension = path.extname(normalizedPath).toLowerCase();
    const contentType = mimeTypes[extension] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`🚀 AURA server running at http://localhost:${port}`);
});
