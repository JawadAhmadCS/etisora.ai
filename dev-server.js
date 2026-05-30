const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const { processMessage, createSession, MSG } = require("./chatbot");
const { ensureHeaders } = require("./sheets");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const sessions = new Map();
let headersInitPromise = null;

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createSession());
  }
  return sessions.get(sessionId);
}

function ensureHeadersOnce() {
  if (!headersInitPromise) {
    headersInitPromise = ensureHeaders().catch((err) => {
      console.warn("Google Sheets header init failed:", err.message);
      headersInitPromise = null;
    });
  }
  return headersInitPromise;
}

async function handleChat(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: { message: "Method not allowed" } });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) req.destroy();
  });
  req.on("end", async () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId.trim()
        : null;
      const message = typeof body.message === "string" ? body.message : "";

      if (!sessionId) {
        return sendJson(res, 400, { error: { message: "sessionId is required" } });
      }

      await ensureHeadersOnce();
      const session = getSession(sessionId);
      const reply = await processMessage(message, session);

      return sendJson(res, 200, {
        reply,
        state: session.state,
        done: session.state === "DONE",
        greeting: MSG.greeting,
      });
    } catch (err) {
      sendJson(res, 500, { error: { message: err && err.message ? err.message : "Unexpected server error" } });
    }
  });
}

function handleReset(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: { message: "Method not allowed" } });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 250_000) req.destroy();
  });
  req.on("end", () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (sessionId) sessions.delete(sessionId);
      return sendJson(res, 200, { status: "reset" });
    } catch (err) {
      return sendJson(res, 400, { error: { message: "Invalid JSON body" } });
    }
  });
}

function serveStatic(req, res) {
  const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const target = reqPath === "/" ? "/index.html" : reqPath;
  const fullPath = path.resolve(ROOT, "." + target);

  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found");
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(fullPath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const reqPath = (req.url || "/").split("?")[0];
  if (reqPath === "/api/chat" || reqPath === "/api/chat.php") {
    return handleChat(req, res);
  }
  if (reqPath === "/api/reset") {
    return handleReset(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Etisora local server running at http://localhost:${PORT}`);
  ensureHeadersOnce();
});
