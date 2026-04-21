require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

const app        = express();
const PORT       = process.env.PORT       || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ecocloud_secret_change_in_production';
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://localhost:27017/ecocloud';

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── MongoDB Connection ────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Atlas connected successfully'))
  .catch(err => { console.error('❌ MongoDB connection error:', err.message); process.exit(1); });

// ══════════════════════════════════════════════════════════════════════════
// MONGOOSE SCHEMAS & MODELS
// ══════════════════════════════════════════════════════════════════════════

// ── User Schema ───────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, trim: true, minlength: 3 },
  password:   { type: String, required: true },
  email:      { type: String, unique: true, sparse: true, trim: true },
  role:       { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ── Analysis Schema ───────────────────────────────────────────────────────
const analysisSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url:          { type: String, required: true },
  country:      String,
  countryCode:  String,
  ciValue:      Number,
  gramsPerView: Number,
  annualKg:     Number,
  grade:        String,
  pageSizeKb:   Number,
  isGreen:      { type: Boolean, default: false },
  dataSource:   String,
}, { timestamps: true });

const Analysis = mongoose.model('Analysis', analysisSchema);

// ── Saved Site Schema ─────────────────────────────────────────────────────
const savedSiteSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url:      { type: String, required: true },
  nickname: String,
}, { timestamps: true });

// Compound unique index — one user can't save same URL twice
savedSiteSchema.index({ userId: 1, url: 1 }, { unique: true });

const SavedSite = mongoose.model('SavedSite', savedSiteSchema);

// ── CO2 Snapshot Schema ───────────────────────────────────────────────────
const snapshotSchema = new mongoose.Schema({
  savedSiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'SavedSite', required: true },
  gramsPerView: Number,
  ciValue:      Number,
  grade:        String,
}, { timestamps: true });

const Snapshot = mongoose.model('Snapshot', snapshotSchema);

// ── CI Log Schema ─────────────────────────────────────────────────────────
const ciLogSchema = new mongoose.Schema({
  countryCode: { type: String, required: true, uppercase: true },
  ciValue:     { type: Number, required: true },
}, { timestamps: true });

const CiLog = mongoose.model('CiLog', ciLogSchema);

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

// ── Auth middleware ───────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });
  try {
    const decoded  = jwt.verify(token, JWT_SECRET);
    req.userId     = decoded.userId;
    req.username   = decoded.username;
    req.role       = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Admin middleware ──────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admin only' });
  next();
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email, role: requestedRole } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3)
    return res.status(400).json({ error: 'Username min 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password min 6 characters' });

  try {
    const hashed = await bcrypt.hash(password, 12);

    // Only allow admin role if explicitly requested
    // In production you would remove this and assign admin manually
    const role = requestedRole === 'admin' ? 'admin' : 'user';

    const user = await User.create({
      username: username.trim(),
      password: hashed,
      email:    email?.trim() || undefined,
      role,
    });

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (err) {
    if (err.code === 11000)
      res.status(409).json({ error: 'Username or email already exists' });
    else
      res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    if (!user.isActive)
      return res.status(403).json({ error: 'Account has been deactivated' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id:         user._id,
        username:   user.username,
        role:       user.role,
        created_at: user.createdAt,
      },
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/users — list all users
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/role — change a user's role
app.patch('/api/admin/users/:id/role', auth, adminOnly, async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role))
    return res.status(400).json({ error: 'Invalid role. Must be user or admin' });
  try {
    await User.findByIdAndUpdate(req.params.id, { role });
    res.json({ message: `Role updated to ${role}` });
  } catch {
    res.status(500).json({ error: 'Could not update role' });
  }
});

// PATCH /api/admin/users/:id/status — activate / deactivate a user
app.patch('/api/admin/users/:id/status', auth, adminOnly, async (req, res) => {
  const { isActive } = req.body;
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive });
    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch {
    res.status(500).json({ error: 'Could not update status' });
  }
});

// DELETE /api/admin/users/:id — delete a user and all their data
app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;

    // Delete all snapshots for this user's saved sites
    const savedSites = await SavedSite.find({ userId });
    const siteIds = savedSites.map(s => s._id);
    await Snapshot.deleteMany({ savedSiteId: { $in: siteIds } });

    // Delete everything else
    await SavedSite.deleteMany({ userId });
    await Analysis.deleteMany({ userId });
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User and all their data deleted' });
  } catch {
    res.status(500).json({ error: 'Could not delete user' });
  }
});

