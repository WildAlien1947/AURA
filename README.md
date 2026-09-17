# AURA

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-enabled-0ea5e9?logo=socketdotio&logoColor=white)](https://github.com/websockets/ws)
[![Status](https://img.shields.io/badge/status-active-success.svg)](#)

AURA is a lightweight games hub with a built-in reverse-proxy browser and a browser-based video calling feature. It is designed to run locally with a small Node.js server and minimal dependencies.

## Features

- **Games hub** with featured titles and quick-launch actions.
- **Proxy browser** for loading compatible websites through AURA.
- **Browser controls** including address entry, back, forward, reload, home, direct-tab opening, fullscreen support, and common keyboard shortcuts.
- **Resource rewriting** for proxied HTML and CSS, including links, scripts, images, forms, stylesheets, redirects, and `srcset` assets.
- **Cookie and request support** for more stateful sites and form submissions.
- **Roblox/now.gg launch path** that opens now.gg in a real top-level browser tab, which is required by protected cloud gaming clients.
- **AURA Call** with two-person WebRTC video rooms and WebSocket signaling.
- **Responsive interface** for desktop and mobile layouts.

## Screenshots and assets

The project includes a preview image at `assets/neon-drift-preview.jpg`, used by the home page's arcade preview.

## Requirements

- Node.js 18 or newer
- npm
- A modern browser with JavaScript enabled
- Camera and microphone permissions for AURA Call

Node.js 18+ is recommended because the server uses the built-in `fetch` API.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open AURA at [http://localhost:3000](http://localhost:3000).

To use another port, set `PORT` before starting the server:

```bash
PORT=8080 npm start
```

## Available routes

| Route | Purpose |
| --- | --- |
| `/` | AURA games hub |
| `/browser.html` | Standalone proxy browser |
| `/call` | AURA Call landing page |
| `/proxy?url=...` | Reverse-proxy endpoint for compatible HTTP(S) pages |

Example proxy URL:

```text
http://localhost:3000/proxy?url=https%3A%2F%2Fexample.com
```

## Proxy browser behavior

The proxy accepts HTTP and HTTPS targets and forwards supported browser requests through the AURA server. It preserves request methods and bodies, forwards selected headers and cookies, follows redirects, and rewrites page-relative resources back through `/proxy`.

This works best for traditional server-rendered websites and simple web applications. It cannot fully reproduce a normal browser security and networking environment. Sites that depend on strict origin checks, service workers, cross-origin isolation, WebSockets, WebRTC, anti-bot challenges, DRM, or complex client-side navigation may not work inside the embedded preview.

Use **Open direct** when a site requires its original top-level origin. Roblox through now.gg intentionally uses this path because its cloud client may require browser APIs and protection checks that an HTTP reverse proxy cannot emulate.

## AURA Call

AURA Call creates a room for two participants:

1. Open `/call`.
2. Create a room or enter an existing room code.
3. Share the invite link with the second participant.
4. Allow camera and microphone access when prompted.

The server provides WebSocket signaling. Media is exchanged peer-to-peer through WebRTC using the configured public STUN server. Production deployments should use HTTPS so browser media permissions and secure WebSocket connections work reliably.

## Project structure

```text
.
├── assets/
│   └── neon-drift-preview.jpg
├── call/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── browser.html
├── index.html
├── package.json
└── server.js
```

## Development notes

- The application is intentionally dependency-light.
- `server.js` serves static files, handles proxy requests, and provides WebSocket signaling for calls.
- The proxy does not bypass access controls or guarantee compatibility with protected third-party services.
- Do not expose an unrestricted public proxy without adding authentication, target allowlists, rate limiting, request-size limits, and abuse monitoring.

