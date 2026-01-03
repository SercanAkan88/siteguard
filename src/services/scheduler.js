const db = require('../db/database');
const scanner = require('./scanner');
const email = require('./email');
const { v4: uuidv4 } = require('uuid');

async function runScheduledScans() {
    console.log(`[${new Date().toISOString()}] Starting scheduled scans...`);
    
    // Get all websites that need scanning
    const websites = db.websites.findAll();
    
    if (websites.length === 0) {
        console.log('No websites to scan');
        return;
    }

    console.log(`Found ${websites.length} websites to scan`);

    for (const website of websites) {
        try {
            console.log(`Scanning: ${website.url}`);
            
            // Create scan record
            const scanId = uuidv4();
            db.scans.create(scanId, website.id);

            // Run the scan
            const results = await scanner.scanWebsite(website.url);

            // Determine overall status
            const status = results.issues.some(i => i.severity === 'critical') ? 'error' :
                          results.issues.some(i => i.severity === 'error') ? 'warning' :
                          results.issues.length > 0 ? 'warning' : 'healthy';

            // Update website status
            db.websites.updateStatus(website.id, status, new Date().toISOString());

            // Save scan results
            db.scans.complete(
                scanId,
                results.status,
                JSON.stringify(results.summary),
                JSON.stringify(results)
            );

            // Save issues
            for (const issue of results.issues) {
                db.issues.create(
                    issue.id,
                    scanId,
                    website.id,
                    issue.type,
                    issue.severity,
                    issue.title,
                    issue.description,
                    issue.url
                );
            }

            // Send alert if issues found
            if (results.issues.length > 0) {
                // Get website owner
                const user = db.users.findById(website.user_id);
                
                if (user) {
                    // Create alert record
                    const alertId = uuidv4();
                    const alertTitle = results.issues.some(i => i.severity === 'critical')
                        ? `Critical problems on ${website.name || website.url}`
                        : `Issues found on ${website.name || website.url}`;
                    
                    db.alerts.create(
                        alertId,
                        user.id,
                        website.id,
                        scanId,
                        status,
                        alertTitle,
                        `Found ${results.issues.length} issue(s)`
                    );

                    // Send email
                    const emailResult = await email.sendAlertEmail(
                        user.email,
                        website.name || website.url,
                        website.url,
                        results.issues
                    );

                    if (emailResult.success) {
                        db.alerts.markEmailSent(alertId);
                        console.log(`Alert sent to ${user.email} for ${website.url}`);
                    }
                }
            } else {
                // Check if this is a recovery (was previously having issues)
                const previousStatus = website.status;
                if (previousStatus === 'error' || previousStatus === 'warning') {
                    const user = db.users.findById(website.user_id);
                    if (user) {
                        await email.sendRecoveryEmail(
                            user.email,
                            website.name || website.url,
                            website.url
                        );
                        console.log(`Recovery email sent to ${user.email} for ${website.url}`);
                    }
                }
            }

            console.log(`Completed scan for ${website.url}: ${status}`);

        } catch (error) {
            console.error(`Error scanning ${website.url}:`, error);
            
            // Update website status to error
            db.websites.updateStatus(website.id, 'error', new Date().toISOString());
        }
    }

    // Cleanup scanner
    await scanner.close();
    
    console.log(`[${new Date().toISOString()}] Scheduled scans completed`);
}

// Scan a single website (called from API)
async function scanSingleWebsite(websiteId) {
    const website = db.websites.findById(websiteId);
    if (!website) {
        throw new Error('Website not found');
    }

    // Create scan record
    const scanId = uuidv4();
    db.scans.create(scanId, website.id);

    // Run the scan
    const results = await scanner.scanWebsite(website.url);

    // Determine overall status
    const status = results.issues.some(i => i.severity === 'critical') ? 'error' :
                  results.issues.some(i => i.severity === 'error') ? 'warning' :
                  results.issues.length > 0 ? 'warning' : 'healthy';

    // Update website status
    db.websites.updateStatus(website.id, status, new Date().toISOString());

    // Save scan results
    db.scans.complete(
        scanId,
        results.status,
        JSON.stringify(results.summary),
        JSON.stringify(results)
    );

    // Save issues
    for (const issue of results.issues) {
        db.issues.create(
            issue.id,
            scanId,
            website.id,
            issue.type,
            issue.severity,
            issue.title,
            issue.description,
            issue.url
        );
    }

    // Cleanup
    await scanner.close();

    return {
        scanId,
        status,
        results
    };
}

// Quick check without full scan
async function quickCheckWebsite(url) {
    const result = await scanner.quickCheck(url);
    await scanner.close();
    return result;
}

module.exports = {
    runScheduledScans,
    scanSingleWebsite,
    quickCheckWebsite
};
