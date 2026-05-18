const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

const envFile = parseEnv(path.join(ROOT, ".env"));
const groqApiKey = process.env.GROQ_API_KEY || envFile.GROQ_API_KEY || "";
const defaultModel = process.env.GROQ_MODEL || envFile.GROQ_MODEL || "llama-3.3-70b-versatile";

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

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handleChat(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: { message: "Method not allowed" } });
  }
  if (!groqApiKey) {
    return sendJson(res, 500, { error: { message: "Server missing GROQ_API_KEY env var" } });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) req.destroy();
  });
  req.on("end", async () => {
    try {
      const body = raw ? JSON.parse(raw) : {};
      const payload = {
        model: body.model || defaultModel,
        messages: Array.isArray(body.messages) ? body.messages : [],
        temperature: typeof body.temperature === "number" ? body.temperature : 0.6,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 300,
      };

      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(text);
    } catch (err) {
      sendJson(res, 500, { error: { message: err && err.message ? err.message : "Unexpected server error" } });
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
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Etisora local server running at http://localhost:${PORT}`);
});
