// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// === ENV ===
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;              // obbligatoria
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-77-eu.shelly.cloud'; // la tua shard
const TOKEN_SECRET    = process.env.TOKEN_SECRET || 'change-me';

// tutti dispositivi (Shelly 1 → relay channel 0)
const TARGETS = {
  'leonina-door':               { name: 'Leonina — Apartment Door',  id: '3494547a9395', channel: 0 },
  'leonina-building-door':      { name: 'Leonina — Building Door',   id: '34945479fbbe', channel: 0 },
  'scala-door':                 { name: 'Scala — Apartment Door',    id: '3494547a1075', channel: 0 },
  'scala-building-door':        { name: 'Scala — Building Door',     id: '3494547745ee', channel: 0 },
  'ottavia-door':               { name: 'Ottavia — Apartment Door',  id: '3494547a887d', channel: 0 },
  'ottavia-building-door':      { name: 'Ottavia — Building Door',   id: '3494547ab62b', channel: 0 },
  'viale-trastevere-door':      { name: 'Viale Trastevere — Door',   id: '34945479fa35', channel: 0 },
  'viale-trastevere-building-door': { name: 'Viale Trastevere — Building Door', id: '34945479fd73', channel: 0 },
  'arenula-building-door':      { name: 'Arenula — Building Door',   id: '3494547ab05e', channel: 0 }
};

// util
const todayStr = () => new Date().toISOString().slice(0,10); // YYYY-MM-DD
const signFor = (payload) =>
  crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');

// pagina indice
app.get('/', (_req, res) => {
  const rows = Object.entries(TARGETS).map(([key, t]) => {
    return `<li><b>${key}</b> — ${t.name}
      <a href="/gen/${key}">gen token</a>
      <a href="/test-open?target=${encodeURIComponent(key)}">test open</a>
      <a href="/test-open-token?target=${encodeURIComponent(key)}">test open (token)</a>
    </li>`;
  }).join('\n');
  res.type('html').send(`<h1>Shelly unified opener</h1><p>${Object.keys(TARGETS).length} targets configured.</p><ul>${rows}</ul><p><a href="/health">/health</a></p>`);
});

// health
app.get('/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: !!SHELLY_API_KEY, hasBase: !!SHELLY_BASE_URL, node: process.version });
});

// genera link con token valido per il giorno (scade a mezzanotte UTC)
app.get('/gen/:target', (req, res) => {
  const target = req.params.target;
  const t = TARGETS[target];
  if (!t) return res.json({ ok:false, error:'unknown_target' });

  const date = todayStr();
  const sig = signFor(`${target}|${date}`);
  const url = `${req.protocol}://${req.get('host')}/open/${encodeURIComponent(target)}/${date}/${sig}`;
  res.json({ ok:true, target, date, sig, url });
});

// verifica token
function verifyToken(target, date, sig) {
  if (date !== todayStr()) return { ok:false, error:'expired_or_wrong_date' };
  const expected = signFor(`${target}|${date}`);
  return sig === expected ? { ok:true } : { ok:false, error:'bad_signature' };
}

// chiamata al Cloud Shelly (relay/control) con auth_key in query
async function openShellyRelay(deviceId, channel=0) {
  const url = `${SHELLY_BASE_URL}/device/relay/control`;
  const params = {
    id: deviceId,
    channel,
    turn: 'on',
    auth_key: SHELLY_API_KEY
  };
  // GET con query string
  const resp = await axios.get(url, { params, timeout: 10000 });
  return resp.data;
}

// apertura con token
app.get('/open/:target/:date/:sig', async (req, res) => {
  const { target, date, sig } = req.params;
  const t = TARGETS[target];
  if (!t) return res.json({ ok:false, error:'unknown_target' });

  const chk = verifyToken(target, date, sig);
  if (!chk.ok) return res.json({ ok:false, error: chk.error });

  try {
    const data = await openShellyRelay(t.id, t.channel);
    res.json({ ok:true, target, cloud:data });
  } catch (err) {
    const details = err.response ? { status: err.response.status, data: err.response.data } : { message: err.message };
    res.json({ ok:false, error:'cloud_error', details });
  }
});

// apertura di test SENZA token (solo diagnostica)
app.get('/open', async (req, res) => {
  const target = req.query.target;
  const t = TARGETS[target];
  if (!t) return res.json({ ok:false, error:'unknown_target' });

  try {
    const data = await openShellyRelay(t.id, t.channel);
    res.json({ ok:true, target, cloud:data });
  } catch (err) {
    const details = err.response ? { status: err.response.status, data: err.response.data } : { message: err.message };
    res.json({ ok:false, error:'cloud_error', details });
  }
});

// comodi link di test
app.get('/test-open', (req, res) => {
  const target = req.query.target || 'leonina-building-door';
  res.redirect(`/open?target=${encodeURIComponent(target)}`);
});
app.get('/test-open-token', (req, res) => {
  const target = req.query.target || 'leonina-building-door';
  const date = todayStr();
  const sig = signFor(`${target}|${date}`);
  res.redirect(`/open/${encodeURIComponent(target)}/${date}/${sig}`);
});

app.listen(PORT, () => console.log(`OK on ${PORT}`));