// GET /api/admin/stats — platform-wide statistics
app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const usersCount     = await User.countDocuments();
    const analysesCount  = await Analysis.countDocuments();
    const totalCo2Result = await Analysis.aggregate([
      { $group: { _id: null, total: { $sum: '$annualKg' } } }
    ]);
    const totalCo2 = totalCo2Result[0]?.total || 0;

    // Most analyzed sites
    const topSites = await Analysis.aggregate([
      { $group: { _id: '$url', count: { $sum: 1 }, avgGrade: { $first: '$grade' } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Grade distribution across all users
    const gradeDistribution = await Analysis.aggregate([
      { $group: { _id: '$grade', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Recent analyses with username
    const recent = await Analysis.find()
      .populate('userId', 'username')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      usersCount,
      analysesCount,
      totalCo2: parseFloat(totalCo2.toFixed(2)),
      topSites,
      gradeDistribution,
      recent: recent.map(a => ({
        url:       a.url,
        grade:     a.grade,
        username:  a.userId?.username || 'unknown',
        analyzedAt: a.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ANALYSIS ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/analyses — save a new analysis
app.post('/api/analyses', auth, async (req, res) => {
  const {
    url, country, country_code, ci_value, grams_per_view,
    annual_kg, grade, page_size_kb, is_green, data_source
  } = req.body;

  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const analysis = await Analysis.create({
      userId:       req.userId,
      url,
      country,
      countryCode:  country_code,
      ciValue:      ci_value,
      gramsPerView: grams_per_view,
      annualKg:     annual_kg,
      grade,
      pageSizeKb:   page_size_kb,
      isGreen:      is_green || false,
      dataSource:   data_source,
    });

    // If this URL is a saved site, add a CO2 snapshot for trend tracking
    const savedSite = await SavedSite.findOne({ userId: req.userId, url });
    if (savedSite) {
      await Snapshot.create({
        savedSiteId:  savedSite._id,
        gramsPerView: grams_per_view,
        ciValue:      ci_value,
        grade,
      });
    }

    res.status(201).json({ id: analysis._id, message: 'Analysis saved' });
  } catch (err) {
    res.status(500).json({ error: 'Could not save analysis' });
  }
});

// GET /api/analyses — get user's analysis history
app.get('/api/analyses', auth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const analyses = await Analysis.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ analyses });
  } catch {
    res.status(500).json({ error: 'Could not fetch analyses' });
  }
});

// GET /api/analyses/stats — user's personal stats
app.get('/api/analyses/stats', auth, async (req, res) => {
  try {
    const result = await Analysis.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId) } },
      {
        $group: {
          _id:            null,
          total_analyses: { $sum: 1 },
          avg_grams:      { $avg: '$gramsPerView' },
          best_grams:     { $min: '$gramsPerView' },
          worst_grams:    { $max: '$gramsPerView' },
          total_annual_kg:{ $sum: '$annualKg' },
          unique_urls:    { $addToSet: '$url' },
        }
      },
      {
        $project: {
          total_analyses:  1,
          avg_grams:       1,
          best_grams:      1,
          worst_grams:     1,
          total_annual_kg: 1,
          unique_sites:    { $size: '$unique_urls' },
        }
      }
    ]);

    const gradeCount = await Analysis.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: '$grade', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      stats:      result[0] || {},
      gradeCount: gradeCount.map(g => ({ grade: g._id, count: g.count })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stats' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SAVED SITES ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/saved-sites
app.post('/api/saved-sites', auth, async (req, res) => {
  const { url, nickname } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const site = await SavedSite.create({
      userId:   req.userId,
      url,
      nickname: nickname || url,
    });
    res.status(201).json({ id: site._id, message: 'Site saved for monitoring' });
  } catch (err) {
    if (err.code === 11000)
      res.status(409).json({ error: 'Site already saved' });
    else
      res.status(500).json({ error: 'Could not save site' });
  }
});

// GET /api/saved-sites — list with latest snapshot info
app.get('/api/saved-sites', auth, async (req, res) => {
  try {
    const sites = await SavedSite.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    // Attach latest snapshot to each site
    const sitesWithSnapshots = await Promise.all(sites.map(async site => {
      const latest = await Snapshot.findOne({ savedSiteId: site._id })
        .sort({ createdAt: -1 });
      const count = await Snapshot.countDocuments({ savedSiteId: site._id });
      return {
        ...site,
        latest_grams: latest?.gramsPerView || null,
        latest_grade: latest?.grade        || null,
        snapshot_count: count,
      };
    }));

    res.json({ sites: sitesWithSnapshots });
  } catch {
    res.status(500).json({ error: 'Could not fetch saved sites' });
  }
});

// DELETE /api/saved-sites/:id
app.delete('/api/saved-sites/:id', auth, async (req, res) => {
  try {
    const site = await SavedSite.findOne({ _id: req.params.id, userId: req.userId });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    await Snapshot.deleteMany({ savedSiteId: site._id });
    await SavedSite.findByIdAndDelete(site._id);

    res.json({ message: 'Site removed' });
  } catch {
    res.status(500).json({ error: 'Could not delete site' });
  }
});

// GET /api/saved-sites/:id/trend
app.get('/api/saved-sites/:id/trend', auth, async (req, res) => {
  try {
    const site = await SavedSite.findOne({ _id: req.params.id, userId: req.userId });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const snapshots = await Snapshot.find({ savedSiteId: site._id })
      .sort({ createdAt: 1 })
      .limit(50);

    res.json({ site, snapshots });
  } catch {
    res.status(500).json({ error: 'Could not fetch trend' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CI LOG ROUTES
// ══════════════════════════════════════════════════════════════════════════

// POST /api/ci-log
app.post('/api/ci-log', auth, async (req, res) => {
  const { readings } = req.body;
  if (!Array.isArray(readings))
    return res.status(400).json({ error: 'readings must be an array' });
  try {
    await CiLog.insertMany(readings.map(r => ({
      countryCode: r.country_code,
      ciValue:     r.ci_value,
    })));
    res.json({ message: `${readings.length} CI values logged` });
  } catch {
    res.status(500).json({ error: 'Could not log CI values' });
  }
});

// GET /api/ci-log/:code
app.get('/api/ci-log/:code', auth, async (req, res) => {
  try {
    const history = await CiLog.find({ countryCode: req.params.code.toUpperCase() })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ country: req.params.code.toUpperCase(), history });
  } catch {
    res.status(500).json({ error: 'Could not fetch CI log' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'MongoDB Connected' : 'Disconnected',
    time: new Date().toISOString(),
  });
});

// ── Start server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 EcoCloud backend running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
