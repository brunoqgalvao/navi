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

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
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
        macosArm: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_aarch64.dmg`,
        macosIntel: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_x64.dmg`,
        linux: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_amd64.AppImage`,
        windows: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_x64-setup.exe`
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

    const version = release?.version || '0.2.1';

    res.json({
      version,
      pubDate: release?.pub_date,
      downloads: {
        macosArm: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_aarch64.dmg`,
        macosIntel: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_x64.dmg`,
        linux: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_amd64.AppImage`,
        windows: `https://github.com/brunoqgalvao/navi/releases/download/v${version}/Navi_${version}_x64-setup.exe`
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
