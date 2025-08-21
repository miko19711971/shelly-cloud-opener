const express = require('express');
const fetch = require('node-fetch');  // Importiamo node-fetch
const app = express();

const PORT = process.env.PORT || 3000;

// Variabili di ambiente da Render
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;
const DEVICE_ID = process.env.DEVICE_ID;

if (!SHELLY_API_KEY || !DEVICE_ID) {
  console.error("❌ Variabili mancanti: SHELLY_API_KEY o DEVICE_ID");
}

// Endpoint di test (homepage)
app.get('/', (req, res) => {
  res.send("✅ Server attivo! Vai su /open per aprire la porta.");
});

// Endpoint che apre la porta
app.get('/open', async (req, res) => {
  try {
    const url = `https://shelly-XX-eu.shelly.cloud/device/relay/control`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `auth_key=${SHELLY_API_KEY}&id=${DEVICE_ID}&turn=on`
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Errore chiamata Shelly:", err);
    res.status(500).json({ error: err.message });
  }
});

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Server avviato su http://localhost:${PORT}`);
});
