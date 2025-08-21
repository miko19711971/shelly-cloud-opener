// Unified Shelly Cloud Opener — all apartments (single Render service)
// Routes:
//   GET /health
//   GET /open/:target                     -> test senza token (non usare coi clienti)
//   GET /gen/:target?date=YYYY-MM-DD      -> genera firma per il giorno indicato (default: oggi, Europe/Rome)
//   GET /t/:target/:date/:sig             -> link sicuro: valido solo per quella data (Europe/Rome)
//
// Env richieste su Render:
//   SHELLY_API_KEY    -> la tua Auth Key di Shelly Cloud (unica per l’account)
//   SHELLY_BASE_URL   -> endpoint completo Shelly Cloud per il relay control (es. https://shelly-api-eu.shelly.cloud/device/relay/control)
//   TOKEN_SECRET      -> una stringa lunga casuale (per firmare i link)

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';

const {
  SHELLY_API_KEY = '',
  SHELLY_BASE_URL = '',
  TOKEN_SECRET = ''
} = process.env;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Mappa dispositivi ----------
const DEVICES = {
  // Leonina
  'leonina-door':              { id: '3494547a9395', label: 'Leonina — Apartment Door', channel: 0 },
  'leonina-building-door':     { id: '34945479fbbe', label: 'Leonina — Building Door',  channel: 0 },

  // Scala
  'scala-door':                { id: '3494547a1075', label: 'Scala — Apartment Door',    channel: 0 },
  'scala-building-door':       { id: '3494547745ee', label: 'Scala — Building Door',     channel: 0 },

  // Ottavia
  'ottavia-door':              { id: '3494547a887d', label: 'Ottavia — Apartment Door',  channel: 0 },
  'ottavia-building-door':     { id: '3494547ab62b', label: 'Ottavia — Building Door',   channel: 0 },

  // Viale Trastevere
  'viale-trastevere-door':     { id: '34945479fa35', label: 'Viale Trastevere — Apartment Door', channel: 0 },
  'viale-trastevere-building-door': { id: '34945479fd73', label: 'Viale Trastevere — Building Door', channel: 0 },

  // Arenula (solo portone)
  'arenula-building-door':     { id: '3494547ab05e', label: 'Arenula — Building Door', channel: 0 }
};

// ---------- Utility ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function hmac(target, date, secret) {
  const h = crypto.createHmac('sha256', secret);
  h.update(`${target}.${date}`);
  return b64url(h.digest());
}
function todayRome() {
  // calcola la data corrente in Europe/Rome (YYYY-MM-DD) senza dipendenze extra
  const now = new Date();
  const rome = new Date(now.toLocaleString('en-CA', { timeZone: 'Europe/Rome' })); // en-CA -> YYYY-MM-DD HH:MM:SS
  const y = rome.getFullYear();
  const m = String(rome.getMonth()+1).padStart(2,'0');
  const d = String(rome.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

async function triggerShelly({ id, channel }) {
  if (!SHELLY_BASE_URL || !SHELLY_API_KEY) {
    throw new Error('Missing SHELLY_BASE_URL or SHELLY_API_KEY');
  }
  // Per Shelly 1/relè: "turn":"on" (impulso gestito dalla app: auto-off)
  const payload = {
    id,
    auth_key: SHELLY_API_KEY,
    channel: Number.isInteger(channel) ? channel : 0,
    turn: 'on'
  };
  const { data } = await axios.post(SHELLY_BASE_URL, payload, { timeout: 10000 });
  return data;
}

// ---------- Routes ----------
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'shelly-unified',
    devices: Object.keys(DEVICES).length,
    has_api_key: !!SHELLY_API_KEY,
    has_base_url: !!SHELLY_BASE_URL
  });
});

// TEST senza token (solo per te)
app.get('/open/:target', async (req, res) => {
  try {
    const target = (req.params.target || '').toLowerCase();
    const dev = DEVICES[target];
    if (!dev) return res.status(404).json({ ok:false, error:'Unknown target', target });

    const result = await triggerShelly(dev);
    res.json({ ok:true, target, label: dev.label, result });
  } catch (err) {
    res.status(502).json({ ok:false, error:String(err?.message||err) });
  }
});

// Genera firma per una data (es. /gen/leonina-building-door?date=2025-12-12)
app.get('/gen/:target', (req, res) => {
  const target = (req.params.target || '').toLowerCase();
  if (!DEVICES[target]) return res.status(404).json({ ok:false, error:'Unknown target', target });

  const date = (req.query.date || todayRome());
  if (!TOKEN_SECRET) return res.status(500).json({ ok:false, error:'Missing TOKEN_SECRET' });

  const sig = hmac(target, date, TOKEN_SECRET);
  const url = `${req.protocol}://${req.get('host')}/t/${target}/${date}/${sig}`;
  res.json({ ok:true, target, date, sig, url });
});

// Link con token valido per TODO il giorno (Europe/Rome)
app.get('/t/:target/:date/:sig', async (req, res) => {
  try {
    const target = (req.params.target || '').toLowerCase();
    const dev = DEVICES[target];
    if (!dev) return res.status(404).send('Unknown target');

    if (!TOKEN_SECRET) return res.status(500).send('Missing TOKEN_SECRET');

    const date = req.params.date; // YYYY-MM-DD
    const sig = req.params.sig;
    const expected = hmac(target, date, TOKEN_SECRET);
    if (sig !== expected) return res.status(401).send('Invalid token');

    // valido solo il giorno indicato rispetto a Europe/Rome
    const today = todayRome();
    if (today !== date) return res.status(403).send('Token expired or not yet valid for today');

    const result = await triggerShelly(dev);
    res.type('text').send(`OK ${dev.label} — triggered for ${date}`);
  } catch (err) {
    res.status(502).type('text').send(`ERROR ${String(err?.message||err)}`);
  }
});

// Home minimale
app.get('/', (_req, res) => {
  const list = Object.entries(DEVICES)
    .map(([k,v])=>`<li><code>${k}</code> — ${v.label} — <a href="/gen/${k}">gen token</a> — <a href="/open/${k}">test open</a></li>`)
    .join('');
  res.send(`<!doctype html><meta charset="utf-8">
  <h1>Shelly unified opener</h1>
  <p>${Object.keys(DEVICES).length} targets configured.</p>
  <ul>${list}</ul>
  <p><a href="/health">/health</a></p>`);
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log('Shelly unified opener on :' + port));
