const express = require('express');
const fetch = require('node-fetch');
const app = express();

const PORT = process.env.PORT || 3000;

// API KEY dal Cloud Shelly (mettila nelle variabili di ambiente su Render)
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;

// ID del device Shelly (anche questo meglio come variabile di ambiente)
const DEVICE_ID = process.env.DEVICE_ID;

app.get('/open', async (req, res) => {
  try {
    const url = `https://shelly-33-eu.shelly.cloud/device/relay/control` +
                `?auth_key=${SHELLY_API_KEY}&id=${DEVICE_ID}&turn=on`;

    const response = await fetch(url);
    const data = await response.json();

    res.json({
      status: "OK",
      result: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nell'aprire lo Shelly" });
  }
});

app.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});
