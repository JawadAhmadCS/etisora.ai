# Etisora Website (Local Run Guide)

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

## Optional Environment Setup (Chat API)
If chatbot API is needed, create `.env` file in project root:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

Without `GROQ_API_KEY`, chat endpoint `/api/chat` will return server error.

