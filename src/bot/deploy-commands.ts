import { REST, Routes } from "discord.js";
import { loadConfig } from "../config.js";
import { commands } from "../commands/index.js";

const config = loadConfig();
const rest = new REST().setToken(config.DISCORD_TOKEN);
const body = commands.map((c) => c.data.toJSON());

const route = config.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
  : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

const scope = config.DISCORD_GUILD_ID ? `palvelimelle ${config.DISCORD_GUILD_ID}` : "globaalisti (voi kestää jopa tunnin)";

console.log(`Rekisteröidään ${body.length} komentoa ${scope}...`);
await rest.put(route, { body });
console.log(`✅ Valmis: ${commands.map((c) => `/${c.data.name}`).join(", ")}`);
