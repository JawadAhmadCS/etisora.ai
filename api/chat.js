const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env"), quiet: true });
const { processMessage, createSession, MSG } = require("../chatbot");
const { ensureHeaders } = require("../sheets");

const sessions = globalThis.__etisoraChatSessions || new Map();
globalThis.__etisoraChatSessions = sessions;

let headersInitPromise = null;
function ensureHeadersOnce() {
  if (!headersInitPromise) {
    headersInitPromise = ensureHeaders().catch((err) => {
      console.warn("Google Sheets header init failed:", err.message);
      headersInitPromise = null;
    });
  }
  return headersInitPromise;
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createSession());
  }
  return sessions.get(sessionId);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
    const message = typeof body.message === "string" ? body.message : "";

    if (!sessionId) {
      return res.status(400).json({ error: { message: "sessionId is required" } });
    }

    await ensureHeadersOnce();
    const session = getSession(sessionId);
    const reply = await processMessage(message, session);

    return res.status(200).json({
      reply,
      state: session.state,
      done: session.state === "DONE",
      greeting: MSG.greeting,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: err && err.message ? err.message : "Unexpected server error" } });
  }
};
