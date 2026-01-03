const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/database.json');

// Default empty database structure
const defaultDb = {
    users: [],
    websites: [],
    scans: [],
    issues: [],
    alerts: []
};

let db = null;

function loadDb() {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = JSON.parse(data);
        } else {
            db = { ...defaultDb };
            saveDb();
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db = { ...defaultDb };
    }
    return db;
}

function saveDb() {
    try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

function initialize() {
    loadDb();
    console.log('Database initialized successfully');
    return db;
}

function getDb() {
    if (!db) {
        loadDb();
    }
    return db;
}

function close() {
    saveDb();
}

// User operations
const users = {
    create: (id, email, passwordHash, name) => {
        getDb().users.push({
            id,
            email,
            password_hash: passwordHash,
            name,
            created_at: new Date().toISOString(),
            subscription_status: 'trial',
            subscription_plan: 'starter'
        });
        saveDb();
    },

    findByEmail: (email) => {
        return getDb().users.find(u => u.email === email);
    },

    findById: (id) => {
        return getDb().users.find(u => u.id === id);
    },

    updateSubscription: (id, status, plan) => {
        const user = getDb().users.find(u => u.id === id);
        if (user) {
            user.subscription_status = status;
            user.subscription_plan = plan;
            saveDb();
        }
    }
};

// Website operations
const websites = {
    create: (id, userId, url, name) => {
        getDb().websites.push({
            id,
            user_id: userId,
            url,
            name,
            check_interval: 60,
            status: 'pending',
            last_checked: null,
            created_at: new Date().toISOString()
        });
        saveDb();
    },

    findByUser: (userId) => {
        return getDb().websites.filter(w => w.user_id === userId);
    },

    findById: (id) => {
        return getDb().websites.find(w => w.id === id);
    },

    findAll: () => {
        return getDb().websites;
    },

    updateStatus: (id, status, lastChecked) => {
        const website = getDb().websites.find(w => w.id === id);
        if (website) {
            website.status = status;
            website.last_checked = lastChecked;
            saveDb();
        }
    },

    delete: (id) => {
        const db = getDb();
        db.websites = db.websites.filter(w => w.id !== id);
        saveDb();
    }
};

// Scan operations
const scans = {
    create: (id, websiteId) => {
        getDb().scans.push({
            id,
            website_id: websiteId,
            started_at: new Date().toISOString(),
            completed_at: null,
            status: 'running',
            summary: null,
            details: null
        });
        saveDb();
    },

    complete: (id, status, summary, details) => {
        const scan = getDb().scans.find(s => s.id === id);
        if (scan) {
            scan.status = status;
            scan.summary = summary;
            scan.details = details;
            scan.completed_at = new Date().toISOString();
            saveDb();
        }
    },

    findByWebsite: (websiteId, limit = 10) => {
        return getDb().scans
            .filter(s => s.website_id === websiteId)
            .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
            .slice(0, limit);
    },

    findById: (id) => {
        return getDb().scans.find(s => s.id === id);
    }
};

// Issue operations
const issues = {
    create: (id, scanId, websiteId, type, severity, title, description, url) => {
        getDb().issues.push({
            id,
            scan_id: scanId,
            website_id: websiteId,
            type,
            severity,
            title,
            description,
            url,
            created_at: new Date().toISOString(),
            resolved_at: null
        });
        saveDb();
    },

    findByScan: (scanId) => {
        return getDb().issues.filter(i => i.scan_id === scanId);
    },

    findActiveByWebsite: (websiteId) => {
        return getDb().issues
            .filter(i => i.website_id === websiteId && !i.resolved_at)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    resolve: (id) => {
        const issue = getDb().issues.find(i => i.id === id);
        if (issue) {
            issue.resolved_at = new Date().toISOString();
            saveDb();
        }
    }
};

// Alert operations
const alerts = {
    create: (id, userId, websiteId, scanId, type, title, message) => {
        getDb().alerts.push({
            id,
            user_id: userId,
            website_id: websiteId,
            scan_id: scanId,
            type,
            title,
            message,
            sent_at: new Date().toISOString(),
            email_sent: 0
        });
        saveDb();
    },

    markEmailSent: (id) => {
        const alert = getDb().alerts.find(a => a.id === id);
        if (alert) {
            alert.email_sent = 1;
            saveDb();
        }
    },

    findByUser: (userId, limit = 20) => {
        const db = getDb();
        return db.alerts
            .filter(a => a.user_id === userId)
            .map(a => {
                const website = db.websites.find(w => w.id === a.website_id);
                return {
                    ...a,
                    url: website?.url,
                    website_name: website?.name
                };
            })
            .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
            .slice(0, limit);
    }
};

module.exports = {
    initialize,
    getDb,
    close,
    users,
    websites,
    scans,
    issues,
    alerts
};
