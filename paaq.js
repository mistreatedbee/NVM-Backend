const https = require('https');

const SDK_TOKEN = 'sdk_live_ms1g8305sh182b9n8m1baszlqth599km';
const PROJECT_KEY = 'proj_cxgmjznf';
const HANDSHAKE_URL = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1/sdk-init';
const EVENTS_URL = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1/events';

const HEADERS = {
  'Authorization': `Bearer ${SDK_TOKEN}`,
  'X-Project-ID': PROJECT_KEY,
  'X-SDK-Version': '1.0.0',
  'X-Platform': 'nodejs',
  'X-Environment': process.env.NODE_ENV === 'production' ? 'production' : 'development',
  'Content-Type': 'application/json',
};

let sessionId = null;
let queue = [];
let flushTimer = null;

function post(url, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(url, options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
    });
    req.on('error', () => resolve({}));
    req.write(data);
    req.end();
  });
}

async function handshake() {
  try {
    const data = await post(HANDSHAKE_URL, {});
    if (data.ok) {
      sessionId = data.sessionId;
      console.log('[PAAQ] Connected — project:', data.meta?.projectName);
    }
  } catch {
    // never break the app
  }
}

function track(eventName, properties = {}) {
  if (!sessionId) return;
  queue.push({
    event_name: eventName,
    session_id: sessionId,
    screen_name: 'backend',
    properties,
    timestamp: new Date().toISOString(),
  });
}

async function flush() {
  if (!sessionId || queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    await post(EVENTS_URL, batch);
  } catch {
    // silent
  }
}

async function init() {
  await handshake();
  if (!sessionId) return;
  flushTimer = setInterval(flush, 30_000);
  process.on('SIGTERM', async () => { await flush(); process.exit(0); });
  process.on('SIGINT',  async () => { await flush(); process.exit(0); });
}

module.exports = { init, track, flush };
