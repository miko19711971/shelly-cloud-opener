import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// La tua API Key Shelly Cloud (inserita come variabile ambiente su Render)
const API_KEY = process.env.SHELLY_API_KEY;

// Lista dispositivi (puoi aggiungere quanti ne vuoi)
const DEVICES = {
  "arenula-door": "DEVICE_ID_ARENULA",
  "arenula-building": "DEVICE_ID_PORTONE",
  "leonina-door": "DEVICE_ID_LEONINA"
};

// Endpoint per aprire una porta
app.get("/open/:door", async (req, res) => {
  const door = req.params.door;
  const deviceId = DEVICES[door];

  if (!deviceId) {
    return res.status(404).send("❌ Dispositivo non trovato");
  }

  try {
    // Accendi (apri)
    await fetch(`https://shelly-25-eu.shelly.cloud/device/relay/control`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `auth_key=${API_KEY}&id=${deviceId}&turn=on`
    });

    // Spegni dopo 1 secondo
    setTimeout(async () => {
      await fetch(`https://shelly-25-eu.shelly.cloud/device/relay/control`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `auth_key=${API_KEY}&id=${deviceId}&turn=off`
      });
    }, 1000);

    res.send(`✅ Porta ${door} aperta`);
  } catch (e) {
    res.status(500).send("Errore apertura porta");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
