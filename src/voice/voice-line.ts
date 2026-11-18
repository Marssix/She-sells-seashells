import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import prism from "prism-media";
import type { PersonaVoice } from "../content/personas.js";
import type { Speaker } from "./speaker.js";
import { downsampleTo16kMono } from "./transcriber.js";

/** Hiljaisuus, joka päättää myyjän puheenvuoron. 0,8 s katkaisi testeissä lauseen änkytyksen kohdalla. */
export const SILENCE_MS = 1200;
/** Lyhyemmät äänet (yskäisy, "öö", näppäimistö) ohitetaan. */
export const MIN_UTTERANCE_S = 0.4;
/** Pisin yksittäinen puheenvuoro. */
export const MAX_UTTERANCE_MS = 30_000;

const BYTES_PER_SECOND_48K_STEREO = 48_000 * 2 * 2;

export type UtteranceHandler = (pcm16k: Buffer, seconds: number) => void;

/**
 * Yhden pelin ääniyhteys: botti liittyy äänikanavalle, lukee ostajan repliikit ääneen jonossa
 * ja (2b) kuuntelee halutessa yhtä käyttäjää, eli myyjää. Ääntä käsitellään vain muistissa.
 */
export class VoiceLine {
  private readonly player: AudioPlayer;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private capturing = false;
  private speakingListener: ((userId: string) => void) | null = null;

  private constructor(
    private readonly connection: VoiceConnection,
    private readonly speaker: Speaker,
    private readonly voice: PersonaVoice,
  ) {
    this.player = createAudioPlayer();
    connection.subscribe(this.player);
    this.player.on("error", (err) => console.error("Äänen toistovirhe:", err.message));
  }

  /** listen=false: botti liittyy kuuroutettuna eikä vastaanota kenenkään ääntä. */
  static async open(channel: VoiceBasedChannel, speaker: Speaker, voice: PersonaVoice, listen = false): Promise<VoiceLine> {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: !listen,
      selfMute: false,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      connection.destroy();
      throw err;
    }
    return new VoiceLine(connection, speaker, voice);
  }

  get channelId(): string | null {
    return this.connection.joinConfig.channelId;
  }

  /** Puhuuko ostaja juuri nyt (tai onko puhetta jonossa). */
  get isSpeaking(): boolean {
    return this.player.state.status !== AudioPlayerStatus.Idle;
  }

  /** Lisää repliikin toistojonoon. Palauttaa, kun repliikki on soitettu (tai epäonnistunut). Ei heitä virhettä. */
  say(text: string): Promise<void> {
    this.queue = this.queue.then(() => this.speakNow(text));
    return this.queue;
  }

  /**
   * Kuuntelee vain annettua käyttäjää. Jokainen puheenvuoro (päättyy SILENCE_MS hiljaisuuteen)
   * välitetään käsittelijälle 16 kHz mono -muodossa. Puhe, joka alkaa ostajan puhuessa, ohitetaan:
   * se on usein kaikua kaiuttimista tai päälle puhumista (keskeytys tulee vaiheessa 2c).
   */
  listen(userId: string, onUtterance: UtteranceHandler): void {
    const receiver = this.connection.receiver;
    this.speakingListener = (speakerId: string) => {
      if (speakerId !== userId || this.capturing || this.closed) return;
      this.capturing = true;
      const startedWhileSpeaking = this.isSpeaking;

      const opus = receiver.subscribe(speakerId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS } });
      const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
      const chunks: Buffer[] = [];
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(maxTimer);
        this.capturing = false;
        const pcm = Buffer.concat(chunks);
        const seconds = pcm.length / BYTES_PER_SECOND_48K_STEREO;
        if (this.closed || startedWhileSpeaking || seconds < MIN_UTTERANCE_S) return;
        onUtterance(downsampleTo16kMono(pcm), seconds);
      };
      const maxTimer = setTimeout(() => {
        opus.destroy();
        decoder.end();
      }, MAX_UTTERANCE_MS);

      opus.pipe(decoder);
      decoder.on("data", (c: Buffer) => chunks.push(c));
      decoder.on("end", finish);
      decoder.on("close", finish);
      decoder.on("error", (err: Error) => {
        console.warn("Äänen purkuvirhe:", err.message);
        finish();
      });
      opus.on("error", (err: Error) => {
        console.warn("Äänen vastaanottovirhe:", err.message);
        finish();
      });
    };
    receiver.speaking.on("start", this.speakingListener);
  }

  /** Odottaa jonon tyhjenemisen ja poistuu kanavalta. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.speakingListener) this.connection.receiver.speaking.off("start", this.speakingListener);
    await this.queue;
    this.player.stop(true);
    this.connection.destroy();
  }

  private async speakNow(text: string): Promise<void> {
    if (this.closed || !text.trim()) return;
    const started = Date.now();
    try {
      const audio = await this.speaker.synthesize(text, this.voice);
      this.player.play(createAudioResource(audio, { inputType: StreamType.OggOpus }));
      await entersState(this.player, AudioPlayerStatus.Playing, 10_000);
      console.log(`🔊 Ostaja puhuu (${Date.now() - started} ms pyynnöstä ääneen)`);
      await entersState(this.player, AudioPlayerStatus.Idle, 60_000);
    } catch (err) {
      console.error("Repliikin puhuminen epäonnistui:", err instanceof Error ? err.message : err);
    }
  }
}
