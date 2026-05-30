// ============================================================
//  chatbot.js — Etisora AI Chatbot Core Logic
//  State machine that handles the full conversation flow
// ============================================================

const { getFallbackReply, reviewReplyWithContext } = require('./openai');
const { appendInquiry }    = require('./sheets');

// ── CONVERSATION STATES ──────────────────────────────────────
const STATES = {
  GREETING:         'GREETING',
  // Path A — New client
  A_INDUSTRY:       'A_INDUSTRY',
  A_PAIN_POINT:     'A_PAIN_POINT',
  A_TIMELINE:       'A_TIMELINE',
  // Path B — Existing client
  B_PURPOSE:        'B_PURPOSE',
  B_TECH_SUPPORT:   'B_TECH_SUPPORT',
  B_NEW_SERVICES:   'B_NEW_SERVICES',
  // Shared
  GLOBAL_PRESENCE:  'GLOBAL_PRESENCE',
  CAPTURE_NAME:     'CAPTURE_NAME',
  CAPTURE_EMAIL:    'CAPTURE_EMAIL',
  CAPTURE_PHONE:    'CAPTURE_PHONE',
  CAPTURE_DESC:     'CAPTURE_DESC',
  CAPTURE_TIME:     'CAPTURE_TIME',
  CAPTURE_METHOD:   'CAPTURE_METHOD',
  CONFIRM:          'CONFIRM',
  DONE:             'DONE',
};

const CAPTURE_STEPS = [
  STATES.CAPTURE_NAME,
  STATES.CAPTURE_EMAIL,
  STATES.CAPTURE_PHONE,
  STATES.CAPTURE_DESC,
  STATES.CAPTURE_TIME,
  STATES.CAPTURE_METHOD,
];

const CAPTURE_STEP_LABELS = {
  [STATES.CAPTURE_NAME]: 'Name',
  [STATES.CAPTURE_EMAIL]: 'Email',
  [STATES.CAPTURE_PHONE]: 'Phone',
  [STATES.CAPTURE_DESC]: 'Issue Summary',
  [STATES.CAPTURE_TIME]: 'Preferred Time',
  [STATES.CAPTURE_METHOD]: 'Contact Method',
};

// ── QUICK-REPLY OPTIONS ──────────────────────────────────────
// Maps what users can type/click to internal values
const QUICK_REPLIES = {
  customerType: {
    '1': 'new',      'new': 'new',      'new to etisora': 'new',
    '2': 'existing', 'existing': 'existing', 'existing client': 'existing',
  },
  industry: {
    '1': 'Professional services',
    '2': 'Trades & home services',
    '3': 'Retail & ecommerce',
    '4': 'Hospitality',
    '5': 'Healthcare',
    '6': 'Other',
    'professional': 'Professional services',
    'trades': 'Trades & home services',
    'retail': 'Retail & ecommerce',
    'hospitality': 'Hospitality',
    'healthcare': 'Healthcare',
    'other': 'Other',
  },
  painPoint: {
    '1': 'Missing leads / after-hours calls',
    '2': 'Slow lead follow-up',
    '3': 'Repetitive manual tasks',
    '4': 'Not sure yet — just exploring',
    'missing': 'Missing leads / after-hours calls',
    'leads':   'Missing leads / after-hours calls',
    'slow':    'Slow lead follow-up',
    'manual':  'Repetitive manual tasks',
    'exploring': 'Not sure yet — just exploring',
  },
  timeline: {
    '1': 'Ready — next 30 days',
    '2': 'Researching options',
    '3': 'Just browsing',
    'ready': 'Ready — next 30 days',
    '30':    'Ready — next 30 days',
    'researching': 'Researching options',
    'browsing':    'Just browsing',
  },
  purpose: {
    '1': 'tech_support',   'tech': 'tech_support',    'support': 'tech_support',
    '2': 'new_services',   'services': 'new_services', 'new': 'new_services',
    '3': 'billing',        'billing': 'billing',       'account': 'billing',
    '4': 'other',          'other': 'other',
  },
  contactMethod: {
    '1': 'Email',     'email': 'Email',
    '2': 'Phone',     'phone': 'Phone',     'call': 'Phone',
    '3': 'WhatsApp',  'whatsapp': 'WhatsApp', 'wa': 'WhatsApp',
  },
  fallbackOffer: {
    '1': 'yes', 'yes': 'yes', 'y': 'yes',
    '2': 'no',  'no': 'no',   'n': 'no',
  },
};

