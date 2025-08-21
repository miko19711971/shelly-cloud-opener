// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// === ENV ===
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-77-eu.shelly.cloud';
const TOKEN_SECRET   = process.env.TOKEN_SECRET || 'change-me';

// === MAPPATURA DEVICE ===
const targets = {
  // Leonina
  'leonina-door':              { id: '3494547a9395', name: 'Leonina — Apartment Door' },
  'leonina-building-door':     { id: '34945479fbbe', name: 'Leonina — Building Door' },

  // Scala
  'scala-door':                { id: '3494547a1075', name: 'Scala — Apartment Door' },
  'scala-building-door':       { id: '3494547745ee', name: 'Scala — Building Door' },

  // Ottavia
  'ottavia-door':              { id: '3494547a887d', name: 'Ottavia — Apartment Door' },
  'ottavia-building-door':     { id: '3494547ab62b', name: 'Ottavia — Building Door' },

  // Viale Trastevere
  'viale-trastevere-door':     { id: '34945479fa35', name: 'Viale Trastevere — Apartment Door' },
  'viale-trastevere-building-door': { id: '34945479fd73', name: 'Viale Trastevere — Building Door' },

  // Arenula
  'arenula-building-door':     { id: '3494547ab05e', name: 'Arenula — Building Door' },
};

// --- helpers ---
function todayYMD() {
  const d = new Date(); // UTC va bene: la firma dipende solo da AAAA-MM-GG
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sign(targetKey, ymd) {
  const h = crypto.createHmac('sha256', TOKEN_SECRET);
  h.update(`${targetKey}|${ymd}`);
  return h.digest('base64url');
}

async function shellyOpen(deviceId) {
  // Shelly Cloud accetta la chiave come "auth_key" nel body JSON
  // e il relay su canale 0 (come il tuo primo device che funzionava)
  const url = `${SHELLY_BASE_URL}/device/relay/control`;
  const payload = {
    id: deviceId,
    auth_key: SHELLY_API_KEY,
    channel: 0,
    turn: 'on'
  };
  const { data } = await axios.post(url, payload, { timeout: 15000 });
  return data;
}

// --- ROUTES ---

// Paginetta di indice con link utili
app.get('/', (req, res) => {
  const rows = Object.entries(targets).map(([key, t]) => {
    const gen = `/gen/${key}`;               // genera link token per OGGI
    const open = `/open?target=${key}`;      // prova immediata (senza token)
    const test = `/test-open/${key}`;        // test tokenizzato (genera e apre)
    return `• <b>${key}</b> — ${t.name} &nbsp; <a href="${gen}">gen token</a> &nbsp; <a href="${open}">test open</a> &nbsp; <a href="${test}">test open (token)</a>`;
  }).join('<br/>');

  res.send(`<h3>Shelly unified opener</h3>
  <p>${Object.keys(targets).length} targets configured.</p>
  ${rows}
  <p><br/><a href="/health">/health</a></p>`);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(SHELLY_API_KEY),
    hasBaseUrl: Boolean(SHELLY_BASE_URL),
    baseUrl: SHELLY_BASE_URL
  });
});

// Genera un link token per OGGI (valido fino a mezzanotte UTC)
app.get('/gen/:target', (req, res) => {
  const key = req.params.target;
  if (!targets[key]) return res.status(404).json({ ok: false, error: 'unknown target' });

  const ymd = todayYMD();
  const sig = sign(key, ymd);
  const url = `${req.protocol}://${req.get('host')}/t/${encodeURIComponent(key)}/${ymd}/${sig}`;
  res.json({ ok: true, target: key, date: ymd, sig, url });
});

// Link tokenizzato (controlla firma e data)
app.get('/t/:target/:ymd/:sig', async (req, res) => {
  try {
    const { target, ymd, sig } = req.params;
    if (!targets[target]) return res.status(404).send('Unknown target');

    // scadenza: valido SOLO per la data di oggi (UTC)
    const today = todayYMD();
    if (ymd !== today) return res.status(401).send('Token expired');

    const expected = sign(target, ymd);
    if (sig !== expected) return res.status(401).send('Bad signature');

    const data = await shellyOpen(targets[target].id);
    res.json({ ok: true, data });
  } catch (err) {
    const msg = err.response?.data || err.message || String(err);
    res.status(500).send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
});

// Prova “open” diretta (senza token) per debug
app.get('/open', async (req, res) => {
  try {
    const key = req.query.target;
    if (!key || !targets[key]) return res.status(400).json({ ok: false, error: 'missing or unknown target' });
    const data = await shellyOpen(targets[key].id);
    res.json({ ok: true, data });
  } catch (err) {
    const msg = err.response?.data || err.message || String(err);
    res.status(500).send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
});

// Genera e apre subito col token (utile per provare da PC)
app.get('/test-open/:target', (req, res) => {
  const key = req.params.target;
  if (!targets[key]) return res.status(404).json({ ok: false, error: 'unknown target' });
  const ymd = todayYMD();
  const sig = sign(key, ymd);
  res.redirect(`/t/${encodeURIComponent(key)}/${ymd}/${sig}`);
});

app.listen(PORT, () => {
  console.log(`OK on ${PORT}`);
});
