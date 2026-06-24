const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const CLIENT_PORT = Number(process.env.PORT || 5173);
const CLIENT_HOST = '127.0.0.1';
const API_TARGET_HOST = '127.0.0.1';
const API_TARGET_PORT = Number(process.env.API_PORT || 3000);
const DIST_DIR = path.join(__dirname, 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function send(res, statusCode, body, headers = {}) {
    res.writeHead(statusCode, headers);
    res.end(body);
}

// ─── Security Headers ──────────────────────────────────────────────────────
// Applied to all responses served by this static server.
// These mirror what the Express backend does via Helmet, ensuring the SPA
// pages (index.html, JS bundles, CSS) are also hardened.
const BASE_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()'
};

// Production Content-Security-Policy for the IMMUNICARE SPA.
//
// Sources verified against the codebase:
//   script-src  'self'                   — Vite production bundles use <script type="module">
//   style-src   'self'                   — app-specific runtime styles are bundled in CSS
//   img-src     'self' data: blob:       — data: for Recharts SVG; blob: for jsPDF/xlsx exports
//               https://server.arcgisonline.com  — ArcGIS World_Imagery basemap tiles
//               https://*.cartocdn.com           — CARTO Voyager label-only overlay tiles
//   connect-src 'self'                   — all API calls go to same origin via proxy
//   font-src    'self'                   — @fontsource fonts are now bundled in /assets
//   worker-src  blob:                    — Web Workers created via Blob URL (some libraries)
//   child-src   blob:                    — same; covers blob: navigations inside workers
//   frame-ancestors 'none'               — must be in HTTP header, not <meta> tag (CSP Level 2)
//   object-src  'none'                   — no Flash / plugin content
//   base-uri    'self'                   — prevent base-tag injection attacks
//   form-action 'self'                   — restrict form submissions
const PRODUCTION_CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob: https://server.arcgisonline.com https://*.cartocdn.com",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src blob:",
    "child-src blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
].join('; ');

function serveStaticFile(res, filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);

    // Determine response headers
    const headers = {
        'Content-Type': contentType,
        ...BASE_SECURITY_HEADERS
    };

    // CSP is only meaningful on HTML responses (the SPA entry point).
    // Applying it to JS/CSS/font assets is harmless but unnecessary.
    if (filePath === INDEX_FILE || ext === '.html') {
        headers['Content-Security-Policy'] = PRODUCTION_CSP;
    }

    res.writeHead(200, headers);
    stream.pipe(res);
    stream.on('error', (err) => {
        console.error('Static file error:', err.message);
        if (!res.headersSent) {
            send(res, 500, 'Internal Server Error');
        } else {
            res.destroy();
        }
    });

    return true;
}

function proxyApiRequest(req, res) {
    const targetUrl = new URL(req.url, `http://${CLIENT_HOST}:${CLIENT_PORT}`);
    const options = {
        hostname: API_TARGET_HOST,
        port: API_TARGET_PORT,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
            ...req.headers,
            host: `${API_TARGET_HOST}:${API_TARGET_PORT}`,
            connection: 'close'
        }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        if (headers.location && headers.location.includes(`:${API_TARGET_PORT}`)) {
            headers.location = headers.location.replace(`:${API_TARGET_PORT}`, `:${CLIENT_PORT}`);
        }

        res.writeHead(proxyRes.statusCode || 502, headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('API proxy error:', err.message);
        send(res, 502, 'Bad Gateway');
    });

    req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${CLIENT_HOST}:${CLIENT_PORT}`);

    if (requestUrl.pathname.startsWith('/api/')) {
        return proxyApiRequest(req, res);
    }

    const assetPath = path.join(DIST_DIR, decodeURIComponent(requestUrl.pathname));
    if (requestUrl.pathname !== '/' && serveStaticFile(res, assetPath)) {
        return;
    }

    if (fs.existsSync(INDEX_FILE)) {
        return serveStaticFile(res, INDEX_FILE);
    }

    send(res, 404, 'Frontend build not found. Run the client build first.');
});

server.listen(CLIENT_PORT, CLIENT_HOST, () => {
    console.log(`ImmuniCare local client server running at http://${CLIENT_HOST}:${CLIENT_PORT}`);
    console.log(`Serving from: ${DIST_DIR}`);
    console.log(`Proxying API requests to http://${API_TARGET_HOST}:${API_TARGET_PORT}`);
});
