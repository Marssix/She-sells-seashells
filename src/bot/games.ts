import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { BuyerUnavailableError } from "../ai/buyer.js";
import { getPersona, personas } from "../content/personas.js";
import { products } from "../content/products.js";
import { toRoundRecord, type StatsRepository } from "../db/stats.js";
import { GameSession, SessionBusyError, type BuyerFactory } from "../game/session.js";
import type { GameEvent } from "../game/types.js";
import type { Speaker } from "../voice/speaker.js";
import { cleanTranscript, sttPrompt, type Transcriber } from "../voice/transcriber.js";
import { VoiceLine } from "../voice/voice-line.js";
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
  /** Äänitilassa: ostajan ääniyhteys. */
  voice: VoiceLine | null;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** Pelien ketjujen nimen alku. Tästä tunnistetaan botin peliketjut myös uudelleenkäynnistyksen jälkeen. */
export const GAME_THREAD_PREFIX = "🛒 ";

export const NO_ACTIVE_GAME_MESSAGE =
  "Tässä ketjussa ei ole enää käynnissä olevaa kauppaa: se on päättynyt tai katkesi botin uudelleenkäynnistyksen takia. Aloita uusi komennolla `/kauppa aloita`.";

/** Onko kanava botin luoma peliketju, jolle ei ole muistissa käynnissä olevaa peliä. */
export function isGameThread(channel: { isThread(): boolean; ownerId?: string | null; name?: string | null }, botUserId: string): boolean {
  return channel.isThread() && channel.ownerId === botUserId && (channel.name ?? "").startsWith(GAME_THREAD_PREFIX);
}

/** Pitää kirjaa käynnissä olevista peleistä (ketju = yksi peli). */
export class GameManager {
  private readonly games = new Map<string, ActiveGame>();
  private readonly threadByUser = new Map<string, string>();
  /** Ketjut, joihin on jo kerrottu, ettei peliä ole käynnissä (ei toisteta joka viestiin). */
  private readonly notifiedThreads = new Set<string>();

  /** Palvelimet, joilla on käynnissä äänipeli. Botti voi olla vain yhdellä äänikanavalla per palvelin. */
  private readonly voiceGuilds = new Set<string>();

  constructor(
    private readonly buyerFactory: BuyerFactory,
    private readonly stats: StatsRepository | null = null,
    private readonly speaker: Speaker | null = null,
    /** Vaihe 2b: jos asetettu, botti kuuntelee äänipelissä myyjän puhetta. */
    private readonly transcriber: Transcriber | null = null,
  ) {}

