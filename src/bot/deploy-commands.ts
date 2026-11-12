import { REST, Routes } from "discord.js";
import { loadConfig } from "../config.js";
import { commandData } from "../commands/index.js";

const config = loadConfig();
const rest = new REST().setToken(config.DISCORD_TOKEN);
const body = commandData.map((c) => c.toJSON());

const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

const scope = config.DISCORD_GUILD_ID ? `palvelimelle ${config.DISCORD_GUILD_ID}` : "globaalisti (voi kestää jopa tunnin)";

console.log(`Rekisteröidään ${body.length} komentoa ${scope}...`);
await rest.put(route, { body });
console.log(`✅ Valmis: ${commandData.map((c) => `/${c.name}`).join(", ")}`);