// ── HELPER: match input to a quick-reply option ──────────────
function matchReply(input, map) {
  const key = input.trim().toLowerCase();
  if (!key) return null;

  // Accept option-style input such as: 1, [1], 1), 1. yes
  const numericMatch = key.match(/^\s*\[?\s*([1-9])\s*\]?(?:[\).\-\s]|$)/);
  if (numericMatch && map[numericMatch[1]]) {
    return map[numericMatch[1]];
  }

  // Friendly fuzzy matching for yes/no style responses.
  if (map === QUICK_REPLIES.fallbackOffer) {
    if (key === '1' || key.startsWith('y')) return 'yes';
    if (key === '2' || key.startsWith('n')) return 'no';
  }

  return map[key] || null;
}

// ── HELPER: validate email ───────────────────────────────────
function isValidEmail(str) {
  const value = (str || '').trim();
  // Basic but stricter than the old regex: no spaces, valid local/domain, TLD >= 2.
  return /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function normalizeEmail(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, '');
}

function userDeclinedEmail(str) {
  const key = (str || '').trim().toLowerCase();
  if (!key) return false;
  return (
    key === 'skip' ||
    key.includes("don't want") ||
    key.includes('dont want') ||
    key.includes('no email') ||
    key.includes('prefer not') ||
    key.includes('cant share') ||
    key.includes("can't share") ||
    key.includes('nahi dena') ||
    key.includes('dont have email')
  );
}

