# Etisora Website + Stateful Chatbot (Local Run Guide)

## Requirements
- Node.js 18+ installed

## Run Locally
1. Open terminal in this folder:
`c:\Users\mjawa\Pictures\AI Projects\etisora.ai`
2. Install dependencies:
```bash
npm install
```
3. Start local server:
```bash
npm run dev
```
4. Open in browser:
`http://localhost:3000`

## Environment Setup (Required for full chatbot)
Create `.env` file in project root:

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SHEET_TAB=Inquiries
```

Chat endpoint:
- `POST /api/chat` with JSON body:
```json
{
  "sessionId": "visitor-session-id",
  "message": "user text"
}
```

Response:
```json
{
  "reply": "bot reply",
  "state": "CURRENT_STATE",
  "done": false
}
```
