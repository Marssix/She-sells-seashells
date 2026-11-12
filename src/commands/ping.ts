import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Tarkista, että botti on hereillä."),

  async execute(interaction) {
    const started = Date.now();
    await interaction.reply({ content: "Pong! 🏓 Mitataan..." });
    const roundTrip = Date.now() - started;
    const ws = interaction.client.ws.ping;
    await interaction.editReply(
      `Pong! 🏓 Kauppias on paikalla.\nVastausaika: **${roundTrip} ms** · Gateway: **${ws >= 0 ? `${ws} ms` : "mittaamatta"}**`,
    );
  },
};
