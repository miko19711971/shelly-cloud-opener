// server.js
const express = require('express');
const fetch = require('node-fetch'); // ok anche su Node 18 in Render
const app = express();

const PORT = process.env.PORT || 3000;

// === Variabili di ambiente da impostare su Render ===
// SHELLY_API_KEY  -> la tua Cloud Auth Key (quella lunga)
// DEVICE_ID       -> id del dispositivo (es. 34945479fbbe)
// SHELLY_REGION   -> due cifre del server (es. "77"). Facoltativa: default 77
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;
const DEVICE_ID = process.env.DEVICE_ID;
const SHELLY_REGION = process.env.SHELLY_REGION || '77';

// Base URL del Cloud Shelly (EU)
const SHELLY_BASE = `https://shelly-${SHELLY_REGION}-eu.shelly.cloud`;

// Rotta di health-check per Render
app.get('/health', (_req, res) => res.send('ok'));

// Utility: chiama l’endpoint Cloud per il relay
async function callShelly(turn) {
  if (!SHELLY_API_KEY || !DEVICE_ID) {
    throw new Error('Variabili di ambiente mancanti: SHELLY_API_KEY o DEVICE_ID');
  }

  // API Cloud Shelly: /device/relay/control?id=...&auth_key=...&turn=on|off|toggle
  const url = `${SHELLY_BASE}/device/relay/control` +
              `?id=${encodeURIComponent(DEVICE_ID)}` +
              `&auth_key=${encodeURIComponent(SHELLY_API_KEY)}` +
              `&turn=${encodeURIComponent(turn)}`;

  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Rotte comode
app.get('/open',   async (_req, res) => {
  try { res.json(await callShelly('on')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/close',  async (_req, res) => {
  try { res.json(await callShelly('off')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/toggle', async (_req, res) => {
  try { res.json(await callShelly('toggle')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
