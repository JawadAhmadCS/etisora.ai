const els = {
  apiBase: document.getElementById("apiBase"),
  pingBtn: document.getElementById("pingBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statusPill: document.getElementById("statusPill"),
  sessionText: document.getElementById("sessionText"),
  messages: document.getElementById("messages"),
  quickReplies: document.getElementById("quickReplies"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
};

const STORAGE_KEYS = {
  apiBase: "etisora_api_base",
  sessionId: "etisora_session_id",
};

const LOCAL_GREETING =
  "Hi there! Welcome to Etisora.\n\nWe help businesses across the globe automate their growth with custom AI agents.\n\nTo connect you with the right person, are you:\n  [1] New to Etisora\n  [2] An existing client";

let currentSessionId = localStorage.getItem(STORAGE_KEYS.sessionId) || makeSessionId();

init();

function init() {
  const savedBase = localStorage.getItem(STORAGE_KEYS.apiBase);
  if (savedBase) els.apiBase.value = savedBase;

  persistSession();
  showSession();
  startVisualChat();
  wireEvents();
}

function wireEvents() {
  els.apiBase.addEventListener("change", saveApiBase);
  els.pingBtn.addEventListener("click", pingServer);
  els.newChatBtn.addEventListener("click", startNewChat);
  els.resetBtn.addEventListener("click", resetSessionOnServer);
  els.chatForm.addEventListener("submit", onSend);
}

function saveApiBase() {
  localStorage.setItem(STORAGE_KEYS.apiBase, normalizedBaseUrl());
}

function normalizedBaseUrl() {
  return (els.apiBase.value || "http://localhost:3000").trim().replace(/\/+$/, "");
}

function makeSessionId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}`;
}

function persistSession() {
  localStorage.setItem(STORAGE_KEYS.sessionId, currentSessionId);
}

function showSession() {
  els.sessionText.textContent = `Session: ${currentSessionId}`;
}

function setStatus(text, type) {
  els.statusPill.textContent = text;
  els.statusPill.className = `pill ${type}`;
}

function clearChat() {
  els.messages.innerHTML = "";
  els.quickReplies.innerHTML = "";
}

function startVisualChat() {
  clearChat();
  addMessage("bot", LOCAL_GREETING);
  renderQuickReplies(LOCAL_GREETING);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function addMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = escapeHtml(text || "").replace(/\n/g, "<br>");

  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function getQuickOptions(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const m = line.match(/^\[(\d+)\]\s*(.+)$/);
      return m ? { value: m[1], label: m[2] } : null;
    })
    .filter(Boolean);
}

function renderQuickReplies(botText) {
  els.quickReplies.innerHTML = "";
  const options = getQuickOptions(botText);
  options.forEach((opt) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = `[${opt.value}] ${opt.label}`;
    chip.addEventListener("click", () => sendMessage(opt.value));
    els.quickReplies.appendChild(chip);
  });
}

async function pingServer() {
  saveApiBase();
  setStatus("Checking...", "neutral");
  try {
    const res = await fetch(`${normalizedBaseUrl()}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(data.status === "ok" ? "Online" : "Unexpected", "ok");
  } catch (err) {
    setStatus("Offline", "bad");
  }
}

async function startNewChat() {
  await resetSessionOnServer();
  currentSessionId = makeSessionId();
  persistSession();
  showSession();
  startVisualChat();
}

async function resetSessionOnServer() {
  try {
    await fetch(`${normalizedBaseUrl()}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    });
  } catch (err) {
    // Ignore reset failures: local state can still start fresh.
  }
}

async function onSend(e) {
  e.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text) return;
  els.messageInput.value = "";
  await sendMessage(text);
}

async function sendMessage(text) {
  addMessage("user", text);
  els.sendBtn.disabled = true;
  els.quickReplies.innerHTML = "";

  try {
    const res = await fetch(`${normalizedBaseUrl()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: text,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    addMessage("bot", data.reply || "No response");
    renderQuickReplies(data.reply || "");
  } catch (err) {
    addMessage(
      "bot",
      "Connection error. Please make sure `node server.js` is running on your API URL."
    );
  } finally {
    els.sendBtn.disabled = false;
    els.messageInput.focus();
  }
}
