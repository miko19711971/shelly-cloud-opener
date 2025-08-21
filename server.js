const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch'); // v2 (CommonJS)

const app = express();

// ENV richieste
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-api-eu.shelly.cloud';
const TOKEN_SECRET   = process.env.TOKEN_SECRET   || 'change-me';

if (!SHELLY_API_KEY || !SHELLY_BASE_URL) {
  console.error('Mancano variabili: SHELLY_API_KEY o SHELLY_BASE_URL');
}

// Mappa di tutti i tuoi dispositivi
const TARGETS = {
  'leonina-door':                { id: '3494547a9395', name: 'Leonina — Apartment Door' },
  'leonina-building-door':       { id: '34945479fbbe', name: 'Leonina — Building Door' },
  'scala-door':                  { id: '3494547a1075', name: 'Scala — Apartment Door' },
  'scala-building-door':         { id: '3494547745ee', name: 'Scala — Building Door' },
  'ottavia-door':                { id: '3494547a887d', name: 'Ottavia — Apartment Door' },
  'ottavia-building-door':       { id: '3494547ab62b', name: 'Ottavia — Building Door' },
  'viale-trastevere-door':       { id: '34945479fa35', name: 'Viale Trastevere — Apartment Door' },
  'viale-trastevere-building-door': { id: '34945479fd73', name: 'Viale Trastevere — Building Door' },
  'arenula-building-door':       { id: '3494547ab05e', name: 'Arenula — Building Door' },
};

// chiamata al Cloud per i Gen1 (relay)
async function pulseRelay(deviceId, seconds = 1) {
  const url = `${SHELLY_BASE_URL}/device/relay/control`;
  // corpo x-www-form-urlencoded come richiesto dal cloud per Gen1
  const body = new URLSearchParams({
    id: deviceId,
    auth_key: SHELLY_API_KEY,
    channel: '0',
    turn: 'on',
    timer: String(seconds)
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// home di controllo
app.get('/', (req, res) => {
  const list = Object.keys(TARGETS).map(t =>
    `• <b>${t}</b> — ${TARGETS[t].name} — <a href="/gen/${t}">gen token</a> — <a href="/test-open/${t}">test open</a>`
  ).join('<br>');
  res.send(`<h3>Shelly unified opener</h3><p>${Object.keys(TARGETS).length} targets configured.</p>${list}<p><a href="/health">/health</a></p>`);
});

// health
app.get('/health', (req, res) => {
  res.json({ ok: true, hasApiKey: !!SHELLY_API_KEY, hasBase: !!SHELLY_BASE_URL, node: process.version });
});

// genera link giornaliero con token (valido fino a 23:59:59 del giorno indicato)
function makeSig(target, dateStr) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(`${target}|${dateStr}`).digest('base64url');
}
app.get('/gen/:target', (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });

  const now = new Date();
  const dateStr = now.toISOString().slice(0,10); // YYYY-MM-DD (oggi)
  const sig = makeSig(target, dateStr);
  const url = `${req.protocol}://${req.get('host')}/open/${target}/${dateStr}/${sig}`;
  res.json({ ok: true, target, date: dateStr, sig, url });
});

// test diretto (senza token) — SOLO per debug
app.get('/test-open/:target', async (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });

  try {
    const out = await pulseRelay(TARGETS[target].id, 1);
    res.json({ ok: out.status === 200, ...out });
  } catch (e) {
    res.json({ ok: false, error: String(e) });
  }
});

// apertura con token giornaliero
app.get('/open/:target/:date/:sig', async (req, res) => {
  const { target, date, sig } = req.params;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });

  const today = new Date().toISOString().slice(0,10);
  if (date !== today) return res.json({ ok: false, error: 'expired_or_wrong_date' });
  const expected = makeSig(target, date);
  if (sig !== expected) return res.json({ ok: false, error: 'bad_signature' });

  try {
    const out = await pulseRelay(TARGETS[target].id, 1);
    res.json({ ok: out.status === 200, ...out });
  } catch (e) {
    res.json({ ok: false, error: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