function isLikelyPhone(str) {
  const raw = (str || '').trim();
  if (!raw) return false;
  if (!/^[+()\-\s0-9]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function isLikelyName(str) {
  const raw = (str || '').trim();
  if (!raw) return false;
  if (raw.length < 2 || raw.length > 50) return false;
  if (/@/.test(raw)) return false;
  if (/\d/.test(raw)) return false;

  const lc = raw.toLowerCase();
  const blockedPhrases = [
    'already mentioned',
    'already told',
    'you know my name',
    'apka name',
    'aapka name',
    'your name',
    'dont know',
    "don't know",
  ];
  if (blockedPhrases.some((p) => lc.includes(p))) return false;
  if (/\b(why|what|how|who|need)\b/.test(lc)) return false;

  if (!/^[a-zA-Z][a-zA-Z\s'.-]*$/.test(raw)) return false;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length > 4) return false;
  return true;
}

function normalizeName(str) {
  const raw = (str || '').trim();
  if (!raw) return raw;
  const patterns = [
    /^(?:i am|i'm|im|my name is|this is)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return raw;
}

function isIssueRecallQuestion(str) {
  const lc = (str || '').trim().toLowerCase();
  if (!lc) return false;
  const recallWords = ['remember', 'yaad', 'what was my problem', 'problem kya', 'masla kya'];
  const issueWords = ['problem', 'issue', 'masla', 'login', 'logout'];
  return recallWords.some((w) => lc.includes(w)) && issueWords.some((w) => lc.includes(w));
}

function looksLikeAnotherIssue(str) {
  const lc = (str || '').trim().toLowerCase();
  if (!lc) return false;
  const terms = ['problem', 'issue', 'error', 'not working', 'login', 'logout', 'bug'];
  return terms.some((t) => lc.includes(t));
}

function shouldRestartAfterDone(str) {
  const lc = (str || '').trim().toLowerCase();
  if (!lc) return false;
  const keepDone = ['done', 'bye', 'goodbye', 'exit', 'quit', 'stop'];
  if (keepDone.some((w) => lc === w)) return false;
  return true;
}

function looksLikeOptionInput(str) {
  const key = (str || '').trim().toLowerCase();
  if (!key) return false;
  return /^\[?\s*[1-9]\s*\]?(?:[\).\-\s]|$)/.test(key);
}

function isLikelyPreferredTime(str) {
  const value = (str || '').trim().toLowerCase();
  if (!value) return true; // optional step
  if (value.length < 2) return false;
  if (/\b(morning|afternoon|evening|night|today|tomorrow|weekday|weekend)\b/.test(value)) return true;
  if (/\b(am|pm)\b/.test(value)) return true;
  if (/^\d{1,2}(:\d{2})?\s?(am|pm)?$/i.test(value)) return true;
  if (value.length >= 3) return true;
  return false;
}

function isMeaningfulDescription(str) {
  const value = (str || '').trim();
  if (value.length < 5) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return true;
  const lc = value.toLowerCase();
  const issueTerms = ['problem', 'issue', 'error', 'login', 'logout', 'support', 'billing', 'not working'];
  if (issueTerms.some((term) => lc.includes(term))) return true;
  return false;
}

function getCaptureStepMeta(state) {
  const idx = CAPTURE_STEPS.indexOf(state);
  if (idx === -1) return null;
  const total = CAPTURE_STEPS.length;
  const step = idx + 1;
  return {
    step,
    total,
    completed: step - 1,
    remaining: total - step + 1,
    label: CAPTURE_STEP_LABELS[state] || 'Step',
  };
}

function withStepProgress(state, text) {
  const meta = getCaptureStepMeta(state);
  if (!meta) return text;
  const header =
    `Progress: Step ${meta.step}/${meta.total} (${meta.label}) | Completed: ${meta.completed} | Remaining: ${meta.remaining}\n` +
    `AI Review: Active for this step (input is verified before moving next).`;
  return `${header}\n\n${text}`;
}

function looksLikeQuestionText(str) {
  const value = (str || '').trim().toLowerCase();
  if (!value) return false;
  if (value.includes('?')) return true;
  return /^(why|what|how|who|when|where|can|do|did|is|are)\b/.test(value);
}

async function answerAndReaskStep({ session, input, currentState, questionText, reasonText }) {
  let answer = '';
  try {
    answer = await getFallbackReply(
      `User is in onboarding step "${CAPTURE_STEP_LABELS[currentState] || currentState}".
Expected input type: ${CAPTURE_STEP_LABELS[currentState] || 'field value'}.
User wrote: "${input}".
Reason this is not accepted: ${reasonText}.
Reply briefly, resolve confusion politely, then ask them to provide the expected input.`,
      session
    );
  } catch {
    answer = `I understand your question. ${reasonText}`;
  }
  return withStepProgress(currentState, `${answer}\n\n${questionText}`);
}

function resetSessionData(session) {
  session.state = STATES.GREETING;
  session.customerType = null;
  session.industry = null;
  session.painPoint = null;
  session.timeline = null;
  session.supportType = null;
  session.name = null;
  session.email = null;
  session.phone = null;
  session.description = null;
  session.preferredTime = null;
  session.contactMethod = null;
  session.awaitingFallbackOffer = false;
  session.emailSkipped = false;
  session.history = [];
}

async function emailGuidance(input, session) {
  try {
    const aiReply = await getFallbackReply(
      `User is filling a lead form. We asked for email, but user replied: "${input}". 
Please respond in max 2 short lines:
1) kindly explain why we need a valid email or ask them to type 'skip'
2) give one valid example like name@example.com`,
      session
    );
    return `${aiReply}\n\nPlease enter a valid email (example: name@example.com), or type 'skip'.`;
  } catch {
    return MSG.invalidEmail;
  }
}

// ── SESSION FACTORY ──────────────────────────────────────────
function createSession() {
  return {
    state:         STATES.GREETING,
    customerType:  null,
    industry:      null,
    painPoint:     null,
    timeline:      null,
    supportType:   null,
    name:          null,
    email:         null,
    phone:         null,
    description:   null,
    preferredTime: null,
    contactMethod: null,
    awaitingFallbackOffer: false,
    emailSkipped: false,
    history: [],
  };
}

// ── MESSAGES ─────────────────────────────────────────────────
const MSG = {
  greeting: `Hi there! Welcome to Etisora. 👋\n\nWe help businesses across the globe automate their growth with custom AI agents — and our team is available 24/7, no matter where you are.\n\nTo connect you with the right person, are you:\n  [1] 🆕 New to Etisora\n  [2] ✅ An existing client`,

  a_industry: `Great, welcome! We work across a wide range of industries. Which best describes your business?\n  [1] Professional services\n  [2] Trades & home services\n  [3] Retail & ecommerce\n  [4] Hospitality\n  [5] Healthcare\n  [6] Other`,

  a_painPoint: `Got it. What's the biggest challenge you're trying to solve right now?\n  [1] Missing leads / after-hours calls\n  [2] Slow lead follow-up\n  [3] Repetitive manual tasks\n  [4] Not sure yet — just exploring`,

  a_timeline: `Helpful, thank you. Are you looking to move quickly or still in research mode?\n  [1] Ready — I want to move in the next 30 days\n  [2] Researching my options\n  [3] Just browsing for now`,

  b_purpose: `Good to have you back! How can we help you today?\n  [1] I need technical support\n  [2] I want to explore additional services\n  [3] Billing or account question\n  [4] Something else`,

  b_techSupport: `No problem. Please briefly describe the issue you're experiencing and one of our technical team members will follow up with you directly.\n\n(Type your issue below)`,

  b_newServices: `Exciting — we've got a lot we can add on top of what you're already running. Things like AI voice agents, paid ad campaigns, WhatsApp automation, and full customer journey mapping.\n\nI'll have someone reach out to walk you through what makes sense for your setup. Let me grab your details.`,

  globalPresence: `Just so you know — Etisora operates globally and our team works around the clock. ⏰\n\nWherever you are, your inquiry won't sit in a queue. We triage every submission and the right person will follow up within 24 hours or less.\n\nLet me grab a few quick details to get you to the right team.`,

  captureName:   `What's your name?`,
  captureEmail:  `What's the best email address to reach you? (type 'skip' if you prefer phone/WhatsApp only)`,
  capturePhone:  `And a phone number? (press Enter to skip)`,
  captureDesc:   `In one sentence — what do you need help with?`,
  captureTime:   `Is there a best time of day to reach you? (press Enter to skip)`,
  captureMethod: `How would you prefer we contact you?\n  [1] 📧 Email\n  [2] 📞 Phone call\n  [3] 💬 WhatsApp`,

  confirm: (name, dept) =>
    `Perfect — you're all set, ${name}! ✅\n\nYour inquiry has been sent to our ${dept} team and you can expect to hear from us within 24 hours or less.\n\nIs there anything else I can help you with? (Type 'pricing', 'services', or 'done')`,

  fallbackOffer: `I want to make sure you get the right help! Would you like to leave a quick inquiry so our team can follow up within 24 hours?\n  [1] Yes, leave an inquiry\n  [2] No thanks`,
  fallbackDeclined: `No problem at all.\n\nIf you'd like, we can continue here:\n  [1] New to Etisora\n  [2] Existing client`,

  done: `Thanks for reaching out to Etisora! Have a great day. 🌟\nVisit us anytime at etisora.ai`,

  invalidEmail: `That doesn't look like a valid email address. Please try again, or type 'skip' if you prefer phone/WhatsApp only:`,
  phoneRequired: `No problem, we can skip email. Please share a valid phone/WhatsApp number so our team can reach you:`,
};

async function contactMethodGuidance(input, session) {
  if (isIssueRecallQuestion(input)) {
    const rememberedIssue = session.description
      ? `Yes, I remember. You mentioned: "${session.description}".`
      : `I have your details noted and I'm ready to submit your inquiry.`;
    return `${rememberedIssue}\n\n${MSG.captureMethod}`;
  }

  try {
    const aiReply = await getFallbackReply(
      `User is in a lead form at contact-method selection. They wrote: "${input}".
Reply in one short line, then guide them to choose:
[1] Email
[2] Phone
[3] WhatsApp`,
      session
    );
    return `${aiReply}\n\nPlease choose:\n  [1] Email\n  [2] Phone\n  [3] WhatsApp`;
  } catch {
    return `Please choose:\n  [1] Email\n  [2] Phone\n  [3] WhatsApp`;
  }
}

// ── CORE PROCESS FUNCTION ─────────────────────────────────────
/**
 * Processes one user message and returns the bot's reply.
 * Call this from your channel adapter (terminal, webhook, widget, etc.)
 *
 * @param {string} userInput  — the raw text from the user
 * @param {object} session    — the current session object (mutated in place)
 * @returns {string}          — the bot's reply text
 */
async function processMessage(userInput, session) {
  const input = (userInput || '').trim();
  const fallbackChoice = matchReply(input, QUICK_REPLIES.fallbackOffer);

  if (session.awaitingFallbackOffer) {
    session.awaitingFallbackOffer = false;
    if (fallbackChoice === 'yes') {
      session.state = STATES.CAPTURE_NAME;
      return `${MSG.globalPresence}\n\n${withStepProgress(session.state, MSG.captureName)}`;
    }
    if (fallbackChoice === 'no') {
      session.state = STATES.GREETING;
      return MSG.fallbackDeclined;
    }
    // If the user writes free text instead of choosing 1/2,
    // give an AI reply again and re-offer the inquiry options.
    return await fallback(input, session);
  }

  switch (session.state) {

    // ── GREETING ─────────────────────────────────────────────
    case STATES.GREETING: {
      const type = matchReply(input, QUICK_REPLIES.customerType);
      if (!type) return await fallback(input, session);
      session.customerType = type;
      if (type === 'new') {
        session.state = STATES.A_INDUSTRY;
        return MSG.a_industry;
      } else {
        session.state = STATES.B_PURPOSE;
        return MSG.b_purpose;
      }
    }

    // ── PATH A ───────────────────────────────────────────────
    case STATES.A_INDUSTRY: {
      const val = matchReply(input, QUICK_REPLIES.industry);
      if (!val) return await fallback(input, session);
      session.industry = val;
      session.state    = STATES.A_PAIN_POINT;
      return MSG.a_painPoint;
    }

    case STATES.A_PAIN_POINT: {
      const val = matchReply(input, QUICK_REPLIES.painPoint);
      if (!val) return await fallback(input, session);
      session.painPoint = val;
      session.state     = STATES.A_TIMELINE;
      return MSG.a_timeline;
    }

    case STATES.A_TIMELINE: {
      const val = matchReply(input, QUICK_REPLIES.timeline);
      if (!val) return await fallback(input, session);
      session.timeline = val;
      session.state    = STATES.GLOBAL_PRESENCE;
      return MSG.globalPresence;
    }

    // ── PATH B ───────────────────────────────────────────────
    case STATES.B_PURPOSE: {
      const val = matchReply(input, QUICK_REPLIES.purpose);
      if (!val) return await fallback(input, session);
      session.supportType = val;
      if (val === 'tech_support') {
        session.state = STATES.B_TECH_SUPPORT;
        return MSG.b_techSupport;
      } else if (val === 'new_services') {
        session.state = STATES.B_NEW_SERVICES;
        return MSG.b_newServices + '\n\n' + MSG.globalPresence;
      } else {
        // billing / other — go straight to capture
        session.state = STATES.GLOBAL_PRESENCE;
        return MSG.globalPresence;
      }
    }

    case STATES.B_TECH_SUPPORT: {
      // Free-text — just capture whatever they wrote as the description
      session.description = input;
      session.state       = STATES.GLOBAL_PRESENCE;
      return MSG.globalPresence;
    }

    case STATES.B_NEW_SERVICES: {
      session.state = STATES.CAPTURE_NAME;
      return withStepProgress(session.state, MSG.captureName);
    }

    // ── GLOBAL PRESENCE (transition node) ────────────────────
    case STATES.GLOBAL_PRESENCE: {
      session.state = STATES.CAPTURE_NAME;
      return withStepProgress(session.state, MSG.captureName);
    }

    // ── INQUIRY CAPTURE ──────────────────────────────────────
    case STATES.CAPTURE_NAME: {
      if (!input) return withStepProgress(session.state, `Please enter your name so we can personalise your follow-up:`);
      if (looksLikeQuestionText(input)) {
        return await answerAndReaskStep({
          session,
          input,
          currentState: session.state,
          questionText: MSG.captureName,
          reasonText: 'A personal name is required to personalize your inquiry.',
        });
      }
      const parsedName = normalizeName(input);
      if (!isLikelyName(parsedName)) {
        return await answerAndReaskStep({
          session,
          input,
          currentState: session.state,
          questionText: `Please type just your name (example: Jawad Khan).`,
          reasonText: 'The input does not look like a valid person name.',
        });
      }
      session.name  = parsedName;
      session.state = STATES.CAPTURE_EMAIL;
      return withStepProgress(session.state, MSG.captureEmail);
    }

    case STATES.CAPTURE_EMAIL: {
      if (userDeclinedEmail(input)) {
        session.email = null;
        session.emailSkipped = true;
        session.state = STATES.CAPTURE_PHONE;
        return withStepProgress(session.state, MSG.phoneRequired);
      }

      const normalizedEmail = normalizeEmail(input);
      if (!isValidEmail(normalizedEmail)) {
        if (looksLikeQuestionText(input)) {
          return await answerAndReaskStep({
            session,
            input,
            currentState: session.state,
            questionText: MSG.captureEmail,
            reasonText: 'A valid email helps us send follow-up details and updates.',
          });
        }
        const guidance = await emailGuidance(input, session);
        return withStepProgress(session.state, guidance);
      }
      session.email = normalizedEmail;
      session.emailSkipped = false;
      session.state = STATES.CAPTURE_PHONE;
      return withStepProgress(session.state, MSG.capturePhone);
    }

    case STATES.CAPTURE_PHONE: {
      if (session.emailSkipped) {
        if (!isLikelyPhone(input)) {
          return await answerAndReaskStep({
            session,
            input,
            currentState: session.state,
            questionText: MSG.phoneRequired,
            reasonText: 'Since email is skipped, we need a valid phone/WhatsApp number to contact you.',
          });
        }
        session.phone = input.trim();
      } else {
        if (input && !isLikelyPhone(input)) {
          return await answerAndReaskStep({
            session,
            input,
            currentState: session.state,
            questionText: MSG.capturePhone,
            reasonText: 'Phone is optional, but if provided it should be a valid number.',
          });
        }
        session.phone = input || null; // optional
      }
      session.state = STATES.CAPTURE_DESC;
      return withStepProgress(session.state, MSG.captureDesc);
    }

    case STATES.CAPTURE_DESC: {
      const clean = (input || '').trim();
      if (!isMeaningfulDescription(clean)) {
        return await answerAndReaskStep({
          session,
          input,
          currentState: session.state,
          questionText: MSG.captureDesc,
          reasonText: 'We need a clear one-sentence issue summary so the right team can help.',
        });
      }
      // Skip if already captured (e.g. tech support free text)
      if (!session.description) session.description = clean;
      session.state = STATES.CAPTURE_TIME;
      return withStepProgress(session.state, MSG.captureTime);
    }

    case STATES.CAPTURE_TIME: {
      if (looksLikeAnotherIssue(input)) {
        session.description = session.description
          ? `${session.description}; Also: ${input.trim()}`
          : input.trim();
        session.preferredTime = null;
        session.state = STATES.CAPTURE_METHOD;
        return withStepProgress(session.state, `Noted, I also captured that issue.\n\n${MSG.captureMethod}`);
      }
      if (!isLikelyPreferredTime(input)) {
        return await answerAndReaskStep({
          session,
          input,
          currentState: session.state,
          questionText: MSG.captureTime,
          reasonText: 'Please share a usable contact time like morning, evening, tomorrow 5pm, or skip.',
        });
      }
      session.preferredTime = input || null; // optional
      session.state         = STATES.CAPTURE_METHOD;
      return withStepProgress(session.state, MSG.captureMethod);
    }

    case STATES.CAPTURE_METHOD: {
      const val = matchReply(input, QUICK_REPLIES.contactMethod);
      if (!val) {
        const guidance = await contactMethodGuidance(input, session);
        return withStepProgress(session.state, guidance);
      }
      session.contactMethod = val;

      // ── SAVE TO GOOGLE SHEETS ────────────────────────────
      let deptTag = 'Sales';
      try {
        deptTag = await appendInquiry(session);
      } catch (err) {
        console.error('⚠️  Google Sheets error:', err.message);
        // Don't break the conversation — just log and continue
      }

      session.state = STATES.CONFIRM;
      return MSG.confirm(session.name, deptTag);
    }

    // ── CONFIRMATION ─────────────────────────────────────────
    case STATES.CONFIRM: {
      const lc = input.toLowerCase();
      if (lc.includes('pricing')) {
        return `Our pricing starts from $997/month for the Starter plan and $2,497/month for the Growth plan. Full details at etisora.ai/#pricing\n\nAnything else I can help with? (type 'done' to finish)`;
      }
      if (lc.includes('service')) {
        return `We offer AI chatbots, voice agents, lead generation, paid ad campaigns, WhatsApp automation, and full customer journey mapping. The right team will walk you through what fits your setup.\n\nAnything else? (type 'done' to finish)`;
      }
      session.state = STATES.DONE;
      return MSG.done;
    }

    case STATES.DONE:
      if (!shouldRestartAfterDone(input)) return MSG.done;
      resetSessionData(session);
      return await processMessage(input, session);

    default:
      session.state = STATES.GREETING;
      return MSG.greeting;
  }
}

// ── FALLBACK HANDLER ─────────────────────────────────────────
async function fallback(input, session) {
  session.awaitingFallbackOffer = true;
  try {
    // Use OpenAI to generate a smart contextual reply
    const aiReply = await getFallbackReply(input, session);
    // Then offer to capture an inquiry
    return `${aiReply}\n\n---\nWould you like to leave a quick inquiry so our team can follow up?\n  [1] Yes please\n  [2] No thanks`;
  } catch (err) {
    console.warn('AI fallback failed (attempt 1), retrying:', err.message);
    try {
      const aiReplyRetry = await getFallbackReply(input, session);
      return `${aiReplyRetry}\n\n---\nWould you like to leave a quick inquiry so our team can follow up?\n  [1] Yes please\n  [2] No thanks`;
    } catch (retryErr) {
      console.warn('AI fallback failed (attempt 2), using scripted fallback:', retryErr.message);
      // If AI is unavailable after retry, use the scripted fallback
      return MSG.fallbackOffer;
    }
  }
}

function pushHistory(session, role, text) {
  if (!session || !Array.isArray(session.history)) return;
  const entry = {
    role,
    text: String(text || ''),
    at: new Date().toISOString(),
  };
  session.history.push(entry);
  if (session.history.length > 30) {
    session.history = session.history.slice(-30);
  }
}

function hasChoiceLines(text) {
  return /^\s*\[\d+\]/m.test(String(text || ''));
}

function shouldBypassReview({ input, draftReply }) {
  if (looksLikeOptionInput(input)) return true;
  if (hasChoiceLines(draftReply)) return true;
  return false;
}

function isStrictFlowState(state) {
  const strictStates = new Set([
    STATES.GREETING,
    STATES.A_INDUSTRY,
    STATES.A_PAIN_POINT,
    STATES.A_TIMELINE,
    STATES.B_PURPOSE,
    STATES.CAPTURE_NAME,
    STATES.CAPTURE_EMAIL,
    STATES.CAPTURE_PHONE,
    STATES.CAPTURE_DESC,
    STATES.CAPTURE_TIME,
    STATES.CAPTURE_METHOD,
    STATES.CONFIRM,
    STATES.DONE,
  ]);
  return strictStates.has(state);
}

const processMessageCore = processMessage;

async function processMessageWithAI(userInput, session) {
  if (!session || typeof session !== 'object') {
    throw new Error('A valid session object is required.');
  }

  if (!Array.isArray(session.history)) {
    session.history = [];
  }

  const input = (userInput || '').trim();
  if (input) pushHistory(session, 'user', input);

  const draftReply = await processMessageCore(userInput, session);
  let finalReply = draftReply;

  if (!shouldBypassReview({ input, draftReply }) && !isStrictFlowState(session.state)) {
    try {
      finalReply = await reviewReplyWithContext({
        userMessage: input,
        draftReply,
        session,
      });

      // Keep frontend quick-reply parsing stable when numbered choices exist.
      if (hasChoiceLines(draftReply) && !hasChoiceLines(finalReply)) {
        finalReply = draftReply;
      }
    } catch (err) {
      console.warn('AI reply review skipped:', err.message);
    }
  }

  pushHistory(session, 'assistant', finalReply);
  return finalReply;
}

module.exports = { processMessage: processMessageWithAI, createSession, STATES, MSG };
