import {
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { BuyerUnavailableError } from "../ai/buyer.js";
import { getPersona, personas } from "../content/personas.js";
import { products } from "../content/products.js";
import { toRoundRecord, type StatsRepository } from "../db/stats.js";
import { GameSession, type BuyerFactory } from "../game/session.js";
import type { GameEvent } from "../game/types.js";
import { BUTTON, buyerLine, eventNotes, resultEmbed, statusButtons, statusEmbed } from "./ui.js";

/** Kauan ostaja odottaa myyjän seuraavaa viestiä. */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
/** Kauanko ketju pysyy auki pelin päätyttyä, jotta tuloksen ehtii nähdä. */
const ARCHIVE_DELAY_MS = 60 * 1000;

interface ActiveGame {
  session: GameSession;
  thread: ThreadChannel;
  guildId: string;
  statusMessage: Message;
  sellerName: string;
  idleTimer: NodeJS.Timeout;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** Pitää kirjaa käynnissä olevista peleistä (ketju = yksi peli). */
export class GameManager {
  private readonly games = new Map<string, ActiveGame>();
  private readonly threadByUser = new Map<string, string>();

  constructor(
    private readonly buyerFactory: BuyerFactory,
    private readonly stats: StatsRepository | null = null,
  ) {}

  async start(interaction: ChatInputCommandInteraction, personaId: string | null): Promise<void> {
    const existing = this.threadByUser.get(interaction.user.id);
    if (existing) {
      await interaction.reply({ content: `Sinulla on jo kauppa käynnissä: <#${existing}>`, flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Aloita kauppa tavallisella tekstikanavalla (ei ketjussa tai yksityisviestissä).", flags: MessageFlags.Ephemeral });
      return;
    }

    const persona = (personaId && getPersona(personaId)) || pick(personas);
    const product = pick(products);
    const sellerName = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.username;

    const response = await interaction.reply({
      content: `🛒 **${sellerName}** yrittää myydä tuotteen *${product.name}* ostajalle ${persona.emoji} **${persona.name}**. Seuraa ketjussa!`,
      withResponse: true,
    });
    const announce = response.resource?.message;
    if (!announce) throw new Error("Aloitusviestiä ei saatu.");

    const thread = await announce.startThread({
      name: `🛒 ${sellerName} → ${persona.name}`.slice(0, 100),
      autoArchiveDuration: 60,
    });

    const session = new GameSession(persona, product, interaction.user.id, this.buyerFactory(persona, product));
    const statusMessage = await thread.send({ embeds: [statusEmbed(session.state, sellerName)], components: statusButtons(session.state) });
    await thread.send(buyerLine(persona, persona.greeting));
    await thread.send(`-# <@${interaction.user.id}>, kirjoita myyntipuheesi tähän ketjuun. Vain sinun viestisi lasketaan.`);

    this.games.set(thread.id, {
      session,
      thread,
      guildId: channel.guildId,
      statusMessage,
      sellerName,
      idleTimer: this.armIdleTimer(thread.id),
    });
    this.threadByUser.set(interaction.user.id, thread.id);
  }

  async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    const game = this.games.get(message.channelId);
    if (!game || message.author.id !== game.session.state.sellerId) return;

    const { session, thread } = game;
    if (session.state.status === "final_offer") {
      await message.reply("Ostajan kärsivällisyys on loppu. Hyväksy tai hylkää viimeinen tarjous napeilla.");
      return;
    }
    if (session.isBusy) {
      await message.react("⏳").catch(() => {});
      return;
    }

    clearTimeout(game.idleTimer);
    game.idleTimer = this.armIdleTimer(thread.id);

    await thread.sendTyping().catch(() => {});
    const typing = setInterval(() => void thread.sendTyping().catch(() => {}), 8000);
    try {
      const { decision, events, state } = await session.handleSellerMessage(message.content);
      clearInterval(typing);
      await thread.send(buyerLine(state.persona, decision.reply, decision.emotion));
      const notes = eventNotes(state, events);
      if (notes.length) await thread.send(notes.join("\n"));
      await this.afterChange(game, events);
    } catch (err) {
      clearInterval(typing);
      if (err instanceof BuyerUnavailableError) {
        console.error("Ostaja ei vastannut:", err.detail);
        await message.reply(`⚠️ ${err.message}\n-# Viestisi ei kuluttanut vuoroa.`);
        return;
      }
      throw err;
    }
  }

  async onButton(interaction: ButtonInteraction): Promise<void> {
    const game = this.games.get(interaction.channelId);
    if (!game) {
      await interaction.reply({ content: "Tämä kauppa on jo päättynyt.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.user.id !== game.session.state.sellerId) {
      await interaction.reply({ content: "Vain myyjä voi käyttää näitä nappeja. Aloita oma kauppa komennolla /kauppa aloita.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (game.session.isBusy) {
      await interaction.reply({ content: "Ostaja miettii vielä, odota hetki.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferUpdate();
    let events: GameEvent[] = [];
    if (interaction.customId === BUTTON.accept) events = game.session.accept();
    else if (interaction.customId === BUTTON.decline) events = game.session.declineFinal();
    else if (interaction.customId === BUTTON.quit) events = game.session.giveUp();
    await this.afterChange(game, events);
  }

  private async afterChange(game: ActiveGame, events: GameEvent[]): Promise<void> {
    const { session, statusMessage, sellerName, thread } = game;
    await statusMessage.edit({ embeds: [statusEmbed(session.state, sellerName)], components: statusButtons(session.state) });

    if (events.some((e) => e.type === "ended")) {
      clearTimeout(game.idleTimer);
      this.games.delete(thread.id);
      this.threadByUser.delete(session.state.sellerId);
      this.saveStats(game);
      await thread.send({
        content: "-# Ketju arkistoidaan minuutin kuluttua. Katso omat tilastosi: `/kauppa stats`",
        embeds: [resultEmbed(session.state, sellerName)],
      });
      console.log(`Kauppa päättyi: ${sellerName} / ${session.state.persona.id} / ${session.state.outcome?.type}`);
      setTimeout(() => void this.archive(thread), ARCHIVE_DELAY_MS);
    }
  }

  private saveStats(game: ActiveGame): void {
    if (!this.stats) return;
    try {
      this.stats.recordRound(toRoundRecord(game.session.state, game.guildId));
    } catch (err) {
      // Tilastojen tallennusvirhe ei saa kaataa peliä.
      console.error("Tilastojen tallennus epäonnistui:", err);
    }
  }

  private async archive(thread: ThreadChannel): Promise<void> {
    try {
      await thread.setArchived(true, "Kauppa päättyi");
    } catch (err) {
      console.warn(`Ketjun ${thread.id} arkistointi epäonnistui (puuttuuko Manage Threads -oikeus?):`, err instanceof Error ? err.message : err);
    }
  }

  private armIdleTimer(threadId: string): NodeJS.Timeout {
    return setTimeout(() => {
      const game = this.games.get(threadId);
      if (!game || game.session.isBusy) return;
      const events = game.session.timeOut();
      void this.afterChange(game, events).catch((err) => console.error("Aikakatkaisun käsittely epäonnistui:", err));
    }, IDLE_TIMEOUT_MS);
  }
}
