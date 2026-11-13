/**
 * Rekisteröi slash-komennot Discordiin.
 *   npm run deploy-commands               → vain DISCORD_GUILD_ID-palvelimelle (päivittyy heti, kehitykseen)
 *   npm run deploy-commands -- --global   → kaikille palvelimille, joilla botti on.
 *                                           Poistaa samalla testipalvelimen omat kopiot, ettei komennot näy kahdesti.
 */
import { REST, Routes } from "discord.js";
import { loadConfig } from "../config.js";
import { commandData } from "../commands/index.js";

const config = loadConfig();
const rest = new REST().setToken(config.DISCORD_TOKEN);
const body = commandData.map((c) => c.toJSON());
const names = commandData.map((c) => `/${c.name}`).join(", ");
const global = process.argv.includes("--global");

if (global || !config.DISCORD_GUILD_ID) {
  console.log(`Rekisteröidään ${body.length} komentoa globaalisti (kaikille palvelimille)...`);
  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body });
  console.log(`✅ Valmis: ${names}`);

  if (config.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body: [] });
    console.log(`🧹 Poistettu palvelinkohtaiset kopiot palvelimelta ${config.DISCORD_GUILD_ID}, ettei komennot näy kahdesti.`);
  }
  console.log("Uusilla palvelimilla komennot voivat näkyä vasta hetken päästä. Käynnistä Discord uudelleen (Ctrl+R), jos ne eivät näy.");
} else {
  console.log(`Rekisteröidään ${body.length} komentoa vain palvelimelle ${config.DISCORD_GUILD_ID}...`);
  await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body });
  console.log(`✅ Valmis: ${names}`);
  console.log("Muilla palvelimilla komennot eivät näy. Rekisteröi kaikille: npm run deploy-commands -- --global");
}
