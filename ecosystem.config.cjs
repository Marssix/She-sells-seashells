// pm2-asetukset: botti ja paikallinen puhepalvelu pyörivät taustalla terminaalista ja Claude-sovelluksesta riippumatta.
// Käyttö: npm run bot:start | bot:stop | bot:restart | bot:logs | bot:status | speech:logs
const path = require("path");

// Windowsissa pythonw.exe: ei konsoli-ikkunaa. (python.exe avaa Windows 11:ssä näkyvän pääteikkunan,
// jonka sulkeminen pysäyttää puhepalvelun.) Tulosteet menevät silti pm2:n lokeihin.
const python = path.join(__dirname, "speech", ".venv", process.platform === "win32" ? "Scripts/pythonw.exe" : "bin/python");

module.exports = {
  apps: [
    {
      // Paikallinen puhepalvelu (Piper). Asennus: npm run speech:setup
      name: "she-sells-speech",
      script: "speech/server.py",
      interpreter: python,
      cwd: __dirname,
      env: { PYTHONUNBUFFERED: "1" },
      windowsHide: true,
      autorestart: true,
      min_uptime: 10_000,
      max_restarts: 10,
      exp_backoff_restart_delay: 2000,
      out_file: "logs/speech-out.log",
      error_file: "logs/speech-error.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "she-sells-seashells",
      // Ajetaan käännettyä JavaScriptiä (npm run build), ei tsx watchia: vakaampi eikä käynnisty uudelleen tiedostomuutoksista.
      script: "dist/index.js",
      cwd: __dirname, // .env ja data/ luetaan projektikansiosta
      node_args: "--no-warnings=ExperimentalWarning",
      autorestart: true,
      // Jos botti kaatuu käynnistyksessä toistuvasti (esim. väärä token), pm2 lopettaa yrittämisen.
      min_uptime: 10_000,
      max_restarts: 10,
      exp_backoff_restart_delay: 2000,
      kill_timeout: 5000,
      // Lokit aikaleimoineen tiedostoihin logs/-kansioon (gitignoressa).
      out_file: "logs/bot-out.log",
      error_file: "logs/bot-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
