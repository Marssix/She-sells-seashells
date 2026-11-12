import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commandMap } from "../commands/index.js";

export function createClient(): Client {
  const client = new Client({
    // Ei etuoikeutettuja intenttejä: slash-komennot + äänikanavien tila riittävät.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Kirjautunut: ${c.user.tag} · palvelimia: ${c.guilds.cache.size}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
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
