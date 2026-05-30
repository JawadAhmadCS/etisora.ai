// ============================================================
//  sheets.js — Google Sheets integration
//  Appends each captured inquiry as a new row
// ============================================================

const { google } = require('googleapis');

// ── CONFIGURE ───────────────────────────────────────────────
// These values are loaded from your .env file (never hardcode)
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.GOOGLE_SHEET_TAB || "Inquiries";

function getSheetsConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey || !SHEET_ID) {
    throw new Error(
      "Google Sheets env vars missing. Required: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID."
    );
  }

  return {
    email,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

/**
 * Authenticates with Google using a Service Account.
 * Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env
 */
function getAuthClient() {
  const cfg = getSheetsConfig();
  return new google.auth.JWT({
    email: cfg.email,
    key: cfg.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/**
 * Appends a header row to the sheet if it's empty.
 * Call once on startup.
 */
async function ensureHeaders() {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1:K1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'Timestamp',
          'Customer Type',    // New / Existing
          'Industry',         // Path A only
          'Pain Point',       // Path A only
          'Timeline',         // Path A only
          'Support Type',     // Path B only
          'Name',
          'Email',
          'Phone',
          'Description',
          'Preferred Contact',
          'Contact Method',   // Email / Phone / WhatsApp
          'Dept. Tag',        // Sales / Support / Billing
        ]],
      },
    });
    console.log('✅ Sheet headers created.');
  }
}

/**
 * Appends one inquiry row to Google Sheets.
 * @param {object} data — the collected session data
 */
async function appendInquiry(data) {
  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Determine department tag for triage
  let deptTag = 'Sales';
  if (data.customerType === 'existing') {
    if (data.supportType === 'tech_support')   deptTag = 'Support';
    if (data.supportType === 'billing')        deptTag = 'Billing';
    if (data.supportType === 'new_services')   deptTag = 'Sales';
  }

  const row = [
    new Date().toISOString(),
    data.customerType   || '',
    data.industry       || '',
    data.painPoint      || '',
    data.timeline       || '',
    data.supportType    || '',
    data.name           || '',
    data.email          || '',
    data.phone          || '',
    data.description    || '',
    data.preferredTime  || '',
    data.contactMethod  || '',
    deptTag,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  console.log(`✅ Inquiry saved to Google Sheets — Dept: ${deptTag}`);
  return deptTag;
}

module.exports = { ensureHeaders, appendInquiry };
