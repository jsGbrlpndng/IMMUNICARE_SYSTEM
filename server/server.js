console.log('>>> SERVER BOOTING AT ' + new Date().toISOString());
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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
const settingsRouter = require('./routes/settings');
const heatmapRouter = require('./routes/heatmap');
const dashboardRouter = require('./routes/dashboard');
const validationRouter = require('./routes/validation');
const registrationsRouter = require('./routes/registrations');
const caregiverRouter = require('./routes/caregiver');
const followupsRouter = require('./routes/followups');
const geoRouter = require('./routes/geo');
const spatialRouter = require('./routes/spatial');
const { adminSpatialDeploymentRouter, adminDeploymentRouter, bhwDeploymentRouter, clinicalDeploymentRouter } = require('./routes/deployments');
const clinicalAuth = require('./middleware/clinicalAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175'
]);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked origin: ${origin}`));
    }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global request logger - CRITICAL FOR DEBUGGING
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
app.use('/api/admin/settings', settingsRouter);
app.use('/api/heatmap', heatmapRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/validation', clinicalAuth, validationRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/caregiver', caregiverRouter);
app.use('/api/followups', followupsRouter);
app.use('/api/follow-ups', followupsRouter);
app.use('/api/geo', geoRouter);
app.use('/api/spatial', spatialRouter);

// Health check
app.get('/', (req, res) => {
    res.send('Immunicare API is running');
});

// Start Server with Integrity Sentinel
const db = require('./db');
const IntegritySentinel = require('./services/IntegritySentinel');

const sentinel = new IntegritySentinel(db);

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
    });
}

if (require.main === module) {
    boot();
}

module.exports = app;
