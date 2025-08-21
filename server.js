// server.js
// Shelly unified opener – multi-sito con token giornaliero
// Funziona con Shelly Cloud per dispositivi Shelly 1 (SHSW-1)
// Richiede ENV: SHELLY_API_KEY, SHELLY_BASE_URL, TOKEN_SECRET

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const API_KEY = process.env.SHELLY_API_KEY || '';
const BASE = (process.env.SHELLY_BASE_URL || '').replace(/\/+$/, ''); // es: https://shelly-api-eu.shelly.cloud
const SECRET = process.env.TOKEN_SECRET || 'change-me';

// --- Mappa “target” -> { name, id, channel, type }
const TARGETS = {
  // Leonina
  'leonina-door':               { name: 'Leonina — Apartment Door',  id: '3494547a9395', channel: 0, type: 'SHSW-1' },
  'leonina-building-door':      { name: 'Leonina — Building Door',   id: '34945479fbbe', channel: 0, type: 'SHSW-1' },

  // Scala
  'scala-door':                 { name: 'Scala — Apartment Door',    id: '3494547a1075', channel: 0, type: 'SHSW-1' },
  'scala-building-door':        { name: 'Scala — Building Door',     id: '3494547745ee', channel: 0, type: 'SHSW-1' },

  // Ottavia
  'ottavia-door':               { name: 'Ottavia — Apartment Door',  id: '3494547a887d', channel: 0, type: 'SHSW-1' },
  'ottavia-building-door':      { name: 'Ottavia — Building Door',   id: '3494547ab62b', channel: 0, type: 'SHSW-1' },

  // Viale Trastevere
  'viale-trastevere-door':      { name: 'Viale Trastevere — Apartment Door', id: '34945479fa35', channel: 0, type: 'SHSW-1' },
  'viale-trastevere-building-door': { name: 'Viale Trastevere — Building Door', id: '34945479fd73', channel: 0, type: 'SHSW-1' },

  // Arenula (solo portone)
  'arenula-building-door':      { name: 'Arenula — Building Door',   id: '3494547ab05e', channel: 0, type: 'SHSW-1' },
};

// --- utilità token (valido per il giorno corrente YYYY-MM-DD)
const todayStr = () => new Date().toISOString().slice(0, 10);
const sign = (target, date) =>
  crypto.createHmac('sha256', SECRET).update(`${target}|${date}`).digest('base64url');

const verifyToken = (target, date, sig) => {
  if (!date || !sig) return false;
  // valido SOLO per oggi
  const expected = sign(target, todayStr());
  return date === todayStr() && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};

// --- chiamata a Shelly Cloud per SHSW-1 (Shelly 1)
async function openShelly1(deviceId, channel = 0) {
  const url = `${BASE}/device/relay/control`;
  const body = {
    id: deviceId,
    auth_key: API_KEY,
    channel: channel,
    turn: 'on',           // con “momentary/pulse” configurato nel device farà un impulso
    // timer: 1           // opzionale: tieni ON per 1s anche senza “pulse” lato device
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.isok === false) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

// --- apertura generica di un target (per ora supportiamo SHSW-1)
async function openTarget(targetKey) {
  const t = TARGETS[targetKey];
  if (!t) return { ok: false, error: 'unknown_target' };

  // Solo Shelly 1 (SHSW-1)
  if ((t.type || '').toUpperCase() !== 'SHSW-1') {
    return { ok: false, error: 'wrong_type', msg: 'Could not control this device type' };
  }

  try {
    const r = await openShelly1(t.id, t.channel || 0);
    if (!r.ok) return { ok: false, error: 'cloud_error', details: r };
    return { ok: true, result: r.data };
  } catch (e) {
    return { ok: false, error: 'exception', msg: String(e) };
  }
}

// --- HOME: elenco target + link rapidi
app.get('/', (_req, res) => {
  const rows = Object.entries(TARGETS).map(([key, t]) => {
    const gen = `/gen/${encodeURIComponent(key)}`;
    const testDirect = `/open?target=${encodeURIComponent(key)}`;
    const testToken = `/open/${encodeURIComponent(key)}/${todayStr()}/${sign(key, todayStr())}`;
    return `• <b>${key}</b> — ${t.name} &nbsp; <a href="${gen}">gen token</a> &nbsp; <a href="${testDirect}">test open</a> &nbsp; <a href="${testToken}">test open (token)</a>`;
  }).join('<br/>');

  res.type('html').send(
    `<h2>Shelly unified opener</h2>
     <p>${Object.keys(TARGETS).length} targets configured.</p>
     <div>${rows}</div>
     <p><a href="/health">/health</a></p>`
  );
});

// --- HEALTH
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!API_KEY,
    hasBase: !!BASE,
    node: process.version
  });
});

// --- GENERA token per il giorno corrente
app.get('/gen/:target', (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: 'unknown_target' });

  const date = todayStr();
  const sig = sign(target, date);
  const url = `${req.protocol}://${req.get('host')}/open/${encodeURIComponent(target)}/${date}/${sig}`;

  res.json({ ok: true, target, date, sig, url });
});

// --- OPEN (test senza token) => /open?target=...
app.get('/open', async (req, res) => {
  const target = (req.query.target || '').toString();
  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: 'unknown_target' });

  const r = await openTarget(target);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error, details: r.details || r.msg });
  res.json({ ok: true, target, data: r.result || null });
});

// --- OPEN con token giornaliero => /open/:target/:date/:sig
app.get('/open/:target/:date/:sig', async (req, res) => {
  const { target, date, sig } = req.params;

  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: 'unknown_target' });
  if (!verifyToken(target, date, sig)) return res.status(401).json({ ok: false, error: 'invalid_or_expired_token' });

  const r = await openTarget(target);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error, details: r.details || r.msg });
  res.json({ ok: true, target, data: r.result || null });
});

// --- avvio server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shelly unified opener listening on ${PORT}`);
});
