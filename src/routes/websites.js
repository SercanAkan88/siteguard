const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { scanSingleWebsite } = require('../services/scheduler');

const router = express.Router();

// Simple auth middleware
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = db.users.findById(userId);
    if (!user) {
        return res.status(401).json({ error: 'Invalid user' });
    }
    
    req.user = user;
    next();
};

// Get all websites for user
router.get('/', requireAuth, (req, res) => {
    try {
        const websites = db.websites.findByUser(req.user.id);
        
        // Get latest issues for each website
        const websitesWithIssues = websites.map(site => {
            const issues = db.issues.findActiveByWebsite(site.id);
            return {
                ...site,
                activeIssues: issues.length,
                issues: issues.slice(0, 5) // Return up to 5 recent issues
            };
        });

        res.json(websitesWithIssues);
    } catch (error) {
        console.error('Error fetching websites:', error);
        res.status(500).json({ error: 'Failed to fetch websites' });
    }
});

// Add a new website
router.post('/', requireAuth, (req, res) => {
    try {
        let { url, name } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'Website URL is required' });
        }

        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Check for duplicates
        const existingWebsites = db.websites.findByUser(req.user.id);
        if (existingWebsites.some(w => w.url === url)) {
            return res.status(400).json({ error: 'This website is already being monitored' });
        }

        // Check subscription limits
        const plan = req.user.subscription_plan || 'starter';
        const limits = {
            starter: 3,
            professional: 10,
            enterprise: 100
        };
        
        if (existingWebsites.length >= (limits[plan] || 3)) {
            return res.status(400).json({ 
                error: `Your ${plan} plan allows up to ${limits[plan]} websites. Upgrade to add more.` 
            });
        }

        // Create website
        const websiteId = uuidv4();
        db.websites.create(websiteId, req.user.id, url, name || '');

        res.status(201).json({
            success: true,
            website: {
                id: websiteId,
                url,
                name: name || '',
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Error adding website:', error);
        res.status(500).json({ error: 'Failed to add website' });
    }
});

// Get single website details
router.get('/:id', requireAuth, (req, res) => {
    try {
        const website = db.websites.findById(req.params.id);
        
        if (!website) {
            return res.status(404).json({ error: 'Website not found' });
        }

        if (website.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get scan history
        const scans = db.scans.findByWebsite(website.id);
        const issues = db.issues.findActiveByWebsite(website.id);

        res.json({
            ...website,
            scans,
            issues
        });

    } catch (error) {
        console.error('Error fetching website:', error);
        res.status(500).json({ error: 'Failed to fetch website' });
    }
});

// Trigger manual scan
router.post('/:id/scan', requireAuth, async (req, res) => {
    try {
        const website = db.websites.findById(req.params.id);
        
        if (!website) {
            return res.status(404).json({ error: 'Website not found' });
        }

        if (website.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Run scan
        const results = await scanSingleWebsite(website.id);

        res.json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('Error running scan:', error);
        res.status(500).json({ error: 'Failed to run scan' });
    }
});

// Delete website
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const website = db.websites.findById(req.params.id);
        
        if (!website) {
            return res.status(404).json({ error: 'Website not found' });
        }

        if (website.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        db.websites.delete(req.params.id);

        res.json({ success: true });

    } catch (error) {
        console.error('Error deleting website:', error);
        res.status(500).json({ error: 'Failed to delete website' });
    }
});

// Get alerts for user
router.get('/alerts/all', requireAuth, (req, res) => {
    try {
        const alerts = db.alerts.findByUser(req.user.id);
        res.json(alerts);
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

module.exports = router;
