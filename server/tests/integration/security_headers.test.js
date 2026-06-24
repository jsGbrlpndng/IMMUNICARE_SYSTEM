'use strict';

/**
 * Security Headers Tests
 *
 * Verifies that the Express server applies the required set of security
 * response headers on every environment. These tests exercise the
 * hardened server.js middleware stack in isolation — no real DB needed.
 *
 * ZAP alerts addressed:
 *   - X-Powered-By disclosure        → must be absent
 *   - X-Content-Type-Options missing → must be 'nosniff'
 *   - X-Frame-Options missing         → must be 'DENY'
 *   - Cache-Control on /api/*         → must be 'no-store'
 *   - CORS unauthorized origin        → must be rejected
 *   - CORS approved origin            → must be reflected
 *   - HSTS in development             → must NOT be set
 */

const express = require('express');
const request = require('supertest');

// ---------------------------------------------------------------------------
// Minimal Express app — mirrors the hardened server.js security middleware
// but uses no real DB, no real routes, and no boot() lifecycle.
// ---------------------------------------------------------------------------
function buildTestApp({ corsOrigin = null, nodeEnv = 'test', httpsEnabled = 'false' } = {}) {
    // Temporarily override env for HSTS gate
    const originalEnv = process.env.NODE_ENV;
    const originalHttps = process.env.HTTPS_ENABLED;
    process.env.NODE_ENV = nodeEnv;
    process.env.HTTPS_ENABLED = httpsEnabled;

    // Re-require modules so the isProductionHttps constant is evaluated fresh
    jest.resetModules();

    const app = require('../../server');

    // Restore env
    process.env.NODE_ENV = originalEnv;
    process.env.HTTPS_ENABLED = originalHttps;

    return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const APPROVED_ORIGIN = 'http://localhost:5173';
const BLOCKED_ORIGIN  = 'http://evil.example.com';
const EXPECTED_BACKEND_CSP = [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'"
].join('; ');

// ---------------------------------------------------------------------------
// Suite 1 — Base security headers on every response
// ---------------------------------------------------------------------------
describe('Security Headers — Express middleware', () => {
    let app;

    beforeAll(() => {
        jest.resetModules();
        // Import the app directly (server.js exports `app` and does not call boot() when not main)
        app = require('../../server');
    });

    afterAll(() => {
        jest.resetModules();
    });

    // ── X-Powered-By ────────────────────────────────────────────────────────
    it('X-Powered-By header is absent', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    // ── X-Content-Type-Options ───────────────────────────────────────────────
    it('X-Content-Type-Options: nosniff is set on root response', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    // ── X-Frame-Options ──────────────────────────────────────────────────────
    it('X-Frame-Options: DENY is set on root response', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('backend CSP is set on root response with explicit no-fallback directives', async () => {
        const res = await request(app).get('/');
        expect(res.headers['content-security-policy']).toBe(EXPECTED_BACKEND_CSP);
        expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(res.headers['content-security-policy']).toContain("form-action 'none'");
    });

    it('backend CSP is set on robots.txt and sitemap.xml responses', async () => {
        const robots = await request(app).get('/robots.txt');
        const sitemap = await request(app).get('/sitemap.xml');

        expect(robots.headers['content-security-policy']).toBe(EXPECTED_BACKEND_CSP);
        expect(sitemap.headers['content-security-policy']).toBe(EXPECTED_BACKEND_CSP);
    });

    it('backend CSP is set on unmatched 404 responses', async () => {
        const res = await request(app).get('/not-a-real-backend-route');
        expect(res.status).toBe(404);
        expect(res.headers['content-security-policy']).toBe(EXPECTED_BACKEND_CSP);
    });

    // ── Referrer-Policy ──────────────────────────────────────────────────────
    it('Referrer-Policy header is present', async () => {
        const res = await request(app).get('/');
        expect(res.headers['referrer-policy']).toBeDefined();
    });

    // ── Permissions-Policy ───────────────────────────────────────────────────
    it('Permissions-Policy header is present', async () => {
        const res = await request(app).get('/');
        expect(res.headers['permissions-policy']).toBeDefined();
        expect(res.headers['permissions-policy']).toContain('camera=()');
        expect(res.headers['permissions-policy']).toContain('microphone=()');
    });
});

// ---------------------------------------------------------------------------
// Suite 2 — Cache-Control on API routes
// ---------------------------------------------------------------------------
describe('Security Headers — Cache-Control on /api/*', () => {
    let app;

    beforeAll(() => {
        jest.resetModules();
        app = require('../../server');
    });

    afterAll(() => {
        jest.resetModules();
    });

    it('Cache-Control: no-store is set on /api/auth/login (POST)', async () => {
        // We don't provide a valid body — we only care about the response header,
        // not the response status. A 400 is fine here.
        const res = await request(app)
            .post('/api/auth/login')
            .send({});
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('Cache-Control: no-store is set on an unauthenticated /api route (GET)', async () => {
        const res = await request(app).get('/api/auth/verify');
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('backend CSP is set on /api responses', async () => {
        const res = await request(app).get('/api/auth/verify');
        expect(res.headers['content-security-policy']).toBe(EXPECTED_BACKEND_CSP);
    });

    it('Cache-Control header is NOT forced on non-API routes', async () => {
        const res = await request(app).get('/');
        // Root health-check response — no explicit cache-control override expected
        // (Helmet may set its own, but it should not be 'no-store')
        expect(res.headers['cache-control']).not.toBe('no-store');
    });
});

// ---------------------------------------------------------------------------
// Suite 3 — CORS behaviour
// ---------------------------------------------------------------------------
describe('Security Headers — CORS', () => {
    let app;

    beforeAll(() => {
        jest.resetModules();
        app = require('../../server');
    });

    afterAll(() => {
        jest.resetModules();
    });

    it('CORS allows an approved localhost origin', async () => {
        const res = await request(app)
            .options('/api/auth/login')
            .set('Origin', APPROVED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type, x-auth-token');

        expect(res.headers['access-control-allow-origin']).toBe(APPROVED_ORIGIN);
    });

    it('CORS allows x-auth-token in the allowed headers list', async () => {
        const res = await request(app)
            .options('/api/auth/login')
            .set('Origin', APPROVED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'x-auth-token');

        const allowed = (res.headers['access-control-allow-headers'] || '').toLowerCase();
        expect(allowed).toContain('x-auth-token');
    });

    it('CORS rejects a blocked/unknown origin', async () => {
        const res = await request(app)
            .options('/api/auth/login')
            .set('Origin', BLOCKED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST');

        // When CORS rejects an origin the middleware calls next(err), which
        // ultimately produces a 500 from the default Express error handler,
        // OR the cors module returns status 204 without the ACAO header.
        // Either way, the ACAO header must NOT be the blocked origin.
        expect(res.headers['access-control-allow-origin']).not.toBe(BLOCKED_ORIGIN);
    });

    it('CORS does not set credentials: true (no ACAC header)', async () => {
        const res = await request(app)
            .options('/api/auth/login')
            .set('Origin', APPROVED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST');

        expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Suite 4 — HSTS only in production HTTPS
// ---------------------------------------------------------------------------
describe('Security Headers — HSTS', () => {
    it('HSTS is NOT set in development mode (default)', async () => {
        jest.resetModules();
        process.env.NODE_ENV   = 'development';
        process.env.HTTPS_ENABLED = 'false';
        const devApp = require('../../server');

        const res = await request(devApp).get('/');
        expect(res.headers['strict-transport-security']).toBeUndefined();

        jest.resetModules();
        delete process.env.NODE_ENV;
        delete process.env.HTTPS_ENABLED;
    });

    it('HSTS is NOT set when NODE_ENV=production but HTTPS_ENABLED is false', async () => {
        jest.resetModules();
        process.env.NODE_ENV   = 'production';
        process.env.HTTPS_ENABLED = 'false';
        const prodApp = require('../../server');

        const res = await request(prodApp).get('/');
        expect(res.headers['strict-transport-security']).toBeUndefined();

        jest.resetModules();
        delete process.env.NODE_ENV;
        delete process.env.HTTPS_ENABLED;
    });
});
