const express = require('express');
const axios = require('axios');
const app = express();

const PORT        = process.env.PORT || 3000;
const CLOUD_BASE  = process.env.CLOUD_SERVER || 'https://shelly-77-eu.shelly.cloud';
const DEVICE_ID   = process.env.DEVICE_ID;
const SHELLY_KEY  = process.env.SHELLY_API_KEY;

app.get('/', (req, res) => {
  res.send('Server attivo! Vai su /open per aprire la porta.');
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!SHELLY_KEY,
    hasDeviceId: !!DEVICE_ID,
    cloudBase: CLOUD_BASE
  });
});

app.get('/info', (req, res) => {
  res.json({
    deviceId: DEVICE_ID,
    cloudBase: CLOUD_BASE,
    keyLen: SHELLY_KEY ? SHELLY_KEY.length : 0
  });
});

// impulso di ~1s sul relè (Shelly 1 -> channel 0)
app.get('/open', async (req, res) => {
  if (!SHELLY_KEY || !DEVICE_ID) {
    return res.status(500).json({ error: 'Variabili di ambiente mancanti: SHELLY_API_KEY o DEVICE_ID' });
  }
  try {
    const url  = `${CLOUD_BASE}/device/relay/control`;
    const body = new URLSearchParams({
      id: DEVICE_ID,
      auth_key: SHELLY_KEY,
      channel: '0',
      turn: 'on',
      timer: '1'   // 1 secondo di impulso
    }).toString();

    const r = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    // Shelly Cloud risponde con { "isok": true, ... } in caso di successo
    if (!r.data || r.data.isok === false) {
      return res.status(400).json({ error: 'Shelly Cloud ha risposto con errore', data: r.data });
    }
    res.json({ ok: true, data: r.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
