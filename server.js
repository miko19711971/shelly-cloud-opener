// server.js (CommonJS)
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY  = process.env.SHELLY_API_KEY;         // es. MMWjNGMy...
const DEVICE_ID = process.env.DEVICE_ID;             // es. 349454... (rispetta MAIUSC/minusc)
const CLOUD     = (process.env.SHELLY_CLOUD_SERVER || '').replace(/\/+$/, ''); // es. https://shelly-77-eu.shelly.cloud

function ensureEnv(res) {
  if (!API_KEY || !DEVICE_ID || !CLOUD) {
    res.status(500).json({
      error: 'Variabili di ambiente mancanti',
      have: { SHELLY_API_KEY: !!API_KEY, DEVICE_ID: !!DEVICE_ID, SHELLY_CLOUD_SERVER: !!CLOUD }
    });
    return false;
  }
  return true;
}

app.get('/', (_req, res) => {
  res.send('Server attivo! Vai su /open per aprire la porta, /close per chiuderla.');
});

app.get('/open', async (_req, res) => {
  if (!ensureEnv(res)) return;
  const url = `${CLOUD}/device/relay/control?id=${encodeURIComponent(DEVICE_ID)}&auth_key=${encodeURIComponent(API_KEY)}&channel=0&turn=on`;
  try {
    const r = await fetch(url, { method: 'GET', timeout: 15000 });
    const text = await r.text();
    res.type('text/plain').send(`URL chiamato:\n${url}\n\nRisposta Shelly:\n${text}`);
  } catch (err) {
    res.status(502).json({ error: String(err), url });
  }
});

app.get('/close', async (_req, res) => {
  if (!ensureEnv(res)) return;
  const url = `${CLOUD}/device/relay/control?id=${encodeURIComponent(DEVICE_ID)}&auth_key=${encodeURIComponent(API_KEY)}&channel=0&turn=off`;
  try {
    const r = await fetch(url, { method: 'GET', timeout: 15000 });
    const text = await r.text();
    res.type('text/plain').send(`URL chiamato:\n${url}\n\nRisposta Shelly:\n${text}`);
  } catch (err) {
    res.status(502).json({ error: String(err), url });
  }
});
