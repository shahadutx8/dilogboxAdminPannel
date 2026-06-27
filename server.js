'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const crypto  = require('crypto');
const { Pool } = require('pg');

const PORT   = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

const db = { query: (text, params) => pool.query(text, params) };

const DEFAULT_FIELDS = [
  ['dialog_enabled',   true,  'সম্পূর্ণ Dialog চালু'],
  ['show_device_id',   true,  'Device ID'],
  ['show_device_name', true,  'Device Name'],
  ['show_model',       true,  'Model'],
  ['show_android',     true,  'Android Version'],
  ['show_imei',        true,  'IMEI'],
  ['show_last_url',    true,  'Last URL'],
  ['show_ipv4',        true,  'IPv4'],
  ['show_ipv6',        true,  'IPv6'],
  ['show_ipv6_check',  true,  'IPv6 Check (Withdrawal)'],
];

async function seedAppConfig(appId) {
  for (const [key, enabled, label] of DEFAULT_FIELDS) {
    await db.query(
      `INSERT INTO dialog_config (app_id, key, enabled, label)
       VALUES ($1, $2, $3, $4) ON CONFLICT (app_id, key) DO NOTHING`,
      [appId, key, enabled, label]
    );
  }
}

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS apps (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS dialog_config (
      id SERIAL PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      label TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(app_id, key)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_admins (
      id SERIAL PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(app_id, username)
    )
  `);

  const { rows: admins } = await db.query('SELECT id FROM admin_users LIMIT 1');
  if (admins.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await db.query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
      ['admin', hash]
    );
    console.log('[init] Default super-admin: admin / admin123');
  }

  const { rows: existingApps } = await db.query('SELECT id FROM apps LIMIT 1');
  if (existingApps.length === 0) {
    const apiKey = crypto.randomBytes(16).toString('hex');
    const { rows } = await db.query(
      'INSERT INTO apps (name, api_key) VALUES ($1, $2) RETURNING id',
      ['Default App', apiKey]
    );
    await seedAppConfig(rows[0].id);
    console.log('[init] Default app created, api_key:', apiKey);
  } else {
    const { rows: allApps } = await db.query('SELECT id FROM apps');
    for (const app of allApps) await seedAppConfig(app.id);
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────
function signToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, SECRET, { expiresIn });
}

function requireSuperAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const d = jwt.verify(auth.slice(7), SECRET);
    if (d.role !== 'super') return res.status(403).json({ error: 'Forbidden' });
    req.adminId = d.id; req.adminUsername = d.username;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireAppAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const d = jwt.verify(auth.slice(7), SECRET);
    if (d.role !== 'app') return res.status(403).json({ error: 'Forbidden' });
    if (d.apiKey !== req.params.apiKey) return res.status(403).json({ error: 'Forbidden' });
    req.appAdminId = d.id; req.appAdminUsername = d.username; req.appId = d.appId;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static: super admin panel
app.use('/api/admin-panel', express.static(path.join(__dirname, 'public', 'admin')));

// Static: per-app admin panel
app.use('/panel/:apiKey', express.static(path.join(__dirname, 'public', 'app-panel')));

// ── Super admin auth ──────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const { rows } = await db.query('SELECT * FROM admin_users WHERE username = $1 LIMIT 1', [username]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ id: rows[0].id, username: rows[0].username, role: 'super' });
  res.json({ token, username: rows[0].username });
});

app.put('/api/admin/password', requireSuperAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Fields required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
  const { rows } = await db.query('SELECT * FROM admin_users WHERE id = $1 LIMIT 1', [req.adminId]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, req.adminId]);
  res.json({ success: true });
});

// ── Apps CRUD (super admin) ───────────────────────────────────────────────────
app.get('/api/admin/apps', requireSuperAuth, async (_req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, api_key, created_at FROM apps ORDER BY created_at ASC'
  );
  res.json(rows);
});

app.post('/api/admin/apps', requireSuperAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'App name required' });
  const apiKey = crypto.randomBytes(16).toString('hex');
  const { rows } = await db.query(
    'INSERT INTO apps (name, api_key) VALUES ($1, $2) RETURNING id, name, api_key, created_at',
    [name.trim(), apiKey]
  );
  await seedAppConfig(rows[0].id);
  res.json(rows[0]);
});

app.put('/api/admin/apps/:id', requireSuperAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'App name required' });
  const { rows } = await db.query(
    'UPDATE apps SET name = $1 WHERE id = $2 RETURNING id, name, api_key, created_at',
    [name.trim(), req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'App not found' });
  res.json(rows[0]);
});

app.delete('/api/admin/apps/:id', requireSuperAuth, async (req, res) => {
  const { rows: all } = await db.query('SELECT id FROM apps');
  if (all.length <= 1) return res.status(400).json({ error: 'কমপক্ষে একটি app থাকতে হবে' });
  await db.query('DELETE FROM apps WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Per-app config (super admin) ──────────────────────────────────────────────
app.get('/api/admin/apps/:id/config', requireSuperAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT key, enabled, label, updated_at FROM dialog_config WHERE app_id = $1 ORDER BY key',
    [req.params.id]
  );
  res.json(rows);
});

app.put('/api/admin/apps/:id/config', requireSuperAuth, async (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array' });
  for (const { key, enabled } of updates) {
    await db.query(
      'UPDATE dialog_config SET enabled = $1, updated_at = NOW() WHERE app_id = $2 AND key = $3',
      [enabled, req.params.id, key]
    );
  }
  const { rows } = await db.query(
    'SELECT key, enabled, label, updated_at FROM dialog_config WHERE app_id = $1 ORDER BY key',
    [req.params.id]
  );
  res.json(rows);
});

// ── Per-app admins management (super admin) ───────────────────────────────────
app.get('/api/admin/apps/:id/admins', requireSuperAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, username, created_at FROM app_admins WHERE app_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json(rows);
});

app.post('/api/admin/apps/:id/admins', requireSuperAuth, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: 'Username required' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO app_admins (app_id, username, password_hash) VALUES ($1, $2, $3) RETURNING id, username, created_at',
      [req.params.id, username.trim(), hash]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already exists for this app' });
    throw e;
  }
});

app.put('/api/admin/apps/:id/admins/:adminId/password', requireSuperAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Min 4 characters' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    'UPDATE app_admins SET password_hash = $1 WHERE id = $2 AND app_id = $3 RETURNING id',
    [hash, req.params.adminId, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
  res.json({ success: true });
});

app.delete('/api/admin/apps/:id/admins/:adminId', requireSuperAuth, async (req, res) => {
  await db.query('DELETE FROM app_admins WHERE id = $1 AND app_id = $2', [req.params.adminId, req.params.id]);
  res.json({ success: true });
});

// ── Per-app panel auth & config ───────────────────────────────────────────────
app.post('/api/panel/:apiKey/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Fields required' });

  const { rows: appRows } = await db.query('SELECT id, name FROM apps WHERE api_key = $1', [req.params.apiKey]);
  if (!appRows.length) return res.status(404).json({ error: 'App not found' });
  const appId = appRows[0].id;

  const { rows } = await db.query(
    'SELECT * FROM app_admins WHERE app_id = $1 AND username = $2 LIMIT 1',
    [appId, username]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ id: rows[0].id, username: rows[0].username, role: 'app', appId, apiKey: req.params.apiKey });
  res.json({ token, username: rows[0].username, appName: appRows[0].name });
});

app.get('/api/panel/:apiKey/config', requireAppAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT key, enabled, label, updated_at FROM dialog_config WHERE app_id = $1 ORDER BY key',
    [req.appId]
  );
  res.json(rows);
});

app.put('/api/panel/:apiKey/config', requireAppAuth, async (req, res) => {
  const updates = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array' });
  for (const { key, enabled } of updates) {
    await db.query(
      'UPDATE dialog_config SET enabled = $1, updated_at = NOW() WHERE app_id = $2 AND key = $3',
      [enabled, req.appId, key]
    );
  }
  const { rows } = await db.query(
    'SELECT key, enabled, label, updated_at FROM dialog_config WHERE app_id = $1 ORDER BY key',
    [req.appId]
  );
  res.json(rows);
});

app.put('/api/panel/:apiKey/password', requireAppAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Fields required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Min 4 characters' });
  const { rows } = await db.query('SELECT * FROM app_admins WHERE id = $1 LIMIT 1', [req.appAdminId]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE app_admins SET password_hash = $1 WHERE id = $2', [hash, req.appAdminId]);
  res.json({ success: true });
});

// ── Public config (Android) ───────────────────────────────────────────────────
app.get('/api/dialog/config/:apiKey', async (req, res) => {
  try {
    const { rows: appRows } = await db.query('SELECT id FROM apps WHERE api_key = $1', [req.params.apiKey]);
    if (!appRows.length) return res.status(404).json({ error: 'App not found' });
    const { rows } = await db.query('SELECT key, enabled FROM dialog_config WHERE app_id = $1', [appRows[0].id]);
    const config = {};
    for (const row of rows) config[row.key] = row.enabled;
    res.set('Cache-Control', 'no-store');
    res.json(config);
  } catch { res.status(500).json({ error: 'Failed to fetch config' }); }
});

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

initDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
