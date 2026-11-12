import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { buildCommands } from "../commands/index.js";
import type { GameManager } from "./games.js";

export function createClient(games: GameManager): Client {
  const commands = buildCommands(games);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Etuoikeutettu intentti: tarvitaan myyntipuheiden lukemiseen ketjusta.
      // Kytke päälle: Developer Portal → Bot → Message Content Intent.
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Kirjautunut: ${c.user.tag} · palvelimia: ${c.guilds.cache.size}`);
  });

  client.on(Events.MessageCreate, (message) => {
    games.onMessage(message).catch((err) => console.error("Virhe viestin käsittelyssä:", err));
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith("kauppa:")) return;
      try {
        await games.onButton(interaction);
      } catch (err) {
        console.error("Virhe napin käsittelyssä:", err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`Tuntematon komento: /${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Virhe komennossa /${interaction.commandName}:`, err);
      const msg = { content: "Hups, kauppias kompastui. Yritä uudelleen.", flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  });

  return client;
}
