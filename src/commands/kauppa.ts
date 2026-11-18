import { MessageFlags, SlashCommandBuilder, type SlashCommandStringOption } from "discord.js";
import type { GameManager } from "../bot/games.js";
import { personaListEmbed, statsEmbed } from "../bot/ui.js";
import { personas } from "../content/personas.js";
import type { StatsRepository } from "../db/stats.js";
import type { Command } from "./types.js";

const buyerOption = (o: SlashCommandStringOption) =>
  o
    .setName("ostaja")
    .setDescription("Valitse ostaja (oletus: satunnainen)")
    .addChoices(...personas.map((p) => ({ name: `${p.emoji} ${p.name} (${"★".repeat(p.difficulty)})`, value: p.id })));

export const kauppaData = new SlashCommandBuilder()
  .setName("kauppa")
  .setDescription("Myy mitä tahansa tekoälyostajalle.")
  .addSubcommand((sub) =>
    sub.setName("aloita").setDescription("Aloita uusi kauppa tekstinä. Saat satunnaisen tuotteen.").addStringOption(buyerOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName("soita")
      .setDescription("Soita ostajalle: ostaja puhuu äänikanavalla, jolla olet (liity ensin äänikanavalle).")
      .addStringOption(buyerOption),
  )
  .addSubcommand((sub) => sub.setName("ostajat").setDescription("Näytä kaikki ostajat ja vihjeet heidän heikkouksistaan."))
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("Näytä myyntitilastot tällä palvelimella.")
      .addUserOption((o) => o.setName("pelaaja").setDescription("Kenen tilastot (oletus: omasi)")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("unohda")
      .setDescription("Poista kaikki omat pelitilastosi tältä palvelimelta.")
      .addBooleanOption((o) => o.setName("vahvista").setDescription("Valitse True: poistoa ei voi perua").setRequired(true)),
  );

export function createKauppaCommand(games: GameManager, stats: StatsRepository | null): Command {
  return {
    data: kauppaData,
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();

      if (sub === "aloita" || sub === "soita") {
        await games.start(interaction, interaction.options.getString("ostaja"), sub === "soita");
        return;
      }
      if (sub === "ostajat") {
        await interaction.reply({ embeds: [personaListEmbed(personas)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (!stats || !interaction.guildId) {
        await interaction.reply({ content: "Tilastot eivät ole käytettävissä täällä.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (sub === "stats") {
        const user = interaction.options.getUser("pelaaja") ?? interaction.user;
        const member = interaction.options.getMember("pelaaja") ?? (user.id === interaction.user.id ? interaction.member : null);
        const name = member && "displayName" in member ? member.displayName : user.username;
        await interaction.reply({ embeds: [statsEmbed(stats.getUserStats(user.id, interaction.guildId), name, user.displayAvatarURL())] });
        return;
      }

      if (sub === "unohda") {
        if (!interaction.options.getBoolean("vahvista", true)) {
          await interaction.reply({ content: "Mitään ei poistettu. Valitse `vahvista: True`, jos haluat poistaa tilastosi.", flags: MessageFlags.Ephemeral });
          return;
        }
        const removed = stats.deleteUser(interaction.user.id, interaction.guildId);
        await interaction.reply({
          content: removed > 0 ? `🗑️ Poistettu ${removed} kauppaa tilastoistasi tällä palvelimella.` : "Sinusta ei ollut tallennettuja tilastoja tällä palvelimella.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
