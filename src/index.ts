import { loadAiConfig, loadConfig } from "./config.js";
import { createClient } from "./bot/client.js";
import { GameManager } from "./bot/games.js";
import { createClaudeBuyerFactory } from "./ai/buyer.js";
import { StatsRepository } from "./db/stats.js";

const config = loadConfig();
const aiConfig = loadAiConfig();

if (!config.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("⚠️  ANTHROPIC_API_KEY puuttuu .env-tiedostosta: ostaja ei pysty vastaamaan.");
}
console.log(`🤖 Ostajan malli: ${aiConfig.ANTHROPIC_MODEL} (effort: ${aiConfig.ANTHROPIC_EFFORT})`);

const stats = new StatsRepository(config.DATABASE_PATH);
console.log(`💾 Tilastot: ${config.DATABASE_PATH}`);

const games = new GameManager(createClaudeBuyerFactory(aiConfig), stats);
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
