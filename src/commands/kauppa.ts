import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { GameManager } from "../bot/games.js";
import { personaListEmbed } from "../bot/ui.js";
import { personas } from "../content/personas.js";
import type { Command } from "./types.js";

export const kauppaData = new SlashCommandBuilder()
  .setName("kauppa")
  .setDescription("Myy mitä tahansa tekoälyostajalle.")
  .addSubcommand((sub) =>
    sub
      .setName("aloita")
      .setDescription("Aloita uusi kauppa. Saat satunnaisen tuotteen.")
      .addStringOption((o) =>
        o
          .setName("ostaja")
          .setDescription("Valitse ostaja (oletus: satunnainen)")
          .addChoices(...personas.map((p) => ({ name: `${p.emoji} ${p.name} (${"★".repeat(p.difficulty)})`, value: p.id }))),
      ),
  )
  .addSubcommand((sub) => sub.setName("ostajat").setDescription("Näytä kaikki ostajat ja vihjeet heidän heikkouksistaan."));

export function createKauppaCommand(games: GameManager): Command {
  return {
    data: kauppaData,
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "aloita") {
        await games.start(interaction, interaction.options.getString("ostaja"));
      } else if (sub === "ostajat") {
        await interaction.reply({ embeds: [personaListEmbed(personas)], flags: MessageFlags.Ephemeral });
      }
    },
  };
}
