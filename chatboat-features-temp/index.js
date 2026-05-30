// ============================================================
//  index.js — Terminal runner (for local testing)
//  Run with:  node index.js
//  This simulates the chatbot in your terminal so you can test
//  the full flow before connecting it to a website or widget
// ============================================================

require('dotenv').config(); // loads your .env file

const readline               = require('readline');
const { processMessage,
        createSession, MSG } = require('./chatbot');
const { ensureHeaders }      = require('./sheets');

// ── STARTUP ──────────────────────────────────────────────────
async function start() {
  console.log('\n========================================');
  console.log('  ETISORA CHATBOT — Local Test Mode');
  console.log('  Type your replies below.');
  console.log('  Ctrl+C to exit.');
  console.log('========================================\n');

  // Make sure Google Sheet has headers
  try {
    await ensureHeaders();
  } catch (err) {
    console.warn('⚠️  Could not connect to Google Sheets:', err.message);
    console.warn('   (Chatbot will still run — inquiries will log to console only)\n');
  }

  const session = createSession();
  const rl      = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  // Print the opening message
  console.log(`\n🤖 Etisora:\n${MSG.greeting}\n`);

  // Listen for user input
  rl.on('line', async (input) => {
    if (!input.trim()) return;

    try {
      const reply = await processMessage(input, session);
      console.log(`\n🤖 Etisora:\n${reply}\n`);

      if (session.state === 'DONE') {
        console.log('✅ Conversation ended. Restart to begin again.\n');
        rl.close();
        process.exit(0);
      }
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  });
}

start();
