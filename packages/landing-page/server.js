import express from 'express';
import { neon } from '@neondatabase/serverless';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Neon connection
const DATABASE_URL = process.env.DATABASE_URL;
let sql = null;

if (DATABASE_URL) {
  sql = neon(DATABASE_URL);
  console.log('Connected to Neon database');
  initDatabase().catch(console.error);
} else {
  console.warn('DATABASE_URL not set - database features disabled');
}

async function initDatabase() {
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      source TEXT DEFAULT 'landing',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      type TEXT DEFAULT 'general',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      email TEXT,
      system_info JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Telemetry tables
  await sql`
    CREATE TABLE IF NOT EXISTS crash_reports (
      id SERIAL PRIMARY KEY,
      device_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      os TEXT,
      os_version TEXT,
      arch TEXT,
      error_type TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS usage_events (
      id SERIAL PRIMARY KEY,
      device_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      event_name TEXT NOT NULL,
      properties JSONB,
      session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Index for querying
  await sql`CREATE INDEX IF NOT EXISTS idx_crash_reports_created ON crash_reports(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_crash_reports_device ON crash_reports(device_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_name ON usage_events(event_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_events_device ON usage_events(device_id)`;

  console.log('Database tables initialized');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/subscribe', async (req, res) => {
  const { email, source } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  if (!sql) {
    console.log(`[NO DB] New subscriber: ${email}`);
    return res.json({ success: true });
  }

  try {
    await sql`
      INSERT INTO subscribers (email, source)
      VALUES (${email}, ${source || 'landing'})
      ON CONFLICT (email) DO NOTHING
    `;
    console.log(`New subscriber: ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save email:', err);
    res.json({ success: true });
  }
});

app.get('/api/subscribers', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ count: 0, subscribers: [], message: 'Database not configured' });
  }

  try {
    const subscribers = await sql`
      SELECT id, email, source, created_at
      FROM subscribers
      ORDER BY created_at DESC
    `;
    res.json({ count: subscribers.length, subscribers });
  } catch (err) {
    console.error('Failed to read subscribers:', err);
    res.status(500).json({ error: 'Failed to read subscribers' });
  }
});

// Export subscribers as CSV
app.get('/api/subscribers/export', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const subscribers = await sql`
      SELECT email, source, created_at
      FROM subscribers
      ORDER BY created_at DESC
    `;

    const csv = ['email,source,created_at'];
    for (const sub of subscribers) {
      csv.push(`${sub.email},${sub.source},${sub.created_at}`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
    res.send(csv.join('\n'));
  } catch (err) {
    console.error('Failed to export subscribers:', err);
    res.status(500).json({ error: 'Failed to export subscribers' });
  }
});

