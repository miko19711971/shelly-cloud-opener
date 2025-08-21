const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Variabili d’ambiente (Render → Environment)
const SHELLY_API_KEY = process.env.SHELLY_API_KEY; // la tua API Key (quella che funzionava)
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-api-eu.shelly.cloud';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change-me';

// Mappa target -> deviceId
const TARGETS = {
  'leonina-door':               '3494547a9395',
  'leonina-building-door':      '34945479fbbe',
  'scala-door':                 '3494547a1075',
  'scala-building-door':        '3494547745ee',
  'ottavia-door':               '3494547a887d',
  'ottavia-building-door':      '3494547ab62b',
  'viale-trastevere-door':      '34945479fa35',
  'viale-trastevere-building-door':'34945479fd73',
  'arenula-building-door':      '3494547ab05e'
};

// pagina indice rapida
app.get('/', (_req, res) => {
  const items = Object.keys(TARGETS).map(t => {
    return `• ${t} — <a href="/gen/${t}">gen token</a> — <a href="/open?target=${t}">test open</a> — <a href="/test-open-token?target=${t}">test open (token)</a>`;
  }).join('<br>');
  res.send(`<h3>Shelly unified opener</h3><p>${Object.keys(TARGETS).length} targets configured.</p><p>${items}</p><p><a href="/health">/health</a></p>`);
});

// health
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!SHELLY_API_KEY,
    hasBase: !!SHELLY_BASE_URL,
    node: process.version
  });
});

// genera URL con token per la giornata (scadenza a mezzanotte UTC della data indicata)
app.get('/gen/:target', (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;

  const sig = crypto.createHmac('sha256', TOKEN_SECRET)
    .update(`${target}|${date}`)
    .digest('base64url');

  const url = `${req.protocol}://${req.get('host')}/open/${target}/${date}/${sig}`;
  res.json({ ok: true, target, date, sig, url });
});

// verifica token
function verifyToken(target, date, sig) {
  const expected = crypto.createHmac('sha256', TOKEN_SECRET)
    .update(`${target}|${date}`)
    .digest('base64url');

  // scade a mezzanotte UTC del giorno indicato
  const now = new Date();
  const [y, m, d] = date.split('-').map(n => parseInt(n, 10));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

  return sig === expected && now.getTime() <= end.getTime();
}

// apertura con token
app.get('/open/:target/:date/:sig', async (req, res) => {
  const { target, date, sig } = req.params;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });
  if (!verifyToken(target, date, sig)) return res.json({ ok: false, error: 'invalid_or_expired_token' });

  return doShellyOpen(TARGETS[target], res);
});

// apertura “diretta” (solo debug)
app.get('/open', async (req, res) => {
  const target = req.query.target;
  if (!TARGETS[target]) return res.json({ ok: false, error: 'unknown_target' });

  return doShellyOpen(TARGETS[target], res);
});

// chiamata Shelly Cloud
async function doShellyOpen(deviceId, res) {
  try {
    const url = `${SHELLY_BASE_URL}/device/relay/control`;
    const body = new URLSearchParams({
      id: deviceId,
      auth_key: SHELLY_API_KEY,
      channel: '0',
      turn: 'on'   // impulso ON; se hai impostato “auto-off” nel device, si richiude da solo
    });

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.isok === false) {
      return res.json({ ok: false, error: JSON.stringify(data) });
    }
    return res.json({ ok: true, data });
  } catch (err) {
    return res.json({ ok: false, error: String(err) });
  }
}

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
