import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { buildCommands } from "../commands/index.js";
import type { StatsRepository } from "../db/stats.js";
import type { GameManager } from "./games.js";

export function createClient(games: GameManager, stats: StatsRepository | null): Client {
  const commands = buildCommands(games, stats);

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

  // Ilman 'error'-kuuntelijaa Node kaataa koko prosessin, kun Discord-yhteydessä tapahtuu virhe.
  // discord.js yhdistää uudelleen itse, joten riittää kirjata tapahtumat lokiin.
  client.on(Events.Error, (err) => console.error("Discord-asiakkaan virhe:", err));
  client.on(Events.Warn, (msg) => console.warn("Discord-varoitus:", msg));
  client.on(Events.ShardError, (err, shardId) => console.error(`Discord-yhteyden virhe (shard ${shardId}):`, err));
  client.on(Events.ShardDisconnect, (event, shardId) => console.warn(`Discord-yhteys katkesi (shard ${shardId}, koodi ${event.code}).`));
  client.on(Events.ShardReconnecting, (shardId) => console.warn(`Yhdistetään Discordiin uudelleen (shard ${shardId})...`));
  client.on(Events.ShardResume, (shardId, replayed) => console.log(`Discord-yhteys palautui (shard ${shardId}, ${replayed} tapahtumaa).`));

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
