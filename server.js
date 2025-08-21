// server.js — Shelly Cloud multi-device opener with per-day tokens
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import fetch from 'node-fetch';

// ====== ENV ======
const PORT = process.env.PORT || 3000;
const SHELLY_API_KEY = process.env.SHELLY_API_KEY || '';               // <-- la tua API key unica
const SHELLY_CLOUD_BASE = process.env.SHELLY_CLOUD_BASE || '';         // es. https://shelly-34-eu.shelly.cloud
const TOKEN_SECRET = process.env.TOKEN_SECRET || '';                   // se impostato, i link richiedono token

// ====== DISPOSITIVI ======
// channel: usa lo stesso canale del primo script (0)
const channelDefault = 0;
const DEVICES = {
  // Leonina
  'leonina-building-door': { id: '34945479fbbe', name: 'Leonina building door', channel: channelDefault },
  'leonina-door':          { id: '3494547a9395', name: 'Leonina door',          channel: channelDefault },

  // Scala
  'scala-building-door':   { id: '3494547745ee', name: 'Scala building door',   channel: channelDefault },
  'scala-door':            { id: '3494547a1075', name: 'Scala door',            channel: channelDefault },

  // Ottavia
  'ottavia-building-door': { id: '3494547ab62b', name: 'Ottavia building door', channel: channelDefault },
  'ottavia-door':          { id: '3494547a887d', name: 'Ottavia door',          channel: channelDefault },

  // Viale Trastevere
  'viale-trastevere-building-door': { id: '34945479fd73', name: 'Viale Trastevere building door', channel: channelDefault },
  'viale-trastevere-door':          { id: '34945479fa35', name: 'Viale Trastevere door',          channel: channelDefault },

  // Arenula (solo portone)
  'arenula-building-door': { id: '3494547ab05e', name: 'Arenula building door', channel: channelDefault },
};

// ====== UTILS ======
const app = express();
app.use(cors());

// data (YYYY-MM-DD) in fuso di Roma, per scadenza a mezzanotte locale
function todayRome() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}

// firma HMAC base64url(name + "|" + date)
function sign(name, date) {
  const h = crypto.createHmac('sha256', TOKEN_SECRET).update(`${name}|${date}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  return h;
}

// verifica token per name/date odierna Roma
function verify(name, token, dateOverride) {
  if (!TOKEN_SECRET) return true; // se non c'è secret, niente token
  const date = dateOverride || todayRome();
  const expect = sign(name, date);
  return token === expect;
}

// costruisce URL cloud Shelly relay/control
function cloudControlURL(deviceId, channel, turn='on') {
  const u = new URL('/device/relay/control', SHELLY_CLOUD_BASE);
  u.searchParams.set('id', deviceId);
  u.searchParams.set('auth_key', SHELLY_API_KEY);
  u.searchParams.set('channel', String(channel ?? 0));
  u.searchParams.set('turn', turn); // 'on' = impulso
  return u.toString();
}

// ====== ROUTES ======

// ping
app.get('/', (_req, res) => {
  res.type('text').send('OK · Shelly multi-device opener');
});

// elenco dispositivi (comodo per debug)
app.get('/devices', (_req, res) => {
  res.json(Object.entries(DEVICES).map(([key, v]) => ({ slug:key, id:v.id, name:v.name, channel:v.channel })));
});

// genera token del giorno (uso interno). Richiede ?secret=... e accetta ?date=YYYY-MM-DD
app.get('/token/:slug', (req, res) => {
  const { slug } = req.params;
  const { secret, date } = req.query;
  if (!TOKEN_SECRET) return res.status(400).json({ error:'TOKEN_SECRET not set on server' });
  if (secret !== TOKEN_SECRET) return res.status(403).json({ error:'forbidden' });
  if (!DEVICES[slug]) return res.status(404).json({ error:'unknown device' });
  const d = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayRome();
  return res.json({ slug, date: d, token: sign(slug, d) });
});

// link completo già pronto (uso interno): /link/:slug?secret=...&date=YYYY-MM-DD
app.get('/link/:slug', (req, res) => {
  const { slug } = req.params;
  const { secret, date } = req.query;
  if (!TOKEN_SECRET) return res.status(400).json({ error:'TOKEN_SECRET not set on server' });
  if (secret !== TOKEN_SECRET) return res.status(403).json({ error:'forbidden' });
  if (!DEVICES[slug]) return res.status(404).json({ error:'unknown device' });
  const d = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayRome();
  const token = sign(slug, d);
  const openUrl = new URL(`/open/${encodeURIComponent(slug)}`, `${req.protocol}://${req.get('host')}`);
  openUrl.searchParams.set('token', token);
  openUrl.searchParams.set('date', d);
  res.json({ slug, open_url: openUrl.toString(), expires_local_midnight: `${d} 23:59 Europe/Rome` });
});

// azione apertura: /open/:slug?token=...&date=YYYY-MM-DD
app.get('/open/:slug', async (req, res) => {
  try {
    // validazioni base
    if (!SHELLY_API_KEY || !SHELLY_CLOUD_BASE) {
      return res.status(500).json({ error: 'Missing env: SHELLY_API_KEY and/or SHELLY_CLOUD_BASE' });
    }
    const { slug } = req.params;
    const dev = DEVICES[slug];
    if (!dev) return res.status(404).json({ error: 'Unknown device slug' });

    // token per il giorno (se richiesto)
    const date = typeof req.query.date === 'string' ? req.query.date : todayRome();
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!verify(slug, token, date)) {
      return res.status(403).json({ error: 'Invalid or expired token for today (Europe/Rome)' });
    }

    // chiama Shelly Cloud
    const url = cloudControlURL(dev.id, dev.channel, 'on');
    const r = await fetch(url, { method: 'GET', timeout: 10000 });
    const text = await r.text();

    // risposta trasparente
    res.type('text').send(`OK\nDevice: ${slug} (${dev.name})\nShelly response:\n${text}`);
  } catch (err) {
    res.status(500).json({ error: 'Request to Shelly Cloud failed', details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log('Shelly opener ready on port', PORT);
});
