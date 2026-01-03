const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

// Import our modules
const db = require('./db/database');
const authRoutes = require('./routes/auth');
const websiteRoutes = require('./routes/websites');
const scanRoutes = require('./routes/scan');
const { runScheduledScans } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for our simple frontend
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Serve static files (our frontend)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/scan', scanRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database
db.initialize();

// Schedule hourly scans
// Runs at minute 0 of every hour
cron.schedule('0 * * * *', async () => {
    console.log('Starting scheduled website scans...');
    try {
        await runScheduledScans();
        console.log('Scheduled scans completed');
    } catch (error) {
        console.error('Error during scheduled scans:', error);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   🛡️  SiteGuard is running!                    ║
║                                                ║
║   Local:   http://localhost:${PORT}              ║
║                                                ║
║   Ready to monitor websites and catch          ║
║   problems before your customers do.           ║
║                                                ║
╚════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    db.close();
    process.exit(0);
});

module.exports = app;
