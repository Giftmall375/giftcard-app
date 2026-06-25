const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'giftcards.db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory data store (saved to JSON file) ─────────────
let data = {
  cards: [],
  admins: [{ id: 1, username: 'admin', password: 'admin123' }],
  nextCardId: 1
};

// Load existing data if file exists
if (fs.existsSync(DB_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.log('Starting with fresh database.');
  }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Seed demo cards if empty
if (data.cards.length === 0) {
  const seeds = [
    { num: '4111111111111111', holder: 'Sarah Johnson', balance: 75.00,  expiry: '12/27', pin: '1234', status: 'active'   },
    { num: '5500000000000004', holder: 'James Liu',     balance: 0.00,   expiry: '06/25', pin: '5678', status: 'inactive' },
    { num: '3714496353984310', holder: 'Maria Garcia',  balance: 200.50, expiry: '03/28', pin: '9012', status: 'active'   },
    { num: '6011111111111117', holder: 'Tom Baker',     balance: 50.00,  expiry: '09/26', pin: '3456', status: 'pending'  },
    { num: '3530111333300000', holder: 'Aisha Patel',   balance: 125.00, expiry: '11/27', pin: '7890', status: 'active'   },
    { num: '4012888888881881', holder: 'Chris Evans',   balance: 10.00,  expiry: '01/26', pin: '2345', status: 'inactive' },
  ];
  seeds.forEach(s => {
    data.cards.push({ ...s, id: data.nextCardId++, created_at: new Date().toISOString() });
  });
  save();
}

// ── Helpers ───────────────────────────────────────────────
function fmtNum(raw) {
  return raw.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}
function findCard(id) {
  return data.cards.find(c => c.id === parseInt(id));
}

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required.' });
  const admin = data.admins.find(a => a.username === username && a.password === password);
  if (!admin)
    return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ success: true, username: admin.username });
});

// ── PUBLIC CARD ROUTES ────────────────────────────────────
app.post('/api/cards/balance', (req, res) => {
  const { num, expiry, pin } = req.body;
  if (!num) return res.status(400).json({ error: 'Card number is required.' });

  const clean = num.replace(/\s/g, '');
  const card = data.cards.find(c => c.num === clean);

  if (!card) return res.status(404).json({ error: 'Card not found. Double-check the number and try again.' });
  if (expiry && card.expiry !== expiry) return res.status(400).json({ error: 'Expiration date does not match.' });
  if (pin && card.pin !== pin) return res.status(400).json({ error: 'Incorrect PIN.' });
  if (card.status === 'inactive') return res.status(403).json({ error: 'This card has been deactivated.' });
  if (card.status === 'pending') return res.status(403).json({ error: 'This card has not been activated yet.' });

  res.json({ balance: card.balance, expiry: card.expiry, status: card.status, card: '**** ' + card.num.slice(-4) });
});

app.post('/api/cards/activate', (req, res) => {
  const { num, expiry, pin } = req.body;
  if (!num || !expiry || !pin)
    return res.status(400).json({ error: 'Card number, expiry, and PIN are required.' });

  const clean = num.replace(/\s/g, '');
  const card = data.cards.find(c => c.num === clean);

  if (!card) return res.status(404).json({ error: 'Card not found.' });
  if (card.expiry !== expiry) return res.status(400).json({ error: 'Expiration date does not match.' });
  if (card.pin !== pin) return res.status(400).json({ error: 'Incorrect PIN.' });
  if (card.status === 'active') return res.status(400).json({ error: 'This card is already active.' });
  if (card.status === 'inactive') return res.status(403).json({ error: 'This card has been permanently deactivated. Contact support.' });

  card.status = 'active';
  save();
  res.json({ success: true });
});

// ── ADMIN CARD ROUTES ─────────────────────────────────────
app.get('/api/admin/cards', (req, res) => {
  const sorted = [...data.cards].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(sorted.map(c => ({ ...c, num: fmtNum(c.num) })));
});

app.post('/api/admin/cards', (req, res) => {
  const { num, holder, balance, expiry, pin, status } = req.body;
  if (!num || !expiry) return res.status(400).json({ error: 'Card number and expiry are required.' });

  const clean = num.replace(/\s/g, '');
  if (data.cards.find(c => c.num === clean))
    return res.status(409).json({ error: 'A card with that number already exists.' });

  const card = { id: data.nextCardId++, num: clean, holder: holder || '', balance: balance || 0, expiry, pin: pin || '', status: status || 'pending', created_at: new Date().toISOString() };
  data.cards.push(card);
  save();
  res.status(201).json({ ...card, num: fmtNum(card.num) });
});

app.patch('/api/admin/cards/:id', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found.' });

  const { num, holder, balance, expiry, pin, status } = req.body;
  const clean = num ? num.replace(/\s/g, '') : card.num;

  if (clean !== card.num && data.cards.find(c => c.num === clean))
    return res.status(409).json({ error: 'A card with that number already exists.' });

  Object.assign(card, {
    num: clean,
    holder:  holder  ?? card.holder,
    balance: balance ?? card.balance,
    expiry:  expiry  ?? card.expiry,
    pin:     pin     ?? card.pin,
    status:  status  ?? card.status,
  });
  save();
  res.json({ ...card, num: fmtNum(card.num) });
});

app.delete('/api/admin/cards/:id', (req, res) => {
  const idx = data.cards.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Card not found.' });
  data.cards.splice(idx, 1);
  save();
  res.json({ success: true });
});

app.patch('/api/admin/cards/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive', 'pending'].includes(status))
    return res.status(400).json({ error: 'Invalid status.' });
  const card = findCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found.' });
  card.status = status;
  save();
  res.json({ success: true, status });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅  Gift Card Server running at http://localhost:${PORT}`);
  console.log(`   Admin login: admin / Itsme@2020\n`);
});