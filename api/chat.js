module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: "Server missing GROQ_API_KEY env var" } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const model = body.model || "llama-3.3-70b-versatile";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const temperature = typeof body.temperature === "number" ? body.temperature : 0.6;
    const max_tokens = typeof body.max_tokens === "number" ? body.max_tokens : 300;

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      })
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err && err.message ? err.message : "Unexpected server error" } });
  }
};
