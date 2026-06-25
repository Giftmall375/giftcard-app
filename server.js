const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://websolinfotechllc_db_user:Kevijavor@2025@cluster0.t4ra3tl.mongodb.net/?appName=Cluster0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('giftcardapp');
  console.log('Connected to MongoDB');

  const admins = db.collection('admins');
  if (await admins.countDocuments() === 0) {
    await admins.insertOne({ username: 'admin', password: 'admin123' });
  }

  const cards = db.collection('cards');
  if (await cards.countDocuments() === 0) {
    await cards.insertMany([
      { num: '4111111111111111', holder: 'Sarah Johnson', balance: 75.00,  expiry: '12/27', pin: '1234', status: 'active',   created_at: new Date().toISOString() },
      { num: '5500000000000004', holder: 'James Liu',     balance: 0.00,   expiry: '06/25', pin: '5678', status: 'inactive', created_at: new Date().toISOString() },
      { num: '3714496353984310', holder: 'Maria Garcia',  balance: 200.50, expiry: '03/28', pin: '9012', status: 'active',   created_at: new Date().toISOString() },
      { num: '6011111111111117', holder: 'Tom Baker',     balance: 50.00,  expiry: '09/26', pin: '3456', status: 'pending',  created_at: new Date().toISOString() },
      { num: '3530111333300000', holder: 'Aisha Patel',   balance: 125.00, expiry: '11/27', pin: '7890', status: 'active',   created_at: new Date().toISOString() },
      { num: '4012888888881881', holder: 'Chris Evans',   balance: 10.00,  expiry: '01/26', pin: '2345', status: 'inactive', created_at: new Date().toISOString() },
    ]);
  }
}

function fmtNum(raw) {
  return raw.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function formatCard(c) {
  return { ...c, id: c._id.toString(), num: fmtNum(c.num) };
}

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  const admin = await db.collection('admins').findOne({ username, password });
  if (!admin) return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ success: true, username: admin.username });
});

app.post('/api/auth/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  if (!username || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields are required.' });
  const admin = await db.collection('admins').findOne({ username, password: currentPassword });
  if (!admin) return res.status(401).json({ error: 'Current password is incorrect.' });
  await db.collection('admins').updateOne({ username }, { $set: { password: newPassword } });
  res.json({ success: true });
});

// PUBLIC ROUTES
app.post('/api/cards/balance', async (req, res) => {
  const { num, expiry, pin } = req.body;
  if (!num) return res.status(400).json({ error: 'Card number is required.' });
  const clean = num.replace(/\s/g, '');
  let card = await db.collection('cards').findOne({ num: clean });
  if (!card) {
    const result = await db.collection('cards').insertOne({
      num: clean, holder: '', balance: 0,
      expiry: expiry || '', pin: pin || '',
      status: 'active', created_at: new Date().toISOString()
    });
    card = await db.collection('cards').findOne({ _id: result.insertedId });
  }
  if (card.status === 'inactive') return res.status(403).json({ error: 'This card has been deactivated.' });
  res.json({ balance: card.balance, expiry: card.expiry, status: card.status, card: '**** ' + card.num.slice(-4) });
});

app.post('/api/cards/activate', async (req, res) => {
  const { num, expiry, pin } = req.body;
  if (!num || !expiry || !pin) return res.status(400).json({ error: 'Card number, expiry, and PIN are required.' });
  const clean = num.replace(/\s/g, '');
  let card = await db.collection('cards').findOne({ num: clean });
  if (!card) {
    await db.collection('cards').insertOne({
      num: clean, holder: '', balance: 0,
      expiry, pin, status: 'active',
      created_at: new Date().toISOString()
    });
    return res.json({ success: true });
  }
  if (card.status === 'inactive') return res.status(403).json({ error: 'This card has been permanently deactivated.' });
  await db.collection('cards').updateOne({ num: clean }, { $set: { status: 'active', expiry, pin } });
  res.json({ success: true });
});

// ADMIN ROUTES
app.get('/api/admin/cards', async (req, res) => {
  const cards = await db.collection('cards').find().sort({ created_at: -1 }).toArray();
  res.json(cards.map(formatCard));
});

app.post('/api/admin/cards', async (req, res) => {
  const { num, holder, balance, expiry, pin, status } = req.body;
  if (!num || !expiry) return res.status(400).json({ error: 'Card number and expiry are required.' });
  const clean = num.replace(/\s/g, '');
  if (await db.collection('cards').findOne({ num: clean })) return res.status(409).json({ error: 'A card with that number already exists.' });
  const result = await db.collection('cards').insertOne({ num: clean, holder: holder || '', balance: balance || 0, expiry, pin: pin || '', status: status || 'pending', created_at: new Date().toISOString() });
  const card = await db.collection('cards').findOne({ _id: result.insertedId });
  res.status(201).json(formatCard(card));
});

app.patch('/api/admin/cards/:id', async (req, res) => {
  try {
    const oid = new ObjectId(req.params.id);
    const card = await db.collection('cards').findOne({ _id: oid });
    if (!card) return res.status(404).json({ error: 'Card not found.' });
    const { num, holder, balance, expiry, pin, status } = req.body;
    const clean = num ? num.replace(/\s/g, '') : card.num;
    if (clean !== card.num && await db.collection('cards').findOne({ num: clean })) return res.status(409).json({ error: 'A card with that number already exists.' });
    await db.collection('cards').updateOne({ _id: oid }, { $set: { num: clean, holder: holder ?? card.holder, balance: balance ?? card.balance, expiry: expiry ?? card.expiry, pin: pin ?? card.pin, status: status ?? card.status } });
    const updated = await db.collection('cards').findOne({ _id: oid });
    res.json(formatCard(updated));
  } catch { res.status(400).json({ error: 'Invalid card ID.' }); }
});

app.delete('/api/admin/cards/:id', async (req, res) => {
  try {
    const oid = new ObjectId(req.params.id);
    const result = await db.collection('cards').deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Card not found.' });
    res.json({ success: true });
  } catch { res.status(400).json({ error: 'Invalid card ID.' }); }
});

app.patch('/api/admin/cards/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const oid = new ObjectId(req.params.id);
    const result = await db.collection('cards').updateOne({ _id: oid }, { $set: { status } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Card not found.' });
    res.json({ success: true, status });
  } catch { res.status(400).json({ error: 'Invalid card ID.' }); }
});

app.get('/health', (req, res) => res.send('OK'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅  Gift Card Server running at http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
