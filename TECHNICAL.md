# TECHNICAL.md - Developer Documentation

## Architecture Overview

This is a website monitoring SaaS application.

### Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla - keeping it simple)
- **Backend:** Node.js with Express
- **Database:** SQLite (simple, no server needed, can migrate to PostgreSQL for scale)
- **Website Scanning:** Puppeteer (headless Chrome for realistic browser testing)
- **Email:** Nodemailer (will configure with SMTP provider)
- **Scheduling:** Node-cron for hourly checks
- **Payment:** Integration with Turkish payment systems TBD (iyzico, PayTR, or similar)

### Why These Choices

1. **Puppeteer over simple HTTP requests:** Must test forms, buttons, JavaScript-heavy sites
2. **SQLite to start:** Zero config, embedded, easy backup, sufficient for MVP
3. **Vanilla JS frontend:** No build step, fast iteration, easy to modify
4. **Node.js:** Good Puppeteer support, async-friendly for many concurrent checks

### Cost Optimization Strategy

- Run checks in batches to minimize concurrent browser instances
- Cache static analysis results (broken images don't need rechecking every hour)
- Use lightweight checks first, deep checks only when needed
- Consider serverless for scanner workers at scale

### Database Schema

```sql
users (id, email, password_hash, created_at, subscription_status)
websites (id, user_id, url, check_interval, last_checked, status)
checks (id, website_id, timestamp, status, details_json)
alerts (id, check_id, sent_at, email_to, alert_type)
```

### Scanner Capabilities

1. **Availability check:** Does the site respond?
2. **Page load check:** Do all pages load without errors?
3. **Link check:** Crawl and verify all internal links
4. **Image check:** All images load successfully?
5. **Form check:** Submit forms, verify no error state
6. **Performance check:** Load time within acceptable range
7. **Mobile check:** Renders correctly in mobile viewport

### Email Alert Triggers

- Site completely unreachable
- Page returns error status (4xx, 5xx)
- Broken links detected
- Missing images
- Form submission fails
- Load time exceeds threshold
- Recovery notification when issue resolves

### Security Considerations

- Password hashing with bcrypt
- Rate limiting on all endpoints
- CSRF protection
- Input sanitization
- Secure session management

### Scaling Path

1. MVP: Single server, SQLite, direct Puppeteer
2. Growth: PostgreSQL, Redis queue, worker processes
3. Scale: Distributed workers, cloud browser pools, CDN for frontend

### File Structure

```
/project
  /public          - Static frontend files
  /src
    /routes        - API endpoints
    /services      - Business logic
    /scanner       - Website checking logic
    /email         - Alert system
    /db            - Database operations
  /tests           - Automated tests
```
