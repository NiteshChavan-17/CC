const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const sqlite3  = require('sqlite3').verbose();
const path     = require('path');

const app        = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cloudcarbon_secret_change_in_production';

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────
const db = new sqlite3.Database(
  path.join(__dirname, 'cloudcarbon.db'),
  err => { if (err) console.error('DB error:', err); else console.log('✅ Database ready: cloudcarbon.db'); }
);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID }); });
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    country TEXT, country_code TEXT, ci_value REAL,
    grams_per_view REAL, annual_kg REAL, grade TEXT,
    page_size_kb INTEGER, is_green INTEGER DEFAULT 0,
    data_source TEXT, analyzed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS saved_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, url TEXT NOT NULL, nickname TEXT,
    saved_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, url), FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS co2_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saved_site_id INTEGER NOT NULL,
    grams_per_view REAL, ci_value REAL, grade TEXT,
    recorded_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (saved_site_id) REFERENCES saved_sites(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ci_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT NOT NULL, ci_value REAL NOT NULL,
    logged_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('✅ All tables ready');
});

// ── Auth middleware ───────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const d = jwt.verify(token, JWT_SECRET);
    req.userId = d.userId; req.username = d.username; next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username min 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
  try {
    const hashed = await bcrypt.hash(password, 12);
    const r = await dbRun('INSERT INTO users (username, password, email) VALUES (?,?,?)', [username.trim(), hashed, email?.trim()||null]);
    const token = jwt.sign({ userId: r.lastID, username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created', token, user: { id: r.lastID, username: username.trim() } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) res.status(409).json({ error: 'Username already exists' });
    else res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user.id, username: user.username, created_at: user.created_at } });
  } catch { res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, username, email, created_at FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── ANALYSES ──────────────────────────────────────────────────────────────
app.post('/api/analyses', auth, async (req, res) => {
  const { url, country, country_code, ci_value, grams_per_view, annual_kg, grade, page_size_kb, is_green, data_source } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const r = await dbRun(
      `INSERT INTO analyses (user_id,url,country,country_code,ci_value,grams_per_view,annual_kg,grade,page_size_kb,is_green,data_source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, url, country, country_code, ci_value, grams_per_view, annual_kg, grade, page_size_kb, is_green?1:0, data_source]
    );
    const saved = await dbGet('SELECT id FROM saved_sites WHERE user_id=? AND url=?', [req.userId, url]);
    if (saved) await dbRun('INSERT INTO co2_snapshots (saved_site_id,grams_per_view,ci_value,grade) VALUES (?,?,?,?)', [saved.id, grams_per_view, ci_value, grade]);
    res.status(201).json({ id: r.lastID, message: 'Analysis saved' });
  } catch { res.status(500).json({ error: 'Could not save analysis' }); }
});

app.get('/api/analyses', auth, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM analyses WHERE user_id=? ORDER BY analyzed_at DESC LIMIT ?', [req.userId, parseInt(req.query.limit)||20]);
    res.json({ analyses: rows });
  } catch { res.status(500).json({ error: 'Could not fetch analyses' }); }
});

app.get('/api/analyses/stats', auth, async (req, res) => {
  try {
    const stats = await dbGet(
      `SELECT COUNT(*) AS total_analyses, AVG(grams_per_view) AS avg_grams,
       MIN(grams_per_view) AS best_grams, MAX(grams_per_view) AS worst_grams,
       SUM(annual_kg) AS total_annual_kg, COUNT(DISTINCT url) AS unique_sites
       FROM analyses WHERE user_id=?`, [req.userId]
    );
    const gradeCount = await dbAll('SELECT grade, COUNT(*) as count FROM analyses WHERE user_id=? GROUP BY grade ORDER BY grade', [req.userId]);
    res.json({ stats, gradeCount });
  } catch { res.status(500).json({ error: 'Could not fetch stats' }); }
});

// ── SAVED SITES ───────────────────────────────────────────────────────────
app.post('/api/saved-sites', auth, async (req, res) => {
  const { url, nickname } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const r = await dbRun('INSERT INTO saved_sites (user_id,url,nickname) VALUES (?,?,?)', [req.userId, url, nickname||url]);
    res.status(201).json({ id: r.lastID, message: 'Site saved' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) res.status(409).json({ error: 'Site already saved' });
    else res.status(500).json({ error: 'Could not save site' });
  }
});

app.get('/api/saved-sites', auth, async (req, res) => {
  try {
    const sites = await dbAll(
      `SELECT ss.*,
        (SELECT grams_per_view FROM co2_snapshots WHERE saved_site_id=ss.id ORDER BY recorded_at DESC LIMIT 1) AS latest_grams,
        (SELECT grade FROM co2_snapshots WHERE saved_site_id=ss.id ORDER BY recorded_at DESC LIMIT 1) AS latest_grade,
        (SELECT COUNT(*) FROM co2_snapshots WHERE saved_site_id=ss.id) AS snapshot_count
       FROM saved_sites ss WHERE ss.user_id=? ORDER BY ss.saved_at DESC`, [req.userId]
    );
    res.json({ sites });
  } catch { res.status(500).json({ error: 'Could not fetch sites' }); }
});

app.delete('/api/saved-sites/:id', auth, async (req, res) => {
  try {
    const site = await dbGet('SELECT * FROM saved_sites WHERE id=? AND user_id=?', [req.params.id, req.userId]);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    await dbRun('DELETE FROM co2_snapshots WHERE saved_site_id=?', [req.params.id]);
    await dbRun('DELETE FROM saved_sites WHERE id=?', [req.params.id]);
    res.json({ message: 'Site removed' });
  } catch { res.status(500).json({ error: 'Could not delete site' }); }
});

app.get('/api/saved-sites/:id/trend', auth, async (req, res) => {
  try {
    const site = await dbGet('SELECT * FROM saved_sites WHERE id=? AND user_id=?', [req.params.id, req.userId]);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const snapshots = await dbAll(
      'SELECT grams_per_view,ci_value,grade,recorded_at FROM co2_snapshots WHERE saved_site_id=? ORDER BY recorded_at ASC LIMIT 50',
      [req.params.id]
    );
    res.json({ site, snapshots });
  } catch { res.status(500).json({ error: 'Could not fetch trend' }); }
});

// ── HEALTH ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`🚀 CloudCarbon backend running on http://localhost:${PORT}`);
  console.log(`🔗 Test it: http://localhost:${PORT}/api/health`);
});
