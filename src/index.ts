import { loadAiConfig, loadConfig } from "./config.js";
import { createClient } from "./bot/client.js";
import { GameManager } from "./bot/games.js";
import { createClaudeBuyerFactory } from "./ai/buyer.js";
import { StatsRepository } from "./db/stats.js";
import { AzureSpeaker, PiperSpeaker, type Speaker } from "./voice/speaker.js";

const config = loadConfig();
const aiConfig = loadAiConfig();

if (!config.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("⚠️  ANTHROPIC_API_KEY puuttuu .env-tiedostosta: ostaja ei pysty vastaamaan.");
}
console.log(`🤖 Ostajan malli: ${aiConfig.ANTHROPIC_MODEL} (effort: ${aiConfig.ANTHROPIC_EFFORT})`);

const stats = new StatsRepository(config.DATABASE_PATH);
console.log(`💾 Tilastot: ${config.DATABASE_PATH}`);

// Äänitila (vaihe 2a): ostaja puhuu valitulla puhesynteesillä (TTS_PROVIDER).
async function createSpeaker(): Promise<Speaker | null> {
  if (config.TTS_PROVIDER === "azure") {
    if (!config.AZURE_SPEECH_KEY) {
      console.warn("🔇 Äänitila pois päältä: TTS_PROVIDER=azure mutta AZURE_SPEECH_KEY puuttuu");
      return null;
    }
    console.log(`🔊 Äänitila käytössä (Azure, ${config.AZURE_SPEECH_REGION})`);
    return new AzureSpeaker(config.AZURE_SPEECH_KEY, config.AZURE_SPEECH_REGION);
  }
  if (config.TTS_PROVIDER === "elevenlabs") {
    console.warn("ElevenLabs-puhesynteesiä ei ole vielä toteutettu: käytetään paikallista Piperiä.");
  }
  const piper = new PiperSpeaker(config.SPEECH_URL);
  const voice = await piper.health();
  console.log(
    voice
      ? `🔊 Äänitila käytössä (paikallinen Piper, ääni ${voice})`
      : `⚠️  Äänitila: puhepalvelu ${config.SPEECH_URL} ei vastaa vielä. Ostajan puhe toimii, kun palvelu käynnistyy (npm run bot:start).`,
  );
  return piper;
}
const speaker = await createSpeaker();

const games = new GameManager(createClaudeBuyerFactory(aiConfig), stats, speaker);
const client = createClient(games, stats);

const shutdown = async (signal: string) => {
  console.log(`\n${signal} vastaanotettu, suljetaan...`);
  await client.destroy();
  stats.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Käsittelemätön lupausvirhe kaataisi Noden oletuksena koko botin ja kaikki käynnissä olevat pelit.
// Kirjataan se lokiin ja jatketaan: yksittäinen epäonnistunut Discord- tai API-kutsu ei saa pysäyttää muita pelejä.
process.on("unhandledRejection", (reason) => {
  console.error("Käsittelemätön virhe (botti jatkaa):", reason);
});

// Synkroninen poikkeus voi jättää prosessin epävakaaseen tilaan: kirjataan ja lopetetaan hallitusti,
// jolloin pm2 käynnistää botin puhtaasti uudelleen.
process.on("uncaughtException", (err) => {
  console.error("Kaatava virhe, botti käynnistetään uudelleen:", err);
  stats.close();
  process.exit(1);
});

await client.login(config.DISCORD_TOKEN);
