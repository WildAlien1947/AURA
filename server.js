const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const WebSocket = require('ws');

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

const browserUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function proxyTarget(value, baseUrl) {
  try {
    const resolved = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) return value;
    return '/proxy?url=' + encodeURIComponent(resolved.toString());
  } catch {
    return value;
  }
}

function rewriteSetCookie(value) {
  return value
    .replace(/;\s*Domain=[^;]+/gi, '')
    .replace(/;\s*Secure/gi, '')
    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax');
}

function rewriteCss(css, targetUrl) {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, value) => {
    if (!value || /^(data|blob|javascript|#):/i.test(value.trim())) return match;
    return `url(${quote}${proxyTarget(value, targetUrl)}${quote})`;
  }).replace(/@import\s+(url\(\s*)?(['"])(.*?)\2/gi, (match, prefix = '', quote, value) => {
    return match.replace(value, proxyTarget(value, targetUrl));
  });
}

function rewriteProxyHtml(html, targetUrl) {
  const rewrite = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#') || /^(data|blob|javascript|mailto|tel):/i.test(trimmed)) return value;
    return proxyTarget(trimmed, targetUrl);
  };

  return html
    .replace(/(\s(?:href|src|action|poster|cite|longdesc|formaction|background|manifest|data|srcset)\s*=\s*)(["'])(.*?)\2/gi,
      (match, prefix, quote, value) => {
        if (value.includes(',')) {
          return prefix + quote + value.split(',').map((item) => {
            const parts = item.trim().split(/\s+/);
            parts[0] = rewrite(parts[0]);
            return parts.join(' ');
          }).join(', ') + quote;
        }
        return prefix + quote + rewrite(value) + quote;
      })
    .replace(/(\s(?:href|src|action|poster|cite|longdesc|formaction|background|manifest|data)\s*=\s*)([^\s>]+)/gi,
      (match, prefix, value) => prefix + rewrite(value))
    .replace(/(<meta\s+[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=)([^"']+)/gi,
      (match, prefix, value) => prefix + rewrite(value));
}

async function readRequestBody(req) {
  if (['GET', 'HEAD'].includes(req.method)) return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxyRequest(targetUrl, req, res) {
  try {
    let currentUrl = new URL(targetUrl);
    const body = await readRequestBody(req);
    const requestHeaders = {
      'User-Agent': browserUserAgent,
      'Accept': req.headers.accept || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Referer': req.headers.referer || currentUrl.toString(),
      ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {})
    };
    let response;
    let method = req.method;
    let requestBody = body;
    for (let redirects = 0; redirects < 8; redirects += 1) {
      response = await fetch(currentUrl, {
        method,
        headers: requestHeaders,
        body: requestBody,
        redirect: 'manual'
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location) break;
      currentUrl = new URL(location, currentUrl);
      if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
        method = 'GET';
        requestBody = undefined;
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*'
    };
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) headers['Set-Cookie'] = cookies.map(rewriteSetCookie);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) headers.Location = proxyTarget(location, currentUrl);
    }

    if (contentType.includes('text/html')) {
      const html = rewriteProxyHtml(buffer.toString('utf8'), currentUrl.toString());
      res.writeHead(response.status, headers);
      res.end(html);
      return;
    }

    if (contentType.includes('text/css')) {
      res.writeHead(response.status, headers);
      res.end(rewriteCss(buffer.toString('utf8'), currentUrl.toString()));
      return;
    }

    res.writeHead(response.status, headers);
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
  const pathname = safePath.startsWith('/browser') ? '/browser.html' : safePath === '/call' ? '/call/index.html' : safePath;
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

    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedTarget.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message);
      return;
    }

    await proxyRequest(parsedTarget.toString(), req, res);
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

const rooms = new Map();
const wss = new WebSocket.Server({ server });

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      send(socket, { type: 'error', message: 'Invalid signaling message.' });
      return;
    }

    if (message.type === 'join') {
      const roomCode = String(message.room || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6,12}$/.test(roomCode)) return send(socket, { type: 'error', message: 'Enter a valid room code.' });
      let room = rooms.get(roomCode);
      if (!room) {
        room = new Set();
        rooms.set(roomCode, room);
      }
      if (room.size >= 2) return send(socket, { type: 'error', message: 'This room is full.' });
      socket.room = roomCode;
      room.add(socket);
      send(socket, { type: 'joined', room: roomCode, initiator: room.size === 1 });
      if (room.size === 2) [...room].forEach((peer) => send(peer, { type: 'ready' }));
      return;
    }

    if (['offer', 'answer', 'ice'].includes(message.type) && socket.room) {
      for (const peer of rooms.get(socket.room) || []) {
        if (peer !== socket) send(peer, { type: message.type, data: message.data });
      }
    }
  });

  socket.on('close', () => {
    if (!socket.room) return;
    const room = rooms.get(socket.room);
    if (!room) return;
    room.delete(socket);
    for (const peer of room) send(peer, { type: 'peer-left' });
    if (!room.size) rooms.delete(socket.room);
  });
});
