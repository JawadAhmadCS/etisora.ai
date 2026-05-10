module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const token = body.token;
    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token" });
    }

    const secret = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
    const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();

    const payload = new URLSearchParams();
    payload.set("secret", secret);
    payload.set("response", token);
    if (ip) payload.set("remoteip", ip);

    const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString()
    });
    const data = await cfRes.json();
    return res.status(200).json({
      success: !!data.success,
      errors: data["error-codes"] || []
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err && err.message ? err.message : "Unexpected server error" });
  }
};