// Feedback endpoint - CORS preflight
app.options('/api/feedback', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { type, title, description, email, systemInfo } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  if (!sql) {
    console.log(`[NO DB] Feedback [${type}]: ${title}`);
    return res.json({ success: true, id: Date.now().toString(36) });
  }

  try {
    const result = await sql`
      INSERT INTO feedback (type, title, description, email, system_info)
      VALUES (${type || 'general'}, ${title}, ${description}, ${email || null}, ${systemInfo ? JSON.stringify(systemInfo) : null})
      RETURNING id
    `;

    console.log(`New feedback [${type}]: ${title}`);
    res.json({ success: true, id: result[0].id });
  } catch (err) {
    console.error('Failed to save feedback:', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

app.get('/api/feedback', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ count: 0, feedback: [], message: 'Database not configured' });
  }

  try {
    const feedback = await sql`
      SELECT id, type, title, description, email, system_info, created_at
      FROM feedback
      ORDER BY created_at DESC
    `;
    res.json({ count: feedback.length, feedback });
  } catch (err) {
    console.error('Failed to read feedback:', err);
    res.status(500).json({ error: 'Failed to read feedback' });
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ message: 'Database not configured' });
  }

  try {
    const [subCount] = await sql`SELECT COUNT(*) as count FROM subscribers`;
    const [feedbackCount] = await sql`SELECT COUNT(*) as count FROM feedback`;
    const [todaySubs] = await sql`
      SELECT COUNT(*) as count FROM subscribers
      WHERE created_at >= CURRENT_DATE
    `;
    const [weekSubs] = await sql`
      SELECT COUNT(*) as count FROM subscribers
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;

    res.json({
      subscribers: {
        total: parseInt(subCount.count),
        today: parseInt(todaySubs.count),
        thisWeek: parseInt(weekSubs.count),
      },
      feedback: {
        total: parseInt(feedbackCount.count),
      },
    });
  } catch (err) {
    console.error('Failed to get stats:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================
// OTA Update Endpoints for Tauri Updater
// ============================================

// Initialize releases table
async function initReleasesTable() {
  if (!sql) return;

  await sql`
    CREATE TABLE IF NOT EXISTS releases (
      id SERIAL PRIMARY KEY,
      version TEXT UNIQUE NOT NULL,
      notes TEXT,
      pub_date TIMESTAMPTZ DEFAULT NOW(),
      platforms JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('Releases table initialized');
}

// Call after main initDatabase
if (DATABASE_URL) {
  initReleasesTable().catch(console.error);
}

// Public endpoint - returns latest release for Tauri updater
app.get('/api/updates/latest.json', async (req, res) => {
  // Set CORS headers for Tauri app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!sql) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const [release] = await sql`
      SELECT version, notes, pub_date, platforms
      FROM releases
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!release) {
      return res.status(404).json({ error: 'No releases found' });
    }

    // Format for Tauri updater
    res.json({
      version: release.version,
      notes: release.notes || `Release ${release.version}`,
      pub_date: release.pub_date,
      platforms: release.platforms
    });
  } catch (err) {
    console.error('Failed to get latest release:', err);
    res.status(500).json({ error: 'Failed to get release info' });
  }
});

// Admin endpoint - create new release
app.post('/api/releases', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { version, notes, platforms } = req.body;

  if (!version || !platforms) {
    return res.status(400).json({ error: 'Version and platforms are required' });
  }

  if (!sql) {
    console.log(`[NO DB] New release: ${version}`);
    return res.json({ success: true, version });
  }

  try {
    await sql`
      INSERT INTO releases (version, notes, platforms)
      VALUES (${version}, ${notes || ''}, ${JSON.stringify(platforms)})
      ON CONFLICT (version) DO UPDATE SET
        notes = EXCLUDED.notes,
        platforms = EXCLUDED.platforms,
        pub_date = NOW()
    `;

    console.log(`New release published: ${version}`);
    res.json({ success: true, version });
  } catch (err) {
    console.error('Failed to create release:', err);
    res.status(500).json({ error: 'Failed to create release' });
  }
});

// Admin endpoint - list all releases
app.get('/api/releases', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ releases: [], message: 'Database not configured' });
  }

  try {
    const releases = await sql`
      SELECT id, version, notes, pub_date, platforms, created_at
      FROM releases
      ORDER BY created_at DESC
    `;
    res.json({ count: releases.length, releases });
  } catch (err) {
    console.error('Failed to list releases:', err);
    res.status(500).json({ error: 'Failed to list releases' });
  }
});

