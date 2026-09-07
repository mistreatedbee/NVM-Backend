const { PAAQ } = require('@paaq/sdk/node');

// Same PAAQ project credentials the hand-rolled client previously posted
// directly to the Supabase edge functions. The SDK now owns session id,
// device id, batching/retries, and the periodic heartbeat — none of that
// needs to be reimplemented here anymore.
const SDK_TOKEN = 'sdk_live_ms1g8305sh182b9n8m1baszlqth599km';
const PROJECT_KEY = 'proj_cxgmjznf';

let ready = false;

function track(eventName, properties = {}) {
  if (!ready) return;
  PAAQ.track(eventName, { screen_name: 'backend', ...properties });
}

async function flush() {
  if (!ready) return;
  await PAAQ.flush();
}

async function init() {
  try {
    const result = await PAAQ.initialize({ sdkToken: SDK_TOKEN, projectId: PROJECT_KEY });
    ready = Boolean(result?.ok);
    if (ready) {
      console.log('[PAAQ] Connected — project:', result?.meta?.projectName);
    }
  } catch {
    // never break the app
    return;
  }
  if (!ready) return;

  process.on('SIGTERM', async () => { await flush(); PAAQ.shutdown(); process.exit(0); });
  process.on('SIGINT', async () => { await flush(); PAAQ.shutdown(); process.exit(0); });
}

module.exports = { init, track, flush };
