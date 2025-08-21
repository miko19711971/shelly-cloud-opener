const express = require("express");
const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// === VARIABILI D’AMBIENTE RICHIESTE ===
// SHELLY_API_KEY   (la tua chiave Cloud, unica, quella vecchia)
// SHELLY_BASE_URL  => https://shelly-api-eu.shelly.cloud/device/relay/control
// TOKEN_SECRET     => una stringa a caso per firmare i token (es. generata da Render)

function todayYMD() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sign(target, date) {
  return crypto
    .createHmac("sha256", process.env.TOKEN_SECRET || "changeme")
    .update(`${target}:${date}`)
    .digest("base64url");
}

function validateToken(target, date, sig) {
  if (!date || !sig) return false;
  // valido solo per il giorno indicato (scade a mezzanotte UTC)
  const expected = sign(target, date);
  return sig === expected && date === todayYMD();
}

// === Mappa dei dispositivi (ID forniti da te) ===
const TARGETS = {
  "leonina-door":              { name: "Leonina — Apartment Door",  id: "3494547a9395" },
  "leonina-building-door":     { name: "Leonina — Building Door",   id: "34945479fbbe" },
  "scala-door":                { name: "Scala — Apartment Door",    id: "3494547a1075" },
  "scala-building-door":       { name: "Scala — Building Door",     id: "3494547745ee" },
  "ottavia-door":              { name: "Ottavia — Apartment Door",  id: "3494547a887d" },
  "ottavia-building-door":     { name: "Ottavia — Building Door",   id: "3494547ab62b" },
  "viale-trastevere-door":     { name: "Viale Trastevere — Apartment Door", id: "34945479fa35" },
  "viale-trastevere-building-door": { name: "Viale Trastevere — Building Door", id: "34945479fd73" },
  "arenula-building-door":     { name: "Arenula — Building Door",   id: "3494547ab05e" },
};

// pagina indice comoda
app.get("/", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const rows = Object.entries(TARGETS).map(([slug, t]) => {
    const gen = `${base}/gen/${slug}`;
    const testOpen = `${base}/open/${slug}`;                // senza token
    const tokenOpen = `${base}/open/${slug}/${todayYMD()}/${sign(slug, todayYMD())}`; // con token odierno
    return `• <b>${slug}</b> — ${t.name} &nbsp;
      <a href="${gen}">gen token</a> &nbsp;
      <a href="${testOpen}">test open</a> &nbsp;
      <a href="${tokenOpen}">test open (token)</a>`;
  });
  res
    .status(200)
    .send(`<h3>Shelly unified opener</h3><p>${rows.join("<br>")}</p><p><a href="/health">/health</a></p>`);
});

// salute / diagnostica
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hasApiKey: !!process.env.SHELLY_API_KEY,
    hasBase: !!process.env.SHELLY_BASE_URL,
    cloudBase: process.env.SHELLY_BASE_URL || null,
  });
});

// genera link con token valido per OGGI (24h, scade a mezzanotte UTC)
app.get("/gen/:target", (req, res) => {
  const { target } = req.params;
  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: "Unknown target" });
  const date = todayYMD();
  const sig = sign(target, date);
  const url = `${req.protocol}://${req.get("host")}/open/${target}/${date}/${sig}`;
  res.json({ ok: true, target, date, sig, url });
});

// apre SENZA token (uso amministrativo)
app.get("/open/:target", async (req, res) => {
  const { target } = req.params;
  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: "Unknown target" });
  try {
    const data = await openShelly(TARGETS[target].id);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(502).json({ ok: false, error: toErr(e) });
  }
});

// apre CON token (per ospiti)
app.get("/open/:target/:date/:sig", async (req, res) => {
  const { target, date, sig } = req.params;
  if (!TARGETS[target]) return res.status(404).json({ ok: false, error: "Unknown target" });
  if (!validateToken(target, date, sig)) {
    return res.status(401).send("ERROR 401 (token invalid or expired)");
  }
  try {
    const data = await openShelly(TARGETS[target].id);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(502).json({ ok: false, error: toErr(e) });
  }
});

// --- chiamata al Cloud Shelly: form-urlencoded, con auth_key come PARAMETRO ---
async function openShelly(deviceId) {
  const url = process.env.SHELLY_BASE_URL; // es.: https://shelly-api-eu.shelly.cloud/device/relay/control
  if (!url) throw new Error("Missing SHELLY_BASE_URL");
  if (!process.env.SHELLY_API_KEY) throw new Error("Missing SHELLY_API_KEY");

  const payload = qs.stringify({
    auth_key: process.env.SHELLY_API_KEY,
    id: deviceId,
    channel: 0,          // Shelly 1 -> canale 0
    turn: "on",          // impulso
  });

  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });
  return resp.data;
}

function toErr(e) {
  if (e.response && e.response.data) return e.response.data;
  if (e.message) return e.message;
  return String(e);
}

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