// Admin endpoint - delete a release
app.delete('/api/releases/:version', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { version } = req.params;

  if (!sql) {
    return res.json({ success: true });
  }

  try {
    await sql`DELETE FROM releases WHERE version = ${version}`;
    console.log(`Release deleted: ${version}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete release:', err);
    res.status(500).json({ error: 'Failed to delete release' });
  }
});

// GCS bucket for releases (no GitHub login required)
const GCS_RELEASES_URL = 'https://storage.googleapis.com/navi-releases';

// Public endpoint - get app info (version, download links)
app.get('/api/app-info', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!sql) {
    // Fallback to package.json version
    const packageJson = await import('./package.json', { assert: { type: 'json' } });
    const version = packageJson.default.version;
    return res.json({
      version,
      downloads: {
        macosArm: `${GCS_RELEASES_URL}/Navi_${version}_aarch64.dmg`,
        macosIntel: `${GCS_RELEASES_URL}/Navi_${version}_x64.dmg`,
        linux: `${GCS_RELEASES_URL}/Navi_${version}_amd64.AppImage`,
        windows: `${GCS_RELEASES_URL}/Navi_${version}_x64-setup.exe`
      }
    });
  }

  try {
    const [release] = await sql`
      SELECT version, pub_date
      FROM releases
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const version = release?.version || '1.1.0';

    res.json({
      version,
      pubDate: release?.pub_date,
      downloads: {
        macosArm: `${GCS_RELEASES_URL}/Navi_${version}_aarch64.dmg`,
        macosIntel: `${GCS_RELEASES_URL}/Navi_${version}_x64.dmg`,
        linux: `${GCS_RELEASES_URL}/Navi_${version}_amd64.AppImage`,
        windows: `${GCS_RELEASES_URL}/Navi_${version}_x64-setup.exe`
      }
    });
  } catch (err) {
    console.error('Failed to get app info:', err);
    res.status(500).json({ error: 'Failed to get app info' });
  }
});

app.get('/downloads/*', (req, res) => {
  const filePath = path.join(__dirname, 'dist', req.path);
  res.download(filePath);
});

// ============================================
// Telemetry Endpoints
// ============================================

// Crash reports - public endpoint (no auth required for clients)
app.post('/api/telemetry/crash', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { deviceId, appVersion, os, osVersion, arch, errorType, message, stack, context } = req.body;

  if (!deviceId || !appVersion || !message) {
    return res.status(400).json({ error: 'deviceId, appVersion, and message are required' });
  }

  if (!sql) {
    console.log(`[NO DB] Crash report: ${errorType} - ${message}`);
    return res.json({ success: true });
  }

  try {
    const result = await sql`
      INSERT INTO crash_reports (device_id, app_version, os, os_version, arch, error_type, message, stack, context)
      VALUES (${deviceId}, ${appVersion}, ${os || null}, ${osVersion || null}, ${arch || null},
              ${errorType || 'unknown'}, ${message}, ${stack || null}, ${context ? JSON.stringify(context) : null})
      RETURNING id
    `;

    console.log(`Crash report received: ${errorType} - ${message.substring(0, 50)}...`);
    res.json({ success: true, id: result[0].id });
  } catch (err) {
    console.error('Failed to save crash report:', err);
    res.status(500).json({ error: 'Failed to save crash report' });
  }
});

// Usage events - batch endpoint
app.post('/api/telemetry/events', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { deviceId, appVersion, events } = req.body;

  if (!deviceId || !appVersion || !events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'deviceId, appVersion, and events array are required' });
  }

  if (!sql) {
    console.log(`[NO DB] ${events.length} usage events from ${deviceId}`);
    return res.json({ success: true, count: events.length });
  }

  try {
    let inserted = 0;
    for (const event of events) {
      if (!event.name) continue;

      await sql`
        INSERT INTO usage_events (device_id, app_version, event_name, properties, session_id)
        VALUES (${deviceId}, ${appVersion}, ${event.name},
                ${event.properties ? JSON.stringify(event.properties) : null},
                ${event.sessionId || null})
      `;
      inserted++;
    }

    console.log(`Received ${inserted} usage events from ${deviceId.substring(0, 8)}...`);
    res.json({ success: true, count: inserted });
  } catch (err) {
    console.error('Failed to save usage events:', err);
    res.status(500).json({ error: 'Failed to save usage events' });
  }
});

