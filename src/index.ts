import { loadAiConfig, loadConfig } from "./config.js";
import { createClient } from "./bot/client.js";
import { GameManager } from "./bot/games.js";
import { createClaudeBuyerFactory } from "./ai/buyer.js";

const config = loadConfig();
const aiConfig = loadAiConfig();

if (!config.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("⚠️  ANTHROPIC_API_KEY puuttuu .env-tiedostosta: ostaja ei pysty vastaamaan.");
}
console.log(`🤖 Ostajan malli: ${aiConfig.ANTHROPIC_MODEL} (effort: ${aiConfig.ANTHROPIC_EFFORT})`);

const games = new GameManager(createClaudeBuyerFactory(aiConfig));
const client = createClient(games);

const shutdown = async (signal: string) => {
  console.log(`\n${signal} vastaanotettu, suljetaan...`);
  await client.destroy();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.DISCORD_TOKEN);
