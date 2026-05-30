// ============================================================
//  server.js — Express API server
//  Exposes the chatbot as a REST endpoint so any frontend
//  (website widget, React app, mobile app) can call it.
//
//  Run with:  node server.js
//  Endpoint:  POST /chat
// ============================================================

require('dotenv').config();

const express                = require('express');
const cors                   = require('cors');
const { processMessage,
        createSession }      = require('./chatbot');
const { ensureHeaders }      = require('./sheets');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());          // allow requests from your website domain
app.use(express.json());

// ── IN-MEMORY SESSION STORE ───────────────────────────────────
// For production replace this with Redis or a DB
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createSession());
  }
  return sessions.get(sessionId);
}

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Etisora Chatbot API' });
});

// ── MAIN CHAT ENDPOINT ────────────────────────────────────────
//
//  Request body:
//  {
//    "sessionId": "unique-user-or-browser-id",
//    "message":   "user's message text"
//  }
//
//  Response:
//  {
//    "reply":     "bot's response",
//    "state":     "current conversation state",
//    "done":      true/false
//  }
//
app.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const session = getSession(sessionId);
    const reply   = await processMessage(message || '', session);

    res.json({
      reply,
      state: session.state,
      done:  session.state === 'DONE',
    });
  } catch (err) {
    console.error('❌ Chat error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── RESET SESSION ─────────────────────────────────────────────
//  Call this when the user closes the chat widget
app.post('/reset', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) sessions.delete(sessionId);
  res.json({ status: 'reset' });
});

// ── START ─────────────────────────────────────────────────────
async function start() {
  try {
    await ensureHeaders();
    console.log('✅ Google Sheets connected');
  } catch (err) {
    console.warn('⚠️  Google Sheets not connected:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Etisora Chatbot API running on http://localhost:${PORT}`);
    console.log(`   POST /chat  — send messages`);
    console.log(`   POST /reset — clear a session\n`);
  });
}

start();
