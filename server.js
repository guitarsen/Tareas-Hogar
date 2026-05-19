const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const app = express();
const adapter = new FileSync('.data/db.json');
const db = low(adapter);

// Default state
db.defaults({
  p1: { name: 'Andrea', pts: 0 },
  p2: { name: 'Arnau', pts: 0 },
  history: [],
  weekStart: new Date().toISOString()
}).write();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients for real-time push
let clients = [];

function broadcast(data) {
  clients.forEach(c => {
    try { c.res.write(`data: ${JSON.stringify(data)}\n\n`); } catch(e) {}
  });
}

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const id = Date.now();
  clients.push({ id, res });

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify({ type: 'state', state: db.getState() })}\n\n`);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== id);
  });
});

// GET state
app.get('/api/state', (req, res) => {
  res.json(db.getState());
});

// POST task — add points
app.post('/api/task', (req, res) => {
  const { who, task, icon, pts } = req.body;
  if (!who || !task || !pts) return res.status(400).json({ error: 'Missing fields' });

  const current = db.get(`${who}.pts`).value();
  db.set(`${who}.pts`, current + pts).write();

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const entry = { who, task, icon, pts, time: `${hh}:${mm}`, ts: Date.now() };

  db.get('history').push(entry).write();

  const newState = db.getState();
  broadcast({ type: 'state', state: newState });
  res.json(newState);
});

// POST reset week
app.post('/api/reset', (req, res) => {
  db.set('p1.pts', 0)
    .set('p2.pts', 0)
    .set('history', [])
    .set('weekStart', new Date().toISOString())
    .write();

  const newState = db.getState();
  broadcast({ type: 'state', state: newState });
  res.json(newState);
});

// POST update names
app.post('/api/names', (req, res) => {
  const { name1, name2 } = req.body;
  if (name1) db.set('p1.name', name1).write();
  if (name2) db.set('p2.name', name2).write();

  const newState = db.getState();
  broadcast({ type: 'state', state: newState });
  res.json(newState);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tareas Hogar corriendo en puerto ${PORT}`));
