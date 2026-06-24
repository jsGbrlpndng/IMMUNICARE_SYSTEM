console.log('>>> SERVER BOOTING AT ' + new Date().toISOString());
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const infantsRouter = require('./routes/infants');
const logsRouter = require('./routes/logs');
const analyticsRouter = require('./routes/analytics');
const smsRouter = require('./routes/sms');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const scheduleRouter = require('./routes/schedule');
const vaccinationsRouter = require('./routes/vaccinations');
const adminRouter = require('./routes/admin');
const bhwRouter = require('./routes/bhw');
const adminAuditRouter = require('./routes/audit');
const auditLogsRouter = require('./routes/auditLogs');
const settingsRouter = require('./routes/settings');
const heatmapRouter = require('./routes/heatmap');
const dashboardRouter = require('./routes/dashboard');
const validationRouter = require('./routes/validation');
const registrationsRouter = require('./routes/registrations');
const caregiverRouter = require('./routes/caregiver');
const followupsRouter = require('./routes/followups');
const geoRouter = require('./routes/geo');
const spatialRouter = require('./routes/spatial');
const spatialDssRouter = require('./routes/spatialDss');
const notificationsRouter = require('./routes/notifications');
const deploymentReportsRouter = require('./routes/deploymentReports');
const { adminSpatialDeploymentRouter, adminDeploymentRouter, bhwDeploymentRouter, clinicalDeploymentRouter } = require('./routes/deployments');
const clinicalAuth = require('./middleware/clinicalAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security: remove X-Powered-By before any middleware runs ───────────────
app.disable('x-powered-by');

// ─── Security: Helmet base headers ──────────────────────────────────────────
// Helmet sets: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies.
// CSP is managed separately (not needed on API-only responses).
// HSTS is only enabled when running under production HTTPS.
const isProductionHttps =
    process.env.NODE_ENV === 'production' &&
    process.env.HTTPS_ENABLED === 'true';

const BACKEND_CSP = [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'"
].join('; ');

app.use(helmet({
    contentSecurityPolicy: false,       // API responses don't serve HTML
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },     // X-Frame-Options: DENY (Helmet default is SAMEORIGIN)
    hsts: isProductionHttps
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false                         // Never set HSTS over HTTP / localhost
}));

app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', BACKEND_CSP);
    next();
});

// ─── Security: Cache-Control: no-store for all API responses ─────────────────
// Prevents caches (browser, proxy) from storing authenticated / sensitive data.
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// ─── Security: Additional explicit headers not covered by helmet defaults ────
app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
});

// ─── CORS ────────────────────────────────────────────────────────────────────
// Restrict allowed origins to known IMMUNICARE frontend origins.
// The x-auth-token custom header must be listed in allowedHeaders so browsers
// don't block pre-flight requests. credentials:true is NOT set because the
// system uses custom header tokens, not cookies.
const allowedOriginsSet = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:4173',     // vite preview
    'http://127.0.0.1:4173'
]);

// Allow an additional production origin via environment variable.
if (process.env.CORS_ORIGIN) {
    allowedOriginsSet.add(process.env.CORS_ORIGIN);
}

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOriginsSet.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    allowedHeaders: [
        'Content-Type',
        'x-auth-token',
        'x-user-id',
        'x-user-role',
        'x-admin-barangay',
        'x-admin-barangay-id'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Global request logger
app.use((req, res, next) => {
    console.log(`\n📥 ${req.method} ${req.url}`);
    console.log('   Headers:', {
        'x-user-id': req.headers['x-user-id'],
        'x-user-role': req.headers['x-user-role']
    });
    next();
});

// Routes
app.use('/api/infants', infantsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/sms', smsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/auth', authRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/vaccinations', vaccinationsRouter);
app.use('/api/admin/spatial', adminSpatialDeploymentRouter);
app.use('/api/admin/spatial/deployments', adminDeploymentRouter);
app.use('/api/bhw/deployments', bhwDeploymentRouter);
app.use('/api/clinical/deployments', clinicalDeploymentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/bhw', bhwRouter);
app.use('/api/admin/audit', adminAuditRouter);
app.use('/api/audit', adminAuditRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/admin/settings', settingsRouter);
app.use('/api/heatmap', heatmapRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/validation', clinicalAuth, validationRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/caregiver', caregiverRouter);
app.use('/api/followups', followupsRouter);
app.use('/api/follow-ups', followupsRouter);
app.use('/api/geo', geoRouter);
app.use('/api/spatial', spatialDssRouter);
app.use('/api/spatial', spatialRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', deploymentReportsRouter);

// Health check
app.get('/', (req, res) => {
    res.send('Immunicare API is running');
});

app.use((req, res) => {
    res.status(404).type('text/plain').send('Not Found');
});

// Start Server with Integrity Sentinel
const db = require('./db');
const IntegritySentinel = require('./services/IntegritySentinel');
const DefaulterSweepService = require('./services/DefaulterSweepService');

const sentinel = new IntegritySentinel(db);
const defaulterSweepService = new DefaulterSweepService(db);

const { applyHardening } = require('./migrations/apply_governance_hardening');

// Global Error Handler - ensures all errors are returned as JSON
app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

async function boot() {
    console.log('[BOOT] Initializing Governance Hardening...');
    try {
        await applyHardening();
        console.log('[BOOT] Hardening sync complete.');
    } catch (e) {
        console.error('[BOOT FAILURE] Failed to apply governance hardening:', e.message);
        process.exit(1);
    }

    const isIntact = await sentinel.verifyInfrastructure();
    if (!isIntact) {
        console.warn('[BOOT WARNING] Governance integrity checks did not fully pass. Continuing so the local system can boot.');
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log('Governance Sentinel: ACTIVE');
        defaulterSweepService.start();
    });
}

const shutdown = async (signal) => {
    console.log(`[BOOT] Received ${signal}. Shutting down scheduled services...`);
    defaulterSweepService.stop();
    await db.end().catch(() => {});
    process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

if (require.main === module) {
    boot();
}

module.exports = app;
