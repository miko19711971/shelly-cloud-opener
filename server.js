const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Variabili ambiente: API key, Device ID, Server Cloud Shelly
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;
const SHELLY_DEVICE_ID = process.env.SHELLY_DEVICE_ID;
const SHELLY_CLOUD = process.env.SHELLY_CLOUD || "shelly-54-e1-40-f2-94-3e";

// Archivio token validi
let tokens = {};

// ==== GENERA TOKEN valido fino a mezzanotte ====
app.post("/token", express.json(), (req, res) => {
  const { date } = req.body; 
  const targetDate = date ? new Date(date) : new Date();

  // Imposta la scadenza alla mezzanotte della data scelta
  const expiry = new Date(targetDate);
  expiry.setHours(23, 59, 59, 999);

  // Genera token casuale
  const token = crypto.randomBytes(16).toString("hex");
  tokens[token] = expiry.getTime();

  const link = `${req.protocol}://${req.get("host")}/open?t=${token}`;

  res.send({
    token,
    validUntil: expiry,
    link
  });
});

// ==== APRI PORTA ====
app.get("/open", async (req, res) => {
  const { t } = req.query;
  if (!t || !tokens[t]) {
    return res.status(400).send("❌ Token mancante o inesistente");
  }

  const now = Date.now();
  const expiry = tokens[t];

  if (now > expiry) {
    return res.status(403).send("❌ Token scaduto (fine giornata)");
  }

  try {
    const url = `https://${SHELLY_CLOUD}/device/relay/control`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SHELLY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: SHELLY_DEVICE_ID,
        method: "Switch.Set",
        params: { id: 0, on: true }
      })
    });

    if (!response.ok) {
      throw new Error(`Errore Shelly Cloud: ${response.status}`);
    }

    res.send(
      `<html><body style="font-family:system-ui; padding:24px">
         <h2>✅ Porta aperta!</h2>
         <p>Il token rimane valido fino a mezzanotte.</p>
       </body></html>`
    );

  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Errore connessione al Cloud Shelly");
  }
});

// ==== AVVIO SERVER ====
app.listen(PORT, () => {
  console.log(`Server attivo su http://localhost:${PORT}`);
});