  async start(interaction: ChatInputCommandInteraction, personaId: string | null, withVoice = false): Promise<void> {
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

    // Äänitila: tarkistetaan ennen kuin mitään luodaan, jotta virheestä kerrotaan vain pelaajalle.
    const voiceChannel = withVoice ? channel.guild.members.cache.get(interaction.user.id)?.voice.channel ?? null : null;
    if (withVoice) {
      const problem = !this.speaker
        ? "Äänitila ei ole käytössä tällä botilla (puhesynteesiä ei ole määritetty). Pelaa tekstinä: `/kauppa aloita`."
        : !voiceChannel
          ? "Liity ensin äänikanavalle, niin ostaja puhuu sinulle siellä."
          : this.voiceGuilds.has(channel.guildId)
            ? "Tällä palvelimella on jo äänipeli käynnissä (botti voi olla vain yhdellä äänikanavalla kerrallaan). Odota tai pelaa tekstinä: `/kauppa aloita`."
            : !voiceChannel.joinable ||
                !voiceChannel.permissionsFor(channel.guild.members.me!)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])
              ? `Botilla ei ole oikeutta liittyä tai puhua kanavalla ${voiceChannel.name}.`
              : null;
      if (problem) {
        await interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });
        return;
      }
      this.voiceGuilds.add(channel.guildId);
    }

    const persona = (personaId && getPersona(personaId)) || pick(personas);
    const product = pick(products);
    const sellerName = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.username;

    let voice: VoiceLine | null = null;
    try {
      const response = await interaction.reply({
        content: `🛒 **${sellerName}** yrittää myydä tuotteen *${product.name}* ostajalle ${persona.emoji} **${persona.name}**. Seuraa ketjussa!`,
        withResponse: true,
      });
      const announce = response.resource?.message;
      if (!announce) throw new Error("Aloitusviestiä ei saatu.");

      const thread = await announce.startThread({
        name: `${GAME_THREAD_PREFIX}${sellerName} → ${persona.name}`.slice(0, 100),
        autoArchiveDuration: 60,
      });

      const session = new GameSession(persona, product, interaction.user.id, this.buyerFactory(persona, product));
      const statusMessage = await thread.send({ embeds: [statusEmbed(session.state, sellerName)], components: statusButtons(session.state) });

      const listening = !!this.transcriber;
      if (voiceChannel && this.speaker) {
        try {
          voice = await VoiceLine.open(voiceChannel, this.speaker, persona.voice, listening);
          await thread.send(
            listening
              ? `🔊 ${persona.emoji} ${persona.name} puhuu kanavalla <#${voiceChannel.id}>.\n🎙️ Botti kuuntelee kanavalla **vain myyjää** <@${interaction.user.id}>. Puhe muutetaan tekstiksi tähän ketjuun, eikä ääntä tallenneta.`
              : `🔊 ${persona.emoji} ${persona.name} puhuu kanavalla <#${voiceChannel.id}>. Botti ei kuuntele: myyntipuhe kirjoitetaan tähän ketjuun.`,
          );
        } catch (err) {
          console.error("Äänikanavalle liittyminen epäonnistui:", err);
          this.voiceGuilds.delete(channel.guildId);
          await thread.send("⚠️ Äänikanavalle liittyminen epäonnistui, joten peli jatkuu pelkkänä tekstinä.");
        }
      }

      await thread.send(buyerLine(persona, persona.greeting));
      void voice?.say(persona.greeting);
      await thread.send(
        voice && listening
          ? `-# <@${interaction.user.id}>, puhu ostajalle äänikanavalla (tai kirjoita tähän ketjuun). Odota, että ostaja on puhunut loppuun, ennen kuin vastaat.`
          : `-# <@${interaction.user.id}>, kirjoita myyntipuheesi tähän ketjuun. Vain sinun viestisi lasketaan.`,
      );

      if (voice && listening) {
        const threadId = thread.id;
        voice.listen(interaction.user.id, (pcm16k, seconds) => {
          this.onSpeech(threadId, pcm16k, seconds).catch((err) => console.error("Puheen käsittely epäonnistui:", err));
        });
      }

      this.games.set(thread.id, {
        session,
        thread,
        guildId: channel.guildId,
        statusMessage,
        sellerName,
        idleTimer: this.armIdleTimer(thread.id),
        voice,
      });
      this.threadByUser.set(interaction.user.id, thread.id);
    } catch (err) {
      // Aloitus epäonnistui kesken: vapautetaan äänikanava, ettei palvelin jää lukkoon.
      if (withVoice) this.voiceGuilds.delete(channel.guildId);
      await (voice as VoiceLine | null)?.close();
      throw err;
    }
  }

  async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    const game = this.games.get(message.channelId);
    if (!game) {
      await this.notifyNoActiveGame(message);
      return;
    }
    if (message.author.id !== game.session.state.sellerId) return;

    if (game.session.state.status === "final_offer") {
      await message.reply("Ostajan kärsivällisyys on loppu. Hyväksy tai hylkää viimeinen tarjous napeilla.");
      return;
    }
    if (game.session.isBusy) {
      await message.react("⏳").catch(() => {});
      return;
    }
    await this.playSellerTurn(game, message.content, (text) => message.reply(text).then(() => {}));
  }

  /**
   * Vaihe 2b: myyjän puheenvuoro äänikanavalta. Puhe tunnistetaan, näytetään ketjussa
   * ja käsitellään täsmälleen kuten kirjoitettu myyntipuhe.
   */
  private async onSpeech(threadId: string, pcm16k: Buffer, seconds: number): Promise<void> {
    const game = this.games.get(threadId);
    if (!game || !this.transcriber) return;
    const { session, thread } = game;
    // Puhe ostajan miettiessä tai viimeisen tarjouksen aikana ohitetaan (napit ratkaisevat viimeisen tarjouksen).
    if (session.state.status !== "active" || session.isBusy) return;

    const started = Date.now();
    let text: string;
    try {
      text = cleanTranscript(await this.transcriber.transcribe(pcm16k, sttPrompt(session.state.persona, session.state.product)));
    } catch (err) {
      console.error("Puheentunnistus epäonnistui:", err instanceof Error ? err.message : err);
      await thread.send("⚠️ Puhetta ei saatu tunnistettua. Sano uudelleen tai kirjoita tähän ketjuun.");
      return;
    }
    console.log(`🎙️ Myyjä puhui ${seconds.toFixed(1)} s, tunnistettu ${Date.now() - started} ms`);
    if (!text) return; // kohinaa tai hiljaisuutta
    if (!this.games.has(threadId) || session.state.status !== "active" || session.isBusy) return;

    await thread.send(`🎙️ **${game.sellerName}:** ${text}`);
    await this.playSellerTurn(game, text, (msg) => thread.send(msg).then(() => {}));
  }

  /** Yksi myyjän vuoro (kirjoitettu tai puhuttu): ostaja vastaa tekstinä ja äänitilassa ääneen. */
  private async playSellerTurn(game: ActiveGame, text: string, notify: (msg: string) => Promise<void>): Promise<void> {
    const { session, thread } = game;
    clearTimeout(game.idleTimer);
    game.idleTimer = this.armIdleTimer(thread.id);

    await thread.sendTyping().catch(() => {});
    const typing = setInterval(() => void thread.sendTyping().catch(() => {}), 8000);
    try {
      const { decision, events, state } = await session.handleSellerMessage(text);
      clearInterval(typing);
      await thread.send(buyerLine(state.persona, decision.reply, decision.emotion));
      void game.voice?.say(decision.reply);
      const notes = eventNotes(state, events);
      if (notes.length) await thread.send(notes.join("\n"));
      await this.afterChange(game, events);
    } catch (err) {
      clearInterval(typing);
      if (err instanceof BuyerUnavailableError) {
        console.error("Ostaja ei vastannut:", err.detail);
        await notify(`⚠️ ${err.message}\n-# Viestisi ei kuluttanut vuoroa.`);
        return;
      }
      if (err instanceof SessionBusyError) return; // kirjoitettu ja puhuttu vuoro yhtä aikaa: myöhempi ohitetaan
      throw err;
    }
  }

  async onButton(interaction: ButtonInteraction): Promise<void> {
    const game = this.games.get(interaction.channelId);
    if (!game) {
      await interaction.reply({ content: NO_ACTIVE_GAME_MESSAGE, flags: MessageFlags.Ephemeral });
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
      if (game.voice) {
        // Annetaan viimeisen repliikin soida loppuun, sitten poistutaan kanavalta ja vapautetaan palvelin.
        const voice = game.voice;
        void voice.close().finally(() => this.voiceGuilds.delete(game.guildId));
      }
      await thread.send({
        content: "-# Ketju arkistoidaan minuutin kuluttua. Katso omat tilastosi: `/kauppa stats`",
        embeds: [resultEmbed(session.state, sellerName)],
      });
      console.log(`Kauppa päättyi: ${sellerName} / ${session.state.persona.id} / ${session.state.outcome?.type}`);
      setTimeout(() => void this.archive(thread), ARCHIVE_DELAY_MS);
    }
  }

  /**
   * Botin muistissa ei ole peliä tälle ketjulle (peli päättyi tai botti käynnistyi uudelleen).
   * Kerrotaan siitä kerran ketjua kohden, ettei botti vain ohita viestejä hiljaa.
   */
  private async notifyNoActiveGame(message: Message): Promise<void> {
    const botId = message.client.user.id;
    if (!isGameThread(message.channel, botId) || this.notifiedThreads.has(message.channelId)) return;
    this.notifiedThreads.add(message.channelId);
    await message.reply(NO_ACTIVE_GAME_MESSAGE).catch((err) => console.warn("Ilmoitus katkenneeseen ketjuun epäonnistui:", err));
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
