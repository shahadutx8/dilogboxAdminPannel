'use strict';
  require('dotenv').config();

  const express = require('express');
  const cors    = require('cors');
  const bcrypt  = require('bcryptjs');
  const jwt     = require('jsonwebtoken');
  const path    = require('path');
  const { Pool } = require('pg');

  // ── Config ───────────────────────────────────────────────────────────────────
  const PORT   = process.env.PORT || 3000;
  const SECRET = process.env.SESSION_SECRET || 'change-this-secret';
  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

  // ── DB helpers ───────────────────────────────────────────────────────────────
  const db = {
    query: (text, params) => pool.query(text, params),
  };

  // ── Create tables + seed defaults ────────────────────────────────────────────
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
      CREATE TABLE IF NOT EXISTS dialog_config (
        key TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        label TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed default config rows
    const defaults = [
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

    for (const [key, enabled, label] of defaults) {
      await db.query(
        `INSERT INTO dialog_config (key, enabled, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, enabled, label]
      );
    }

    // Seed default admin user (admin / admin123)
    const { rows } = await db.query('SELECT id FROM admin_users LIMIT 1');
    if (rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await db.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
        ['admin', hash]
      );
      console.log('[init] Default admin created: admin / admin123');
    }
  }

  // ── JWT helpers ───────────────────────────────────────────────────────────────
  function signToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: '24h' });
  }

  function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const decoded = jwt.verify(auth.slice(7), SECRET);
      req.adminId = decoded.id;
      req.adminUsername = decoded.username;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // ── Express app ───────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Admin panel static HTML
  app.use('/api/admin-panel', express.static(path.join(__dirname, 'public', 'admin')));

  // ── POST /api/admin/login ─────────────────────────────────────────────────────
  app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const { rows } = await db.query(
      'SELECT * FROM admin_users WHERE username = $1 LIMIT 1', [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: rows[0].id, username: rows[0].username });
    res.json({ token, username: rows[0].username });
  });

  // ── GET /api/admin/config (protected) ────────────────────────────────────────
  app.get('/api/admin/config', requireAuth, async (_req, res) => {
    const { rows } = await db.query(
      'SELECT key, enabled, label, updated_at FROM dialog_config ORDER BY key'
    );
    res.json(rows);
  });

  // ── PUT /api/admin/config (protected) ────────────────────────────────────────
  app.put('/api/admin/config', requireAuth, async (req, res) => {
    const updates = req.body;
    if (!Array.isArray(updates))
      return res.status(400).json({ error: 'Expected array of {key, enabled}' });

    for (const { key, enabled } of updates) {
      await db.query(
        'UPDATE dialog_config SET enabled = $1, updated_at = NOW() WHERE key = $2',
        [enabled, key]
      );
    }

    const { rows } = await db.query(
      'SELECT key, enabled, label, updated_at FROM dialog_config ORDER BY key'
    );
    res.json(rows);
  });

  // ── PUT /api/admin/password (protected) ──────────────────────────────────────
  app.put('/api/admin/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const { rows } = await db.query(
      'SELECT * FROM admin_users WHERE id = $1 LIMIT 1', [req.adminId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, req.adminId]);
    res.json({ success: true });
  });

  // ── GET /api/dialog/config (PUBLIC — Android app fetches this) ────────────────
  app.get('/api/dialog/config', async (_req, res) => {
    try {
      const { rows } = await db.query('SELECT key, enabled FROM dialog_config');
      const config = {};
      for (const row of rows) config[row.key] = row.enabled;
      res.set('Cache-Control', 'no-store');
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch config' });
    }
  });

  // ── GET /api/healthz ──────────────────────────────────────────────────────────
  app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

  // ── Start ─────────────────────────────────────────────────────────────────────
  initDB()
    .then(() => {
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => {
      console.error('DB init failed:', err);
      process.exit(1);
    });
  