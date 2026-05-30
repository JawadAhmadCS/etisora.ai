// ============================================================
//  openai.js - OpenAI integration with Groq backup
//  Used for fallback handling when user input is unrecognised
//  and for generating natural language variations of bot replies
// ============================================================

const OpenAI = require('openai');

// Primary + backup model selection
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

let openaiClient = null;
let groqClient = null;

function hasUsableKey(value) {
  if (!value) return false;
  const key = String(value).trim();
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower.includes('your_openai_api_key_here')) return false;
  if (lower.includes('your_groq_api_key_here')) return false;
  return true;
}

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!hasUsableKey(key)) return null;
  // OpenAI API keys start with `sk-`; skip obvious non-OpenAI values.
  if (!String(key).trim().startsWith('sk-')) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function getGroqClient() {
  const key = process.env.GROQ_API_KEY;
  if (!hasUsableKey(key)) return null;
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: key,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return groqClient;
}

function extractText(response) {
  return response?.choices?.[0]?.message?.content?.trim() || '';
}

async function createCompletionWithBackup({ messages, maxTokens }) {
  const openai = getOpenAIClient();
  const groq = getGroqClient();

  if (!openai && !groq) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or GROQ_API_KEY.');
  }

  let openaiError = null;
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages,
      });

      const text = extractText(response);
      if (text) return text;
      throw new Error('OpenAI returned empty content.');
    } catch (err) {
      openaiError = err;
      console.warn('OpenAI failed, switching to Groq:', err.message);
    }
  }

  if (!groq) {
    throw openaiError || new Error('Groq backup not configured.');
  }

  try {
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages,
    });

    const text = extractText(response);
    if (text) return text;
    throw new Error('Groq returned empty content.');
  } catch (groqErr) {
    if (openaiError) {
      throw new Error(
        `OpenAI failed (${openaiError.message}) and Groq failed (${groqErr.message}).`
      );
    }
    throw groqErr;
  }
}

function buildSessionContext(session = {}) {
  const safeHistory = Array.isArray(session.history)
    ? session.history.slice(-12).map((item) => ({
        role: item?.role || 'unknown',
        text: String(item?.text || '').slice(0, 280),
      }))
    : [];

  return {
    state: session.state || 'UNKNOWN',
    customerType: session.customerType || null,
    industry: session.industry || null,
    painPoint: session.painPoint || null,
    timeline: session.timeline || null,
    supportType: session.supportType || null,
    name: session.name || null,
    emailSkipped: Boolean(session.emailSkipped),
    contactMethod: session.contactMethod || null,
    description: session.description || null,
    history: safeHistory,
  };
}

// This defines Etisora's chatbot personality
const SYSTEM_PROMPT = `
You are the friendly AI assistant for Etisora (etisora.ai), a company that helps small
businesses grow using custom AI agents and digital marketing automation.

Your personality:
- Warm, professional, and confident
- You keep answers short (2-4 sentences max)
- You always guide the user back to one of these paths:
  1. Leaving an inquiry so the right team can follow up
  2. Learning more about Etisora's services
- Etisora operates globally and its team is available 24/7
- Response time for all inquiries is within 24 hours

Never make up prices or specific product details. If unsure, offer to connect them with the team.
Always end with a question or a soft call to action.
`;

/**
 * Generates a smart fallback reply when the user types something
 * outside the expected flow buttons.
 *
 * @param {string} userMessage - what the user typed
 * @param {object} session     - current session context
 * @returns {string}           - AI-generated reply
 */
async function getFallbackReply(userMessage, session = {}) {
  const context = buildSessionContext(session);
  const contextNote = `Conversation context: ${JSON.stringify(context)}`;

  return createCompletionWithBackup({
    maxTokens: 150,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextNote },
      { role: 'user', content: userMessage },
    ],
  });
}

/**
 * Reviews a drafted reply with full context and returns an improved version.
 * Falls back to the original draft when AI output is empty/unusable.
 */
async function reviewReplyWithContext({ userMessage, draftReply, session = {} }) {
  const context = buildSessionContext(session);
  const hasChoiceList = /\[\d+\]/.test(draftReply || '');

  const reviewed = await createCompletionWithBackup({
    maxTokens: 260,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content:
          'You are reviewing a chatbot draft reply. Keep the same intent and flow state. Improve clarity, empathy, and relevance to the latest user input.',
      },
      {
        role: 'system',
        content:
          hasChoiceList
            ? 'Important: If the draft includes numbered choices like [1], [2], [3], preserve those options and their meaning.'
            : 'Important: Keep response concise and actionable.',
      },
      {
        role: 'system',
        content: `Session context JSON: ${JSON.stringify(context)}`,
      },
      {
        role: 'user',
        content: `Latest user message:\n${userMessage || ''}\n\nDraft reply:\n${draftReply || ''}\n\nReturn only the final reply text.`,
      },
    ],
  });

  return reviewed && reviewed.trim() ? reviewed.trim() : draftReply;
}

/**
 * Optionally rephrase a bot message to sound more natural.
 * You can use this to add variety to repeated messages.
 *
 * @param {string} baseMessage - the scripted message
 * @returns {string}           - slightly rephrased version
 */
async function rephrase(baseMessage) {
  return createCompletionWithBackup({
    maxTokens: 120,
    messages: [
      {
        role: 'system',
        content: 'Rephrase the following chatbot message to sound natural and warm, keeping the same meaning. Return only the rephrased text.'
      },
      { role: 'user', content: baseMessage },
    ],
  });
}

module.exports = { getFallbackReply, rephrase, reviewReplyWithContext };
