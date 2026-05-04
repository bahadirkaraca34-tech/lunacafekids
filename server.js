require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, 'public');
const staticPath = fs.existsSync(publicPath) ? publicPath : __dirname;
app.use(express.static(staticPath));

// ══ SCHEMAS ══
const childSchema = new mongoose.Schema({
  clientId:  { type: Number, required: true, unique: true },
  firstName: String, lastName: String, fullName: String,
  duration: Number, price: Number, totalSec: Number, remaining: Number,
  status: { type: String, default: 'running' },
  products: [{ name: String, price: Number }],
  startedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  clientId: Number, childName: String, duration: Number, price: Number,
  products: [{ name: String, price: Number }],
  prodTotal: Number, grand: Number, payment: String, time: String,
}, { timestamps: true });

const expenseSchema = new mongoose.Schema({
  desc: String, amount: Number, time: String,
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
});

const tableSchema = new mongoose.Schema({
  tableNo: { type: Number, required: true, unique: true },
  products: [{ name: String, price: Number }],
  status: { type: String, default: 'empty' },
  openedAt: Date,
}, { timestamps: true });

const closingReportSchema = new mongoose.Schema({
  date: String, dateKey: String, closedAt: Date,
  childCount: Number, sistemNakit: Number, sistemKart: Number, sistemHavale: Number,
  sistemToplam: Number, kasaNakit: Number, posCiro: Number, havaleCiro: Number,
  gercekToplam: Number, prevCash: Number, totalExpense: Number, netCash: Number,
  products: [{ name: String, count: Number, total: Number }],
  expenses: [{ desc: String, amount: Number }],
  transactions: [{ childName: String, grand: Number, payment: String, time: String }],
}, { timestamps: true });

// Kullanıcı şeması
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  displayName: String,
  role: { type: String, default: 'staff' }, // admin | staff | readonly
  permissions: {
    canSell: { type: Boolean, default: true },
    canViewReport: { type: Boolean, default: false },
    canManageTables: { type: Boolean, default: true },
    canAddChildren: { type: Boolean, default: true },
  },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// Oyun grubu rezervasyon şeması
const reservationSchema = new mongoose.Schema({
  parentName: String,
  parentPhone: String,
  childName: String,
  date: String, // "2025-05-10"
  displayDate: String, // "10 Mayıs Cumartesi"
  duration: Number,
  note: String,
  status: { type: String, default: 'bekliyor' }, // bekliyor | geldi | iptal
}, { timestamps: true });

const Child         = mongoose.model('Child', childSchema);
const Transaction   = mongoose.model('Transaction', transactionSchema);
const Expense       = mongoose.model('Expense', expenseSchema);
const Setting       = mongoose.model('Setting', settingsSchema);
const TableOrder    = mongoose.model('TableOrder', tableSchema);
const ClosingReport = mongoose.model('ClosingReport', closingReportSchema);
const User          = mongoose.model('User', userSchema);
const Reservation   = mongoose.model('Reservation', reservationSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lunacafe';
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB bağlandı');
    // Varsayılan admin kullanıcıları oluştur
    await seedUsers();
  })
  .catch(err => console.error('❌ MongoDB hatası:', err));

async function seedUsers() {
  const count = await User.countDocuments();
  if (count === 0) {
    await User.insertMany([
      { username:'luna', password:'luna2025', displayName:'Luna Admin', role:'admin', permissions:{canSell:true,canViewReport:true,canManageTables:true,canAddChildren:true} },
      { username:'admin', password:'karaca2025', displayName:'Karaca Admin', role:'admin', permissions:{canSell:true,canViewReport:true,canManageTables:true,canAddChildren:true} },
    ]);
    console.log('✅ Varsayılan kullanıcılar oluşturuldu');
  }
}

// ══ AUTH API ══
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password, active: true });
  if (!user) return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre' });
  res.json({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions,
  });
});

// ══ USER API ══
app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: 1 });
  res.json(users);
});

app.post('/api/users', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    io.emit('users:update');
    res.json(user);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    io.emit('users:update');
    res.json(user);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  io.emit('users:update');
  res.json({ ok: true });
});

