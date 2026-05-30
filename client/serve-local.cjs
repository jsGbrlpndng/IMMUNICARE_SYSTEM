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

function serveStaticFile(res, filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);

    res.writeHead(200, { 'Content-Type': contentType });
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
