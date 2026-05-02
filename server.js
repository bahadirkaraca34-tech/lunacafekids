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

// Masa şeması
const tableSchema = new mongoose.Schema({
  tableNo:  { type: Number, required: true, unique: true },
  products: [{ name: String, price: Number }],
  status:   { type: String, default: 'empty' }, // empty | active
  openedAt: Date,
}, { timestamps: true });

const TableOrder = mongoose.model('TableOrder', tableSchema);
const closingReportSchema = new mongoose.Schema({
  date:         String,   // "01.05.2025"
  dateKey:      String,   // "2025-05-01" (sıralama için)
  closedAt:     Date,
  childCount:   Number,
  sistemNakit:  Number,
  sistemKart:   Number,
  sistemToplam: Number,
  kasaNakit:    Number,
  posCiro:      Number,
  gercekToplam: Number,
  prevCash:     Number,
  totalExpense: Number,
  netCash:      Number,
  products:     [{ name: String, count: Number, total: Number }],
  expenses:     [{ desc: String, amount: Number }],
  transactions: [{ childName: String, grand: Number, payment: String, time: String }],
}, { timestamps: true });

const Child         = mongoose.model('Child', childSchema);
const Transaction   = mongoose.model('Transaction', transactionSchema);
const Expense       = mongoose.model('Expense', expenseSchema);
const Setting       = mongoose.model('Setting', settingsSchema);
const ClosingReport = mongoose.model('ClosingReport', closingReportSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lunacafe';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB bağlandı'))
  .catch(err => console.error('❌ MongoDB hatası:', err));

// ══ API ══
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

app.get('/api/transactions', async (req, res) => {
  const txs = await Transaction.find().sort({ createdAt: -1 }); res.json(txs);
});
app.post('/api/transactions', async (req, res) => {
  try { const tx = new Transaction(req.body); await tx.save(); io.emit('transactions:update'); res.json(tx); }
  catch(e) { res.status(400).json({ error: e.message }); }
});

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

app.get('/api/settings/:key', async (req, res) => {
  const s = await Setting.findOne({ key: req.params.key }); res.json(s ? s.value : null);
});
app.post('/api/settings/:key', async (req, res) => {
  await Setting.findOneAndUpdate({ key: req.params.key }, { value: req.body.value }, { upsert: true });
  res.json({ ok: true });
});

// ══ MASA API ══
app.get('/api/tables', async (req, res) => {
  const tables = await TableOrder.find().sort({ tableNo: 1 });
  res.json(tables);
});

app.post('/api/tables/:no/add-product', async (req, res) => {
  try {
    const { name, price } = req.body;
    let table = await TableOrder.findOne({ tableNo: req.params.no });
    if (!table) {
      table = new TableOrder({ tableNo: parseInt(req.params.no), products: [], status: 'active', openedAt: new Date() });
    }
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
    // Transaction olarak kaydet
    const tx = new Transaction({
      clientId: Date.now(),
      childName: `Masa ${req.params.no}`,
      duration: 0, price: 0,
      products: table.products,
      prodTotal: grand, grand, payment,
      time: new Date().toLocaleTimeString('tr-TR'),
    });
    await tx.save();
    await TableOrder.findOneAndDelete({ tableNo: req.params.no });
    io.emit('tables:update');
    io.emit('transactions:update');
    res.json({ ok: true, grand });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/tables/:no', async (req, res) => {
  await TableOrder.findOneAndDelete({ tableNo: req.params.no });
  io.emit('tables:update');
  res.json({ ok: true });
});

// ══ GÜNSONU RAPORU API ══
app.get('/api/closing-reports', async (req, res) => {
  const reports = await ClosingReport.find().sort({ dateKey: -1 });
  res.json(reports);
});

app.post('/api/closing-reports', async (req, res) => {
  try {
    const report = new ClosingReport(req.body);
    await report.save();
    res.json(report);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/closing-reports/:id', async (req, res) => {
  const report = await ClosingReport.findById(req.params.id);
  res.json(report);
});

// Reset day
app.post('/api/reset', async (req, res) => {
  await Transaction.deleteMany({});
  await Expense.deleteMany({});
  await Child.deleteMany({ status: 'paid' });
  io.emit('reset');
  res.json({ ok: true });
});

app.get('/tv', (req, res) => {
  // public/tv.html veya ana dizindeki tv.html
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

io.on('connection', socket => {
  console.log('📱 Bağlandı:', socket.id);
  socket.on('disconnect', () => console.log('📴 Ayrıldı:', socket.id));
});

setInterval(async () => {
  try {
    const active = await Child.find({ status: { $in: ['running','warning'] } });
    if (!active.length) return;
    const bulkOps = [], alerts = [];
    active.forEach(c => {
      const r = Math.max(0, c.remaining - 1);
      let s = c.status;
      if (r === 0) { s = 'expired'; alerts.push({ type:'expired', name:c.fullName, firstName:c.firstName, id:c._id }); }
      else if (r <= 300 && c.status === 'running') { s = 'warning'; alerts.push({ type:'warning', name:c.fullName, firstName:c.firstName, id:c._id }); }
      bulkOps.push({ updateOne: { filter:{_id:c._id}, update:{remaining:r,status:s} } });
    });
    if (bulkOps.length) await Child.bulkWrite(bulkOps);
    if (alerts.length) { alerts.forEach(a => io.emit('timer:alert', a)); io.emit('children:update'); }
    else { io.emit('timer:tick', active.map(c => ({ id:c._id, remaining:Math.max(0,c.remaining-1), status:c.status }))); }
  } catch(e) {}
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌙 Luna Cafe Kids → http://localhost:${PORT}`));