// CORS preflight for telemetry endpoints
app.options('/api/telemetry/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Admin endpoint - view crash reports
app.get('/api/telemetry/crashes', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ count: 0, crashes: [], message: 'Database not configured' });
  }

  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const crashes = await sql`
      SELECT id, device_id, app_version, os, os_version, arch, error_type, message, stack, context, created_at
      FROM crash_reports
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`SELECT COUNT(*) as count FROM crash_reports`;

    res.json({ count: parseInt(count), crashes });
  } catch (err) {
    console.error('Failed to read crash reports:', err);
    res.status(500).json({ error: 'Failed to read crash reports' });
  }
});

// Admin endpoint - view usage events
app.get('/api/telemetry/usage', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ count: 0, events: [], message: 'Database not configured' });
  }

  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const eventName = req.query.event;

  try {
    let events;
    let countResult;

    if (eventName) {
      events = await sql`
        SELECT id, device_id, app_version, event_name, properties, session_id, created_at
        FROM usage_events
        WHERE event_name = ${eventName}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`SELECT COUNT(*) as count FROM usage_events WHERE event_name = ${eventName}`;
    } else {
      events = await sql`
        SELECT id, device_id, app_version, event_name, properties, session_id, created_at
        FROM usage_events
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`SELECT COUNT(*) as count FROM usage_events`;
    }

    res.json({ count: parseInt(countResult[0].count), events });
  } catch (err) {
    console.error('Failed to read usage events:', err);
    res.status(500).json({ error: 'Failed to read usage events' });
  }
});

// Admin endpoint - telemetry stats/dashboard data
app.get('/api/telemetry/stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!sql) {
    return res.json({ message: 'Database not configured' });
  }

  try {
    // Crash stats
    const [crashTotal] = await sql`SELECT COUNT(*) as count FROM crash_reports`;
    const [crashToday] = await sql`SELECT COUNT(*) as count FROM crash_reports WHERE created_at >= CURRENT_DATE`;
    const [crashWeek] = await sql`SELECT COUNT(*) as count FROM crash_reports WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`;

    // Top errors
    const topErrors = await sql`
      SELECT error_type, message, COUNT(*) as count
      FROM crash_reports
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY error_type, message
      ORDER BY count DESC
      LIMIT 10
    `;

    // Usage stats
    const [eventTotal] = await sql`SELECT COUNT(*) as count FROM usage_events`;
    const [eventToday] = await sql`SELECT COUNT(*) as count FROM usage_events WHERE created_at >= CURRENT_DATE`;

    // Unique users (devices)
    const [uniqueDevices] = await sql`SELECT COUNT(DISTINCT device_id) as count FROM usage_events`;
    const [activeToday] = await sql`SELECT COUNT(DISTINCT device_id) as count FROM usage_events WHERE created_at >= CURRENT_DATE`;
    const [activeWeek] = await sql`SELECT COUNT(DISTINCT device_id) as count FROM usage_events WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`;

    // Top events
    const topEvents = await sql`
      SELECT event_name, COUNT(*) as count
      FROM usage_events
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY event_name
      ORDER BY count DESC
      LIMIT 15
    `;

    // Events by day (last 14 days)
    const eventsByDay = await sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM usage_events
      WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    // Version distribution
    const versionDist = await sql`
      SELECT app_version, COUNT(DISTINCT device_id) as users
      FROM usage_events
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY app_version
      ORDER BY users DESC
    `;

    res.json({
      crashes: {
        total: parseInt(crashTotal.count),
        today: parseInt(crashToday.count),
        thisWeek: parseInt(crashWeek.count),
        topErrors,
      },
      usage: {
        totalEvents: parseInt(eventTotal.count),
        eventsToday: parseInt(eventToday.count),
        topEvents,
        eventsByDay,
      },
      users: {
        total: parseInt(uniqueDevices.count),
        activeToday: parseInt(activeToday.count),
        activeThisWeek: parseInt(activeWeek.count),
        versionDistribution: versionDist,
      },
    });
  } catch (err) {
    console.error('Failed to get telemetry stats:', err);
    res.status(500).json({ error: 'Failed to get telemetry stats' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