// ══ CHILDREN API ══
app.get('/api/children', async (req, res) => {
  const kids = await Child.find({ status: { $ne: 'paid' } }).sort({ createdAt: 1 });
  res.json(kids);
});
app.post('/api/children', async (req, res) => {
  try { const c = new Child(req.body); await c.save(); io.emit('children:update'); res.json(c); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/children/:id', async (req, res) => {
  try { const c = await Child.findByIdAndUpdate(req.params.id, req.body, { new: true }); io.emit('children:update'); res.json(c); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/children/:id', async (req, res) => {
  await Child.findByIdAndDelete(req.params.id);
  io.emit('children:update');
  res.json({ ok: true });
});

// ══ TRANSACTIONS API ══
app.get('/api/transactions', async (req, res) => {
  const txs = await Transaction.find().sort({ createdAt: -1 }); res.json(txs);
});
app.post('/api/transactions', async (req, res) => {
  try { const tx = new Transaction(req.body); await tx.save(); io.emit('transactions:update'); res.json(tx); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

// ══ EXPENSES API ══
app.get('/api/expenses', async (req, res) => {
  const exps = await Expense.find().sort({ createdAt: 1 }); res.json(exps);
});
app.post('/api/expenses', async (req, res) => {
  try { const exp = new Expense(req.body); await exp.save(); io.emit('expenses:update'); res.json(exp); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/expenses/:id', async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id); io.emit('expenses:update'); res.json({ ok: true });
});

// ══ SETTINGS API ══
app.get('/api/settings/:key', async (req, res) => {
  const s = await Setting.findOne({ key: req.params.key }); res.json(s ? s.value : null);
});
app.post('/api/settings/:key', async (req, res) => {
  await Setting.findOneAndUpdate({ key: req.params.key }, { value: req.body.value }, { upsert: true });
  res.json({ ok: true });
});

// ══ TABLES API ══
app.get('/api/tables', async (req, res) => {
  const tables = await TableOrder.find().sort({ tableNo: 1 }); res.json(tables);
});
app.post('/api/tables/:no/add-product', async (req, res) => {
  try {
    const { name, price } = req.body;
    let table = await TableOrder.findOne({ tableNo: req.params.no });
    if (!table) table = new TableOrder({ tableNo: parseInt(req.params.no), products: [], status: 'active', openedAt: new Date() });
    table.products.push({ name, price });
    table.status = 'active';
    if (!table.openedAt) table.openedAt = new Date();
    await table.save();
    io.emit('tables:update');
    res.json(table);
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/tables/:no/checkout', async (req, res) => {
  try {
    const { payment } = req.body;
    const table = await TableOrder.findOne({ tableNo: req.params.no });
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });
    const grand = table.products.reduce((s, p) => s + p.price, 0);
    const tx = new Transaction({ clientId: Date.now(), childName: `Masa ${req.params.no}`, duration: 0, price: 0, products: table.products, prodTotal: grand, grand, payment, time: new Date().toLocaleTimeString('tr-TR') });
    await tx.save();
    await TableOrder.findOneAndDelete({ tableNo: req.params.no });
    io.emit('tables:update'); io.emit('transactions:update');
    res.json({ ok: true, grand });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/tables/:no', async (req, res) => {
  await TableOrder.findOneAndDelete({ tableNo: req.params.no });
  io.emit('tables:update'); res.json({ ok: true });
});

// ══ CLOSING REPORTS API ══
app.get('/api/closing-reports', async (req, res) => {
  const reports = await ClosingReport.find().sort({ dateKey: -1 }); res.json(reports);
});
app.post('/api/closing-reports', async (req, res) => {
  try { const r = new ClosingReport(req.body); await r.save(); res.json(r); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

// ══ RESERVATIONS API ══
app.get('/api/reservations', async (req, res) => {
  const resv = await Reservation.find().sort({ date: 1, createdAt: 1 }); res.json(resv);
});
app.post('/api/reservations', async (req, res) => {
  try { const r = new Reservation(req.body); await r.save(); io.emit('reservations:update'); res.json(r); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/reservations/:id', async (req, res) => {
  try { const r = await Reservation.findByIdAndUpdate(req.params.id, req.body, { new: true }); io.emit('reservations:update'); res.json(r); }
  catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/reservations/:id', async (req, res) => {
  await Reservation.findByIdAndDelete(req.params.id); io.emit('reservations:update'); res.json({ ok: true });
});

// ══ RESET ══
app.post('/api/reset', async (req, res) => {
  await Transaction.deleteMany({}); await Expense.deleteMany({});
  await Child.deleteMany({ status: 'paid' }); io.emit('reset'); res.json({ ok: true });
});

// ══ ROUTES ══
app.get('/tv', (req, res) => {
  const p1 = path.join(publicPath, 'tv.html');
  const p2 = path.join(__dirname, 'tv.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('TV sayfası bulunamadı');
});

app.get('*', (req, res) => {
  const idx = fs.existsSync(path.join(publicPath,'index.html'))
    ? path.join(publicPath,'index.html')
    : path.join(__dirname,'index.html');
  res.sendFile(idx);
});

// ══ SOCKET ══
io.on('connection', socket => {
  console.log('📱 Bağlandı:', socket.id);
  socket.on('disconnect', () => console.log('📴 Ayrıldı:', socket.id));
});

// ══ TIMER ══
setInterval(async () => {
  try {
    const active = await Child.find({ status: { $in: ['running','warning'] } });
    if (!active.length) return;
    const bulkOps = [], alerts = [], ticks = [];
    active.forEach(c => {
      const r = Math.max(0, c.remaining - 1);
      let s = c.status;
      if (r === 0) { s = 'expired'; alerts.push({ type:'expired', name:c.fullName, firstName:c.firstName, id:c._id }); }
      else if (r <= 300 && c.status === 'running') { s = 'warning'; alerts.push({ type:'warning', name:c.fullName, firstName:c.firstName, id:c._id }); }
      bulkOps.push({ updateOne: { filter:{_id:c._id}, update:{remaining:r,status:s} } });
      ticks.push({ id:c._id, remaining:r, status:s });
    });
    if (bulkOps.length) await Child.bulkWrite(bulkOps);
    if (alerts.length) { alerts.forEach(a => io.emit('timer:alert', a)); io.emit('children:update'); }
    else { io.emit('timer:tick', ticks); }
  } catch(e) {}
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌙 Luna Cafe Kids → http://localhost:${PORT}`));
