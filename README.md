# Kaupitse Botille 🛒🎙️

Discord-peli, jossa myyt mitä tahansa tekoälyostajalle omalla äänelläsi.

**Tila:** vaihe 0 (projektipohja + `/ping`).

## Käyttöönotto

### 1. Luo Discord-sovellus
1. Avaa <https://discord.com/developers/applications> → **New Application** → nimi esim. "Kaupitse Botille".
2. **General Information** → kopioi **Application ID** → `.env`:n `DISCORD_CLIENT_ID`.
3. **Bot** → **Reset Token** → kopioi token → `.env`:n `DISCORD_TOKEN`.
   Etuoikeutettuja intenttejä (Presence, Server Members, Message Content) **ei tarvita**.
4. **Installation** (tai OAuth2 → URL Generator):
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `View Channels`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Embed Links`, `Connect`, `Speak`, `Use Voice Activity`
   - Avaa generoitu linkki ja kutsu botti **testipalvelimellesi**.
5. Discordissa: Asetukset → Lisäasetukset → **Developer Mode** päälle → oikea klikkaus palvelimeen → **Copy Server ID** → `.env`:n `DISCORD_GUILD_ID`.

### 2. Aja botti
```bash
cp .env.example .env      # täytä arvot
npm install
npm run deploy-commands   # rekisteröi slash-komennot testipalvelimelle
npm run dev               # käynnistää botin, käynnistyy uudelleen muutoksista
```
Kirjoita Discordissa `/ping`, niin botin pitäisi vastata "Pong! 🏓".

## Skriptit
| Komento | Tekee |
|---|---|
| `npm run dev` | Kehitystila (tsx watch) |
| `npm run deploy-commands` | Rekisteröi slash-komennot (aja aina kun komentoja lisätään/muutetaan) |
| `npm test` | Vitest-testit |
| `npm run typecheck` / `npm run lint` | Tyyppi- ja tyylitarkistus |
| `npm run build` && `npm start` | Tuotantobuildi `dist/`-kansioon ja ajo |

## Rakenne
```
src/
  index.ts        # käynnistys
  config.ts       # .env-validointi (zod)
  bot/            # Discord-client, komentojen rekisteröinti
  commands/       # slash-komennot (lisää uudet commands/index.ts-listaan)
  game/           # pelimoottori (vaihe 1)
  ai/             # LLM-ostaja (vaihe 1)
  voice/          # STT/TTS/äänikanava (vaihe 2)
  content/        # persoonat, tuotteet, kortit (vaihe 1)
  db/             # tallennus (vaihe 4)
tests/
```

## API-avaimet myöhempiin vaiheisiin
- **Vaihe 1:** Anthropic API-avain → <https://console.anthropic.com>
- **Vaihe 2:** Deepgram (STT) ja ElevenLabs (TTS), tai Azure Speech molempiin
