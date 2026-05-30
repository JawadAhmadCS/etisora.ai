# Etisora AI Chatbot — Setup Guide

## Project Structure

```
etisora-chatbot/
├── .env.example      ← copy to .env and fill in your keys
├── chatbot.js        ← core conversation logic (state machine)
├── openai.js         ← OpenAI integration (fallback + rephrasing)
├── sheets.js         ← Google Sheets integration (saves inquiries)
├── index.js          ← terminal runner (for local testing)
├── server.js         ← Express API server (for your website)
└── package.json
```

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Set up your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

### OpenAI key
```
OPENAI_API_KEY=sk-your-key-here
```
Get yours at: https://platform.openai.com/api-keys

### Google Sheets
You need a **Google Cloud Service Account**. Here's how:

1. Go to https://console.cloud.google.com
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Download the JSON key file
6. Copy `client_email` → paste as `GOOGLE_SERVICE_ACCOUNT_EMAIL` in .env
7. Copy `private_key` → paste as `GOOGLE_PRIVATE_KEY` in .env (keep the quotes)

Then:
8. Create a new Google Sheet
9. **Share it** with your service account email (Editor access)
10. Copy the Sheet ID from the URL and paste as `GOOGLE_SHEET_ID`

---

## Step 3 — Test locally in terminal

```bash
node index.js
```

This runs the full chatbot in your terminal. Type replies to test every branch.
 
---

## Step 4 — Run as an API server

```bash
node server.js
```

The server starts on http://localhost:3000

**Send a message:**
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user-123", "message": "1"}'
```

**Response:**
```json
{
  "reply": "Great, welcome! We work across a wide range of industries...",
  "state": "A_INDUSTRY",
  "done": false
}
```

---

## Step 5 — Connect to your website widget

Call `POST /chat` from your frontend chatbot widget with:
- `sessionId` — a unique ID per visitor (e.g. UUID stored in localStorage)
- `message` — what the user typed or the button they clicked

The API returns the bot's `reply` text to display in the widget.

---

## Google Sheet columns (auto-created)

| Column | Description |
|--------|-------------|
| Timestamp | When the inquiry was submitted |
| Customer Type | New / Existing |
| Industry | Path A only |
| Pain Point | Path A only |
| Timeline | Path A only |
| Support Type | Path B only |
| Name | Contact name |
| Email | Contact email |
| Phone | Optional |
| Description | Their inquiry |
| Preferred Contact Time | Optional |
| Contact Method | Email / Phone / WhatsApp |
| Dept. Tag | Sales / Support / Billing — for triage |

---

## Deployment

For production, deploy `server.js` to:
- **Railway** (easiest — free tier available)
- **Render** (free tier available)
- **Heroku**
- Any Node.js hosting

Set your `.env` variables as environment variables in the hosting dashboard.
