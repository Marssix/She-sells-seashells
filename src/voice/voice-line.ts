import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { PersonaVoice } from "../content/personas.js";
import type { Speaker } from "./speaker.js";

/**
 * Yhden pelin ääniyhteys: botti liittyy äänikanavalle ja lukee ostajan repliikit ääneen jonossa,
 * jotta repliikit eivät mene päällekkäin. Vaiheessa 2a botti on kuuroutettu (ei vastaanota ääntä).
 */
export class VoiceLine {
  private readonly player: AudioPlayer;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(
    private readonly connection: VoiceConnection,
    private readonly speaker: Speaker,
    private readonly voice: PersonaVoice,
  ) {
    this.player = createAudioPlayer();
    connection.subscribe(this.player);
    this.player.on("error", (err) => console.error("Äänen toistovirhe:", err.message));
  }

  static async open(channel: VoiceBasedChannel, speaker: Speaker, voice: PersonaVoice): Promise<VoiceLine> {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
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

  /** Lisää repliikin toistojonoon. Palauttaa, kun repliikki on soitettu (tai epäonnistunut). Ei heitä virhettä. */
  say(text: string): Promise<void> {
    this.queue = this.queue.then(() => this.speakNow(text));
    return this.queue;
  }

  /** Odottaa jonon tyhjenemisen ja poistuu kanavalta. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
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
