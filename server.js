const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// Env
const SHELLY_API_KEY = process.env.SHELLY_API_KEY;           // la tua API Key (auth_key)
const SHELLY_BASE_URL = process.env.SHELLY_BASE_URL || "https://shelly-api-eu.shelly.cloud";

// Mappa dei tuoi dispositivi (slug -> device_id Shelly)
const TARGETS = {
  "leonina-door": "3494547a9395",
  "leonina-building-door": "34945479fbbe",
  "scala-door": "3494547a1075",
  "scala-building-door": "3494547745ee",
  "ottavia-door": "3494547a887d",
  "ottavia-building-door": "3494547ab62b",
  "viale-trastevere-door": "34945479fa35",
  "viale-trastevere-building-door": "34945479fd73",
  "arenula-building-door": "3494547ab05e"
};

// home: elenco link rapidi
app.get("/", (req, res) => {
  const list = Object.keys(TARGETS)
    .map(t => `• ${t} — <a href="/open/${t}">open</a>`)
    .join("<br>");
  res.send(`<h3>Shelly unified opener</h3><p>${Object.keys(TARGETS).length} targets configured.</p>${list}<p><a href="/health">/health</a></p>`);
});

// health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!SHELLY_API_KEY,
    baseUrl: SHELLY_BASE_URL,
    targets: Object.keys(TARGETS)
  });
});

// open con path /open/:target
app.get("/open/:target", async (req, res) => {
  await openTarget(req.params.target, res);
});

// open anche con query /open?target=...
app.get("/open", async (req, res) => {
  await openTarget(req.query.target, res);
});

async function openTarget(target, res) {
  try {
    if (!target || !TARGETS[target]) {
      return res.status(400).json({ ok: false, error: "Unknown or missing target" });
    }
    if (!SHELLY_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing SHELLY_API_KEY env var" });
    }

    const deviceId = TARGETS[target];

    // Chiamata Shelly Cloud (auth_key nel body) – azione ON sul canale 0
    const r = await fetch(`${SHELLY_BASE_URL}/device/relay/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_key: SHELLY_API_KEY,
        id: deviceId,
        channel: 0,
        turn: "on"
      })
    });

    const data = await r.json();
    // Rispondiamo sempre con payload chiaro
    res.status(r.ok ? 200 : 400).json({ ok: r.ok, target, deviceId, cloudResponse: data });

  } catch (err) {
    res.status(500).json({ ok: false, target, error: String(err) });
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
