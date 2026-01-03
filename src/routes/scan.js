const express = require('express');
const scanner = require('../services/scanner');

const router = express.Router();

// Public endpoint - scan any website (for the demo on homepage)
router.post('/demo', async (req, res) => {
    try {
        let { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
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

        console.log(`Demo scan requested for: ${url}`);

        // Run the scan
        const results = await scanner.scanWebsite(url);

        // Cleanup
        await scanner.close();

        res.json({
            success: true,
            results
        });

    } catch (error) {
        console.error('Demo scan error:', error);
        res.status(500).json({ error: 'Scan failed: ' + error.message });
    }
});

// Quick check endpoint - just verify site is online
router.post('/quick', async (req, res) => {
    try {
        let { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const result = await scanner.quickCheck(url);
        await scanner.close();

        res.json(result);

    } catch (error) {
        console.error('Quick check error:', error);
        res.status(500).json({ error: 'Check failed' });
    }
});

module.exports = router;
