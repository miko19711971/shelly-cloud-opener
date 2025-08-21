// server.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// VARIABILI DI AMBIENTE
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;                   // già impostata
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || 'https://shelly-api-eu.shelly.cloud';
const TOKEN_SECRET   = process.env.TOKEN_SECRET || 'change_me';

// Mappa target -> device_id
const TARGETS = {
  'leonina-door': '3494547a9395',
  'leonina-building-door': '34945479fbbe',
  'scala-door': '3494547a1075',
  'scala-building-door': '3494547745ee',
  'ottavia-door': '3494547a887d',
  'ottavia-building-door': '3494547ab62b',
  'viale-trastevere-door': '34945479fa35',
  'viale-trastevere-building-door': '34945479fd73',
  'arenula-building-door': '3494547ab05e'
};

// pagina indice
app.get('/', (_req, res) => {
  const rows = Object.keys(TARGETS).map(t => {
    return `• ${t} — <a href="/gen/${t}">gen token</a>  <a href="/open?target=${t}">test open</a>  <a href="/test/${t}">test open (token)</a>`;
  }).join('<br>');
  res.send(`<h3>Shelly unified opener</h3><p>${Object.keys(TARGETS).length} targets configured.</p>${rows}<p><a href="/health">/health</a></p>`);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: !!SHELLY_API_KEY, base: SHELLY_BASE_URL });
});

// genera token valido per oggi (scade a mezzanotte UTC)
app.get('/gen/:target', (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.json({ ok:false, error:'unknown target' });
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD (UTC)
  const sig = crypto.createHmac('sha256', TOKEN_SECRET)
                    .update(`${target}|${today}`)
                    .digest('base64url');
  const url = `${baseUrl(req)}/open/${target}/${today}/${sig}`;
  res.json({ ok:true, target, date: today, sig, url });
});

// test apertura con token firmato
app.get('/test/:target', (req, res) => {
  const target = req.params.target;
  if (!TARGETS[target]) return res.json({ ok:false, error:'unknown target' });
  const today = new Date().toISOString().slice(0,10);
  const sig = crypto.createHmac('sha256', TOKEN_SECRET)
                    .update(`${target}|${today}`)
                    .digest('base64url');
  res.redirect(302, `/open/${target}/${today}/${sig}`);
});

// test apertura SENZA token (solo per prove)
app.get('/open', async (req, res) => {
  const target = req.query.target;
  if (!TARGETS[target]) return res.json({ ok:false, error:'unknown target' });
  try {
    const data = await cloudPulse(TARGETS[target]);
    res.json({ ok:true, data });
  } catch (e) {
    res.json({ ok:false, error: errText(e) });
  }
});

// apertura con token
app.get('/open/:target/:date/:sig', async (req, res) => {
  const { target, date, sig } = req.params;
  if (!TARGETS[target]) return res.json({ ok:false, error:'unknown target' });
  const today = new Date().toISOString().slice(0,10);
  if (date !== today) return res.json({ ok:false, error:'token expired/invalid date' });
  const expected = crypto.createHmac('sha256', TOKEN_SECRET)
                         .update(`${target}|${date}`)
                         .digest('base64url');
  if (sig !== expected) return res.json({ ok:false, error:'bad signature' });
  try {
    const data = await cloudPulse(TARGETS[target]);
    res.json({ ok:true, target, data });
  } catch (e) {
    res.json({ ok:false, error: errText(e) });
  }
});

// ---------- helpers ----------

// sceglie automaticamente l'endpoint corretto in base al device type
async function cloudPulse(deviceId) {
  // 1) leggi lo status per capire il tipo
  const statusUrl = `${SHELLY_BASE_URL}/device/status`;
  const statusResp = await axios.post(statusUrl, {
    id: deviceId,
    auth_key: SHELLY_API_KEY
  }, { timeout: 10000 });

  const st = statusResp.data || {};
  // Alcune risposte hanno st.data.device_type, altre st.device_type/switch: gestiamo tutte
  const type = (st.data && (st.data.device_type || st.data.type)) || st.device_type || st.type || 'relay';

  // 2) componi la chiamata giusta
  let controlPath;
  if (String(type).toLowerCase().includes('roller')) {
    controlPath = '/device/roller/control';
  } else {
    // per 'relay' o 'switch' usiamo relay
    controlPath = '/device/relay/control';
  }

  const controlUrl = `${SHELLY_BASE_URL}${controlPath}`;
  // impulso su channel 0
  const resp = await axios.post(controlUrl, {
    id: deviceId,
    auth_key: SHELLY_API_KEY,
    channel: 0,
    turn: 'on'
  }, { timeout: 10000 });

  return resp.data;
}

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers.host}`;
}

function errText(e) {
  if (e.response) {
    return JSON.stringify(e.response.data || { status: e.response.status });
  }
  if (e.request) return 'no response from cloud';
  return e.message || 'unknown error';
}

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
