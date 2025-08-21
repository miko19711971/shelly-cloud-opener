// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// === Variabili d'ambiente necessarie ===
const API_KEY   = process.env.SHELLY_API_KEY;        // la tua Cloud API Key
const DEVICE_ID = process.env.DEVICE_ID;             // es. 34945479fbbe
// Shelly assegna un "server cluster" al tuo account, dalle tue foto è il 77-eu.
// Se vuoi puoi cambiarlo da Environment su Render.
const CLOUD_BASE = process.env.SHELLY_CLOUD_BASE || "https://shelly-77-eu.shelly.cloud";

// Controllo all’avvio
function requiredEnvOk(){
  return API_KEY && DEVICE_ID;
}

// Home / info rapida
app.get("/", (_req, res) => {
  if (!requiredEnvOk()){
    return res.status(500).json({error: "Variabili di ambiente mancanti: SHELLY_API_KEY o DEVICE_ID"});
  }
  return res
    .status(200)
    .send("✅ Server attivo! Vai su /open per dare l'impulso. /health per stato, /info per dettagli.");
});

// Health check
app.get("/health", (_req, res) => {
  return res.status(200).json({
    ok: true,
    hasApiKey: !!API_KEY,
    hasDeviceId: !!DEVICE_ID,
    cloudBase: CLOUD_BASE
  });
});

// Info (debug)
app.get("/info", (_req, res) => {
  return res.status(200).json({
    deviceId: DEVICE_ID,
    cloudBase: CLOUD_BASE,
    keyLen: API_KEY ? API_KEY.length : 0
  });
});

// Impulso (apertura) — usa Shelly Cloud v1: POST /device/relay/control
app.get("/open", async (_req, res) => {
  if (!requiredEnvOk()){
    return res.status(500).json({error: "Variabili di ambiente mancanti: SHELLY_API_KEY o DEVICE_ID"});
  }

  try {
    const url = `${CLOUD_BASE}/device/relay/control`;
    const body = {
      id: DEVICE_ID,               // ID esadecimale del dispositivo (dalla tua app)
      auth_key: API_KEY,           // Cloud API Key
      channel: 0,                  // canale 0
      turn: "on",                  // impulso ON
      timer: 0.2                   // durata impulso in secondi (regola se serve)
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Se preferisci Bearer (alcuni cluster accettano entrambe le forme):
      // headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      // timeout "soft" con AbortController (node-fetch v3)
      signal: AbortSignal.timeout(10000)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Shelly Cloud ha risposto con errore",
        status: r.status,
        data
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Impulso inviato a Shelly Cloud",
      cloudBase: CLOUD_BASE,
      deviceId: DEVICE_ID,
      data
    });
  } catch (err) {
    return res.status(504).json({
      error: "Timeout o connessione fallita verso Shelly Cloud",
      details: String(err)
    });
  }
});

// Avvio server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});
