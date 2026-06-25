const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SQLite setup ─────────────────────────────────────────────────────────────
// Use Railway volume at /data if available, otherwise local
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'giftcards.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT UNIQUE NOT NULL,
    holder TEXT DEFAULT '',
    balance REAL DEFAULT 0,
    expiry TEXT DEFAULT '',
    pin TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
`);

// Seed admin if not exists
const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', process.env.ADMIN_PASSWORD || 'admin123');
}

// Seed demo cards if table is empty
const cardCount = db.prepare('SELECT COUNT(*) as n FROM cards').get();
if (cardCount.n === 0) {
  const insert = db.prepare('INSERT OR IGNORE INTO cards (num, holder, balance, expiry, pin, status) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['4111111111111111', 'Sarah Johnson', 75.00,  '12/27', '1234', 'active'],
    ['5500000000000004', 'James Liu',     0.00,   '06/25', '5678', 'inactive'],
    ['3714496353984310', 'Maria Garcia',  200.50, '03/28', '9012', 'active'],
    ['6011111111111117', 'Tom Baker',     50.00,  '09/26', '3456', 'pending'],
    ['3530111333300000', 'Aisha Patel',   125.00, '11/27', '7890', 'active'],
    ['4012888888881881', 'Chris Evans',   10.00,  '01/26', '2345', 'inactive'],
  ].forEach(row => insert.run(...row));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(raw) {
  return raw.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);
  if (!admin) return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ success: true, username: admin.username });
});

app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  if (!username || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields are required.' });
  const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, currentPassword);
  if (!admin) return res.status(401).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE admins SET password = ? WHERE username = ?').run(newPassword, username);
  res.json({ success: true });
});

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────
app.post('/api/cards/balance', (req, res) => {
  const { num } = req.body;
  if (!num) return res.status(400).json({ error: 'Card number is required.' });
  const clean = num.replace(/\s/g, '');
  const card = db.prepare('SELECT * FROM cards WHERE num = ?').get(clean);
  if (!card) return res.status(404).json({ error: 'Card not found.' });
  if (card.status === 'inactive') return res.status(403).json({ error: 'This card has been deactivated.' });
  res.json({ balance: card.balance, expiry: card.expiry, status: card.status, card: '**** ' + card.num.slice(-4) });
});

app.post('/api/cards/activate', (req, res) => {
  const { num, expiry, pin } = req.body;
  if (!num || !expiry || !pin) return res.status(400).json({ error: 'Card number, expiry, and PIN are required.' });
  const clean = num.replace(/\s/g, '');
  const existing = db.prepare('SELECT * FROM cards WHERE num = ?').get(clean);
  if (!existing) {
    db.prepare('INSERT INTO cards (num, holder, balance, expiry, pin, status) VALUES (?, ?, ?, ?, ?, ?)').run(clean, '', 0, expiry, pin, 'active');
    return res.json({ success: true, created: true });
  }
  if (existing.status === 'inactive') return res.status(403).json({ error: 'This card has been permanently deactivated.' });
  db.prepare('UPDATE cards SET status = ?, expiry = ?, pin = ? WHERE num = ?').run('active', expiry, pin, clean);
  res.json({ success: true, created: false });
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/admin/cards', (req, res) => {
  const cards = db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all();
  res.json(cards.map(c => ({ ...c, num: fmtNum(c.num) })));
});

app.post('/api/admin/cards', (req, res) => {
  const { num, holder, balance, expiry, pin, status } = req.body;
  if (!num || !expiry) return res.status(400).json({ error: 'Card number and expiry are required.' });
  const clean = num.replace(/\s/g, '');
  try {
    const result = db.prepare('INSERT INTO cards (num, holder, balance, expiry, pin, status) VALUES (?, ?, ?, ?, ?, ?)').run(clean, holder || '', parseFloat(balance) || 0, expiry, pin || '', status || 'pending');
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...card, num: fmtNum(card.num) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A card with that number already exists.' });
    throw e;
  }
});

app.patch('/api/admin/cards/:id', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(parseInt(req.params.id));
  if (!card) return res.status(404).json({ error: 'Card not found.' });
  const { num, holder, balance, expiry, pin, status } = req.body;
  const clean = num ? num.replace(/\s/g, '') : card.num;
  try {
    db.prepare('UPDATE cards SET num=?, holder=?, balance=?, expiry=?, pin=?, status=? WHERE id=?').run(
      clean,
      holder ?? card.holder,
      balance !== undefined ? parseFloat(balance) : card.balance,
      expiry ?? card.expiry,
      pin ?? card.pin,
      status ?? card.status,
      card.id
    );
    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id);
    res.json({ ...updated, num: fmtNum(updated.num) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A card with that number already exists.' });
    throw e;
  }
});

app.delete('/api/admin/cards/:id', (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(parseInt(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found.' });
  res.json({ success: true });
});

app.patch('/api/admin/cards/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const result = db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(status, parseInt(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Card not found.' });
  res.json({ success: true, status });
});

// ─── Health & fallback ────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.send('OK'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n✅  Gift Card Server running at http://localhost:${PORT}`);
  console.log(`🗄️  Database: ${path.join(DATA_DIR, 'giftcards.db')}\n`);
});
