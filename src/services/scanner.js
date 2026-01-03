const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

class WebsiteScanner {
    constructor() {
        this.timeout = 30000; // 30 seconds
        this.maxLinks = 20; // Max links to check
    }

    async scanWebsite(url) {
        const results = {
            id: uuidv4(),
            url: url,
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'running',
            checks: {
                siteOnline: null,
                loadTime: null,
                brokenLinks: [],
                brokenImages: [],
                forms: [],
                pageErrors: []
            },
            summary: {
                totalPages: 1,
                totalLinks: 0,
                totalImages: 0,
                totalForms: 0,
                issuesFound: 0
            },
            issues: []
        };

        try {
            console.log(`Scanning: ${url}`);

            // Step 1: Check if site is online and measure load time
            const startLoad = Date.now();
            let response;
            
            try {
                response = await axios.get(url, {
                    timeout: this.timeout,
                    headers: {
                        'User-Agent': 'SiteGuard Website Monitor/1.0 (https://siteguard.com)'
                    },
                    validateStatus: () => true // Accept all status codes
                });

                const loadTime = Date.now() - startLoad;
                results.checks.loadTime = loadTime;

                if (response.status >= 400) {
                    results.checks.siteOnline = false;
                    results.issues.push({
                        id: uuidv4(),
                        type: 'site_down',
                        severity: 'critical',
                        title: 'Website returned an error',
                        description: `The website returned status code ${response.status}`,
                        url: url
                    });
                } else {
                    results.checks.siteOnline = true;

                    // Check load time
                    if (loadTime > 5000) {
                        results.issues.push({
                            id: uuidv4(),
                            type: 'slow_loading',
                            severity: 'warning',
                            title: 'Website loads slowly',
                            description: `Page took ${(loadTime / 1000).toFixed(1)} seconds to load. Visitors expect under 3 seconds.`,
                            url: url
                        });
                    }
                }
            } catch (error) {
                results.checks.siteOnline = false;
                results.issues.push({
                    id: uuidv4(),
                    type: 'site_down',
                    severity: 'critical',
                    title: 'Website is not accessible',
                    description: error.code === 'ECONNABORTED' 
                        ? 'Website took too long to respond'
                        : `Could not connect: ${error.message}`,
                    url: url
                });
                results.status = 'error';
                results.endTime = new Date().toISOString();
                return results;
            }

            // Parse HTML
            const $ = cheerio.load(response.data);

            // Step 2: Collect and check links
            const links = [];
            $('a[href]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim().substring(0, 50) || '[No text]';
                
                if (href && href.startsWith('http') && !href.includes('javascript:') && 
                    !href.includes('mailto:') && !href.includes('tel:')) {
                    links.push({ href, text });
                }
            });

            results.summary.totalLinks = links.length;

            // Check a sample of links
            const linksToCheck = links.slice(0, this.maxLinks);
            for (const link of linksToCheck) {
                try {
                    const linkResponse = await axios.head(link.href, {
                        timeout: 10000,
                        validateStatus: () => true,
                        headers: {
                            'User-Agent': 'SiteGuard Website Monitor/1.0'
                        }
                    });

                    if (linkResponse.status >= 400) {
                        results.checks.brokenLinks.push({
                            ...link,
                            status: linkResponse.status
                        });
                    }
                } catch (error) {
                    // Link might be down or blocking HEAD requests
                    results.checks.brokenLinks.push({
                        ...link,
                        error: error.message
                    });
                }
            }

            if (results.checks.brokenLinks.length > 0) {
                // Build specific list of broken links
                const brokenLinkDetails = results.checks.brokenLinks.slice(0, 5).map(link => {
                    return `"${link.text}" → ${link.href}`;
                }).join('; ');
                
                results.issues.push({
                    id: uuidv4(),
                    type: 'broken_links',
                    severity: 'error',
                    title: `${results.checks.brokenLinks.length} broken link(s) found`,
                    description: `These links lead to error pages: ${brokenLinkDetails}${results.checks.brokenLinks.length > 5 ? ` (and ${results.checks.brokenLinks.length - 5} more)` : ''}`,
                    url: url,
                    brokenLinks: results.checks.brokenLinks
                });
            }

            // Step 3: Check images
            const images = [];
            $('img').each((i, el) => {
                const src = $(el).attr('src');
                const alt = $(el).attr('alt') || '[No alt text]';
                if (src) {
                    // Convert relative URLs to absolute
                    let absoluteSrc = src;
                    if (src.startsWith('/')) {
                        const urlObj = new URL(url);
                        absoluteSrc = `${urlObj.protocol}//${urlObj.host}${src}`;
                    } else if (!src.startsWith('http')) {
                        absoluteSrc = new URL(src, url).href;
                    }
                    images.push({ src: absoluteSrc, alt });
                }
            });

            results.summary.totalImages = images.length;

            // Check a sample of images
            const imagesToCheck = images.slice(0, 10);
            for (const img of imagesToCheck) {
                try {
                    const imgResponse = await axios.head(img.src, {
                        timeout: 5000,
                        validateStatus: () => true
                    });

                    if (imgResponse.status >= 400) {
                        results.checks.brokenImages.push(img);
                    }
                } catch (error) {
                    results.checks.brokenImages.push(img);
                }
            }

            if (results.checks.brokenImages.length > 0) {
                // Build specific list of broken images
                const brokenImageDetails = results.checks.brokenImages.slice(0, 3).map(img => {
                    // Extract just the filename from the path
                    const filename = img.src.split('/').pop().split('?')[0];
                    const altText = img.alt !== '[No alt text]' ? ` (${img.alt})` : '';
                    return `"${filename}"${altText}`;
                }).join(', ');
                
                results.issues.push({
                    id: uuidv4(),
                    type: 'broken_images',
                    severity: 'warning',
                    title: `${results.checks.brokenImages.length} image(s) not loading`,
                    description: `These images are broken or missing: ${brokenImageDetails}${results.checks.brokenImages.length > 3 ? ` (and ${results.checks.brokenImages.length - 3} more)` : ''}`,
                    url: url,
                    brokenImages: results.checks.brokenImages
                });
            }

            // Step 4: Find forms
            const forms = [];
            $('form').each((i, el) => {
                const $form = $(el);
                const action = $form.attr('action') || '';
                const method = $form.attr('method') || 'get';
                const inputs = $form.find('input, textarea, select').length;
                const hasEmail = $form.find('input[type="email"], input[name*="email"]').length > 0;
                const hasSubmit = $form.find('button[type="submit"], input[type="submit"]').length > 0;
                
                const isContactForm = action.includes('contact') || 
                                     $form.attr('id')?.includes('contact') ||
                                     $form.attr('class')?.includes('contact') ||
                                     $form.find('textarea').length > 0;

                // NEW: Collect specific form identification
                let formName = '';
                
                // Try to find a heading before or inside the form
                const $prevHeading = $form.prev('h1, h2, h3, h4, h5, h6');
                if ($prevHeading.length) {
                    formName = $prevHeading.text().trim();
                }
                if (!formName) {
                    const $innerHeading = $form.find('h1, h2, h3, h4, h5, h6').first();
                    if ($innerHeading.length) {
                        formName = $innerHeading.text().trim();
                    }
                }
                // Try legend
                if (!formName) {
                    const $legend = $form.find('legend').first();
                    if ($legend.length) {
                        formName = $legend.text().trim();
                    }
                }
                // Try form id or name
                if (!formName) {
                    formName = $form.attr('id') || $form.attr('name') || '';
                }
                // Try submit button text
                let submitButtonText = '';
                const $submitBtn = $form.find('button[type="submit"], input[type="submit"]').first();
                if ($submitBtn.length) {
                    submitButtonText = $submitBtn.text().trim() || $submitBtn.attr('value') || '';
                }
                
                // Find which page section this form is in
                let pageSection = '';
                const $parent = $form.closest('[id]');
                if ($parent.length) {
                    pageSection = $parent.attr('id');
                }
                
                // Detect language hints
                const formText = $form.text().toLowerCase();
                let language = 'unknown';
                if (formText.includes('gönder') || formText.includes('iletişim')) language = 'Turkish';
                else if (formText.includes('send') || formText.includes('contact')) language = 'English';
                else if (formText.includes('senden') || formText.includes('kontakt')) language = 'German';
                else if (formText.includes('envoyer') || formText.includes('contactez')) language = 'French';
                else if (formText.includes('enviar') || formText.includes('contacto')) language = 'Spanish';

                forms.push({
                    index: i + 1,  // 1-based for human readability
                    action,
                    method,
                    inputs,
                    hasEmail,
                    hasSubmit,
                    isContactForm,
                    // Specific identification
                    formName: formName.substring(0, 50),
                    submitButtonText: submitButtonText.substring(0, 30),
                    pageSection,
                    formId: $form.attr('id') || null,
                    language,
                    pageUrl: url
                });
            });

            results.summary.totalForms = forms.length;
            results.checks.forms = forms;

            // Check for potential form issues
            const contactForms = forms.filter(f => f.isContactForm || f.hasEmail);
            for (const form of contactForms) {
                if (!form.hasSubmit) {
                    // Build a specific description of which form
                    let formIdentifier = '';
                    if (form.formName) {
                        formIdentifier = `"${form.formName}"`;
                    } else if (form.formId) {
                        formIdentifier = `form #${form.formId}`;
                    } else if (form.submitButtonText) {
                        formIdentifier = `form with "${form.submitButtonText}" button`;
                    } else {
                        formIdentifier = `form #${form.index} on the page`;
                    }
                    
                    let languageNote = '';
                    if (form.language !== 'unknown') {
                        languageNote = ` (${form.language} version)`;
                    }
                    
                    let locationNote = '';
                    if (form.pageSection) {
                        locationNote = ` in the "${form.pageSection}" section`;
                    }

                    results.issues.push({
                        id: uuidv4(),
                        type: 'form_issue',
                        severity: 'warning',
                        title: `Contact form may be missing submit button`,
                        description: `The ${formIdentifier}${languageNote}${locationNote} appears to be missing a working submit button.`,
                        url: url,
                        formDetails: form
                    });
                }
            }

            // Step 5: Check for basic SEO/accessibility issues
            const title = $('title').text().trim();
            if (!title) {
                results.issues.push({
                    id: uuidv4(),
                    type: 'seo_issue',
                    severity: 'warning',
                    title: 'Missing page title',
                    description: 'The page is missing a title tag, which is important for search engines.',
                    url: url
                });
            }

            const metaDescription = $('meta[name="description"]').attr('content');
            if (!metaDescription) {
                results.issues.push({
                    id: uuidv4(),
                    type: 'seo_issue',
                    severity: 'warning',
                    title: 'Missing meta description',
                    description: 'The page is missing a meta description, which helps with search engine visibility.',
                    url: url
                });
            }

            // Check for viewport meta tag (mobile friendliness indicator)
            const viewport = $('meta[name="viewport"]').attr('content');
            if (!viewport) {
                results.issues.push({
                    id: uuidv4(),
                    type: 'mobile_issue',
                    severity: 'warning',
                    title: 'May not be mobile-friendly',
                    description: 'The page is missing a viewport meta tag, which usually means it won\'t display well on phones.',
                    url: url
                });
            }

            // Finalize results
            results.summary.issuesFound = results.issues.length;
            results.status = results.issues.some(i => i.severity === 'critical') ? 'critical' :
                           results.issues.some(i => i.severity === 'error') ? 'error' :
                           results.issues.length > 0 ? 'warning' : 'healthy';
            results.endTime = new Date().toISOString();

            return results;

        } catch (error) {
            console.error('Scan error:', error);
            results.status = 'error';
            results.endTime = new Date().toISOString();
            results.issues.push({
                id: uuidv4(),
                type: 'scan_error',
                severity: 'critical',
                title: 'Could not complete scan',
                description: error.message,
                url: url
            });
            return results;
        }
    }

    // Quick check - just verify site is online
    async quickCheck(url) {
        try {
            const startTime = Date.now();
            const response = await axios.get(url, {
                timeout: 15000,
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'SiteGuard Website Monitor/1.0'
                }
            });
            const loadTime = Date.now() - startTime;

            return {
                online: response.status < 400,
                statusCode: response.status,
                loadTime: loadTime
            };
        } catch (error) {
            return {
                online: false,
                error: error.message
            };
        }
    }

    // No-op for compatibility with old API
    async initialize() {}
    async close() {}
}

module.exports = new WebsiteScanner();
