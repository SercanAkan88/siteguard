#!/usr/bin/env node

/**
 * SiteGuard CLI Scanner
 * 
 * Use this to scan websites from the command line.
 * Perfect for finding problems on potential customers' websites.
 * 
 * Usage:
 *   node src/cli-scan.js https://example.com
 *   node src/cli-scan.js https://example.com --email someone@example.com
 */

const scanner = require('./services/scanner');
const email = require('./services/email');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bold: '\x1b[1m'
};

function log(color, text) {
    console.log(color + text + colors.reset);
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
${colors.cyan}╔════════════════════════════════════════════════╗
║          SiteGuard Website Scanner              ║
╚════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Usage:${colors.reset}
  node src/cli-scan.js <website-url> [options]

${colors.bold}Examples:${colors.reset}
  node src/cli-scan.js https://example.com
  node src/cli-scan.js example.com
  node src/cli-scan.js example.com --email owner@example.com

${colors.bold}Options:${colors.reset}
  --email <address>   Send results to this email address
  --quick             Quick check only (just verify site is online)
  --json              Output results as JSON
        `);
        process.exit(0);
    }

    let url = args[0];
    const emailTo = args.includes('--email') ? args[args.indexOf('--email') + 1] : null;
    const quickMode = args.includes('--quick');
    const jsonMode = args.includes('--json');

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (!jsonMode) {
        log(colors.cyan, '\n╔════════════════════════════════════════════════╗');
        log(colors.cyan, '║          SiteGuard Website Scanner              ║');
        log(colors.cyan, '╚════════════════════════════════════════════════╝\n');
        log(colors.white, `Scanning: ${url}\n`);
    }

    try {
        let results;

        if (quickMode) {
            if (!jsonMode) log(colors.yellow, '⏳ Running quick check...\n');
            results = await scanner.quickCheck(url);
            
            if (jsonMode) {
                console.log(JSON.stringify(results, null, 2));
            } else {
                if (results.online) {
                    log(colors.green, `✓ Website is online`);
                    log(colors.white, `  Load time: ${results.loadTime}ms`);
                } else {
                    log(colors.red, `✗ Website is not accessible`);
                    log(colors.white, `  Error: ${results.error}`);
                }
            }
        } else {
            if (!jsonMode) {
                log(colors.yellow, '⏳ Running full scan (this may take 30-60 seconds)...\n');
                
                // Show progress
                const progress = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
                let i = 0;
                const spinner = setInterval(() => {
                    process.stdout.write(`\r${colors.yellow}${progress[i]} Scanning...${colors.reset}`);
                    i = (i + 1) % progress.length;
                }, 100);

                results = await scanner.scanWebsite(url);
                
                clearInterval(spinner);
                process.stdout.write('\r                    \r');
            } else {
                results = await scanner.scanWebsite(url);
            }

            if (jsonMode) {
                console.log(JSON.stringify(results, null, 2));
            } else {
                // Display results
                log(colors.bold, '═══════════════════════════════════════════════\n');
                log(colors.bold, '📊 SCAN RESULTS\n');
                
                // Overall status
                const statusColor = results.status === 'healthy' ? colors.green :
                                  results.status === 'warning' ? colors.yellow : colors.red;
                log(statusColor, `Status: ${results.status.toUpperCase()}`);
                log(colors.white, `Scan completed: ${new Date(results.endTime).toLocaleString()}\n`);

                // Summary
                log(colors.bold, '📈 Summary:');
                log(colors.white, `   Links checked: ${results.summary.totalLinks}`);
                log(colors.white, `   Images found: ${results.summary.totalImages}`);
                log(colors.white, `   Forms found: ${results.summary.totalForms}`);
                log(colors.white, `   Issues found: ${results.summary.issuesFound}\n`);

                // Checks
                log(colors.bold, '✓ Checks:');
                
                if (results.checks.siteOnline) {
                    log(colors.green, `   ✓ Website is online`);
                } else {
                    log(colors.red, `   ✗ Website is not accessible`);
                }

                if (results.checks.loadTime) {
                    const loadColor = results.checks.loadTime < 3000 ? colors.green :
                                     results.checks.loadTime < 5000 ? colors.yellow : colors.red;
                    log(loadColor, `   ${results.checks.loadTime < 3000 ? '✓' : '⚠'} Load time: ${(results.checks.loadTime / 1000).toFixed(1)}s`);
                }

                if (results.checks.brokenLinks.length === 0) {
                    log(colors.green, `   ✓ No broken links found`);
                } else {
                    log(colors.red, `   ✗ ${results.checks.brokenLinks.length} broken link(s)`);
                }

                if (results.checks.brokenImages.length === 0) {
                    log(colors.green, `   ✓ All images loading`);
                } else {
                    log(colors.yellow, `   ⚠ ${results.checks.brokenImages.length} image(s) not loading`);
                }

                if (results.checks.mobileCompatible) {
                    log(colors.green, `   ✓ Mobile compatible`);
                } else if (results.checks.mobileCompatible === false) {
                    log(colors.yellow, `   ⚠ Mobile display issues`);
                }

                // Issues
                if (results.issues.length > 0) {
                    log(colors.bold, '\n⚠️  Issues Found:\n');
                    
                    for (const issue of results.issues) {
                        const icon = issue.severity === 'critical' ? '🔴' :
                                    issue.severity === 'error' ? '🟠' : '🟡';
                        const color = issue.severity === 'critical' ? colors.red :
                                     issue.severity === 'error' ? colors.red : colors.yellow;
                        
                        log(color, `   ${icon} ${issue.title}`);
                        log(colors.white, `      ${issue.description}\n`);
                    }
                } else {
                    log(colors.green, '\n✅ No issues found! Website looks healthy.\n');
                }

                log(colors.bold, '═══════════════════════════════════════════════\n');
            }

            // Send email if requested
            if (emailTo && results.issues.length > 0) {
                log(colors.yellow, `📧 Sending results to ${emailTo}...`);
                
                const emailResult = await email.sendAlertEmail(
                    emailTo,
                    url,
                    url,
                    results.issues
                );

                if (emailResult.success) {
                    log(colors.green, '✓ Email sent successfully\n');
                } else {
                    log(colors.red, `✗ Failed to send email: ${emailResult.error}\n`);
                }
            }
        }

    } catch (error) {
        if (jsonMode) {
            console.log(JSON.stringify({ error: error.message }, null, 2));
        } else {
            log(colors.red, `\n✗ Error: ${error.message}\n`);
        }
        process.exit(1);
    }

    await scanner.close();
    process.exit(0);
}

main();
