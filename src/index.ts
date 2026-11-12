import { loadConfig } from "./config.js";
import { createClient } from "./bot/client.js";

const config = loadConfig();
const client = createClient();

const shutdown = async (signal: string) => {
  console.log(`\n${signal} vastaanotettu, suljetaan...`);
  await client.destroy();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.DISCORD_TOKEN);
