const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory auth token (reset when server restarts)
let currentToken = null;
// NOTE: change this password before deploying publicly
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vrutant123';

const dataDir = path.join(__dirname, 'data');
const portfolioFile = path.join(dataDir, 'portfolio_data.json');
const messagesFile = path.join(dataDir, 'messages.json');
const invoicesFile = path.join(dataDir, 'invoices.json');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Failed to read', file, e);
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

// Middleware
app.use(express.json({ limit: '20mb' }));

// Very simple auth middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== currentToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Login route
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Generate simple token
  currentToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  res.json({ token: currentToken });
});

// Portfolio: public GET used by script.js
app.get('/portfolio_data.json', (req, res) => {
  const data = readJson(portfolioFile, {});
  res.json(data);
});

// Portfolio: admin update
app.put('/api/portfolio', requireAuth, (req, res) => {
  const data = req.body || {};
  writeJson(portfolioFile, data);
  res.json({ success: true });
});

// Media upload (images, video, etc.)
// Expects JSON: { fileName, content, folder? } where content is a data URL or base64 string
app.post('/api/upload', requireAuth, (req, res) => {
  try {
    const { fileName, content, folder } = req.body || {};
    if (!fileName || !content) {
      return res.status(400).json({ error: 'fileName and content are required' });
    }

    // Basic sanitization of file name
    const safeName = Date.now().toString(36) + '-' + fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const targetDir = folder
      ? path.join(uploadsDir, folder.replace(/[^a-zA-Z0-9_-]/g, '_'))
      : uploadsDir;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let base64 = content;
    const commaIndex = content.indexOf(',');
    if (commaIndex !== -1) {
      base64 = content.slice(commaIndex + 1);
    }

    const buffer = Buffer.from(base64, 'base64');
    const filePath = path.join(targetDir, safeName);
    fs.writeFileSync(filePath, buffer);

    // Public URL path relative to site root
    const publicPath = '/uploads' + (folder ? '/' + folder.replace(/[^a-zA-Z0-9_-]/g, '_') : '') + '/' + safeName;

    res.json({ success: true, url: publicPath, fileName: safeName });
  } catch (e) {
    console.error('Upload failed', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Messages API
app.post('/api/messages', (req, res) => {
  const messages = readJson(messagesFile, []);
  const now = new Date().toISOString();
  const id = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const msg = { id, read: false, createdAt: now, ...req.body };
  messages.push(msg);
  writeJson(messagesFile, messages);
  res.json({ success: true, id });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const messages = readJson(messagesFile, []);
  res.json(messages);
});

app.patch('/api/messages/:id', requireAuth, (req, res) => {
  const messages = readJson(messagesFile, []);
  const { id } = req.params;
  const idx = messages.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  messages[idx] = { ...messages[idx], ...req.body };
  writeJson(messagesFile, messages);
  res.json({ success: true });
});

app.delete('/api/messages/:id', requireAuth, (req, res) => {
  const messages = readJson(messagesFile, []);
  const { id } = req.params;
  const next = messages.filter(m => m.id !== id);
  writeJson(messagesFile, next);
  res.json({ success: true });
});

// Invoices API
app.get('/api/invoices', requireAuth, (req, res) => {
  const invoices = readJson(invoicesFile, []);
  res.json(invoices);
});

app.post('/api/invoices', requireAuth, (req, res) => {
  const invoices = readJson(invoicesFile, []);
  const now = new Date().toISOString();
  const id = 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const inv = { id, createdAt: now, status: 'unpaid', ...req.body };
  invoices.push(inv);
  writeJson(invoicesFile, invoices);
  res.json({ success: true, id });
});

app.patch('/api/invoices/:id', requireAuth, (req, res) => {
  const invoices = readJson(invoicesFile, []);
  const { id } = req.params;
  const idx = invoices.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  invoices[idx] = { ...invoices[idx], ...req.body };
  writeJson(invoicesFile, invoices);
  res.json({ success: true });
});

// Delete invoice
app.delete('/api/invoices/:id', requireAuth, (req, res) => {
  const invoices = readJson(invoicesFile, []);
  const { id } = req.params;
  const next = invoices.filter(i => i.id !== id);
  writeJson(invoicesFile, next);
  res.json({ success: true });
});

// Invoice PDF download
app.get('/api/invoices/:id/pdf', requireAuth, (req, res) => {
  const invoices = readJson(invoicesFile, []);
  const { id } = req.params;
  const inv = invoices.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: 'Not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${id}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text('Invoice', { align: 'center' }).moveDown();

  doc.fontSize(12).text(`Invoice ID: ${inv.id}`);
  doc.text(`Date: ${inv.createdAt || new Date().toISOString()}`);
  doc.moveDown();

  doc.fontSize(14).text('Bill To:', { underline: true });
  doc.fontSize(12).text(inv.clientName || '');
  doc.text(inv.project ? `Project: ${inv.project}` : '');
  doc.moveDown();

  doc.fontSize(12).text(`Amount: ${inv.amount || 0} ${inv.currency || ''}`);
  doc.text(`Status: ${inv.status || 'unpaid'}`);
  if (inv.notes) {
    doc.moveDown();
    doc.text('Notes:', { underline: true });
    doc.text(inv.notes);
  }

  doc.end();
});

// Serve static files (portfolio + admin)
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
