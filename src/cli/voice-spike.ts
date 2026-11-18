/**
 * Äänikokeilu (vaihe 2, spike): varmistaa, että botti pystyy liittymään äänikanavalle,
 * soittamaan ääntä ja vastaanottamaan pelaajan puhetta.
 *
 *   npm run voice:spike
 *
 * 1. Odottaa, että joku liittyy äänikanavalle palvelimella DISCORD_GUILD_ID (max 90 s).
 * 2. Liittyy samalle kanavalle ja soittaa merkkiäänen.
 * 3. Nauhoittaa ensimmäisen puhepätkän (päättyy 0,8 s hiljaisuuteen, max 15 s).
 * 4. Soittaa nauhoituksen takaisin ja poistuu.
 *
 * Nauhoitus tallennetaan kansioon data/voice-spike/ (gitignoressa). Poista se testin jälkeen.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type AudioPlayer,
} from "@discordjs/voice";
import { Client, Events, GatewayIntentBits, type Guild, type VoiceBasedChannel } from "discord.js";
import prism from "prism-media";
import { loadConfig } from "../config.js";

const OUT_DIR = join("data", "voice-spike");
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${msg}`);

function wavHeader(dataBytes: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(CHANNELS, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  h.writeUInt16LE(CHANNELS * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

async function play(player: AudioPlayer, file: string): Promise<void> {
  player.play(createAudioResource(file));
  await entersState(player, AudioPlayerStatus.Playing, 5_000);
  await entersState(player, AudioPlayerStatus.Idle, 30_000);
}

function findOccupiedVoiceChannel(guild: Guild): VoiceBasedChannel | null {
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channel && state.member && !state.member.user.bot) return state.channel;
  }
  return null;
}

async function waitForVoiceChannel(client: Client, guild: Guild, timeoutMs: number): Promise<VoiceBasedChannel> {
  const found = findOccupiedVoiceChannel(guild);
  if (found) return found;
  log(`Liity äänikanavalle palvelimella "${guild.name}". Odotan enintään ${timeoutMs / 1000} s...`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(Events.VoiceStateUpdate, onUpdate);
      reject(new Error("Kukaan ei liittynyt äänikanavalle ajoissa."));
    }, timeoutMs);
    const onUpdate = () => {
      const ch = findOccupiedVoiceChannel(guild);
      if (ch) {
        clearTimeout(timer);
        client.off(Events.VoiceStateUpdate, onUpdate);
        resolve(ch);
      }
    };
    client.on(Events.VoiceStateUpdate, onUpdate);
  });
}

async function main() {
  const config = loadConfig();
  mkdirSync(OUT_DIR, { recursive: true });

  // Merkkiääni FFmpegillä: kaksi lyhyttä piippausta.
  const beep = join(OUT_DIR, "beep.wav");
  const ff = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=660:duration=0.25", "-af", "apad=pad_dur=0.15,aloop=loop=1:size=19200", beep]);
  if (ff.status !== 0) throw new Error(`FFmpeg epäonnistui: ${ff.stderr.toString()}`);

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  await client.login(config.DISCORD_TOKEN);
  await new Promise<void>((r) => client.once(Events.ClientReady, () => r()));
  log(`Kirjautunut: ${client.user?.tag}`);

  const guild = config.DISCORD_GUILD_ID ? await client.guilds.fetch(config.DISCORD_GUILD_ID) : client.guilds.cache.first();
  if (!guild) throw new Error("Palvelinta ei löytynyt.");

  const channel = await waitForVoiceChannel(client, guild, 90_000);
  const human = channel.members.find((m) => !m.user.bot);
  if (!human) throw new Error("Kanavalla ei ole ihmistä.");
  log(`Liitytään kanavalle "${channel.name}" (${channel.members.size} jäsentä), kuunneltava: ${human.displayName}`);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  // Vianetsintä: yhteyden tila ja vastaanotto. (Kirjaston debug-tilaa ei käytetä: se tulostaa
  // ääniyhteyden salausavaimen ja istuntotunnisteet lokiin.)
  connection.on("error", (e) => log(`  ⚠️ yhteysvirhe: ${e.message}`));
  connection.on("stateChange", (a, b) => log(`  tila: ${a.status} → ${b.status}`));
  connection.receiver.ssrcMap.on("create", (d) => log(`  ssrc-kartta: käyttäjä ${d.userId} → ssrc ${d.audioSSRC}`));
  connection.receiver.speaking.on("start", (id) => log(`  puhe alkoi: ${id === human.id ? human.displayName : id}`));
  connection.receiver.speaking.on("end", (id) => log(`  puhe päättyi: ${id === human.id ? human.displayName : id}`));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    log("✅ Ääniyhteys valmis (salaus mukaan lukien).");

    const player = createAudioPlayer();
    connection.subscribe(player);
    await play(player, beep);
    const receiver = connection.receiver;

    // Yksi puhepätkä: odotetaan puheen alkua, nauhoitetaan 0,8 s hiljaisuuteen asti (max 15 s).
    const recordUtterance = async (index: number): Promise<string> => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Puhetta ei kuulunut 45 sekunnissa.")), 45_000);
        const onStart = (userId: string) => {
          if (userId !== human.id) return;
          clearTimeout(timer);
          receiver.speaking.off("start", onStart);
          resolve();
        };
        receiver.speaking.on("start", onStart);
      });
      const speechStart = Date.now();
      log("🎙️ Puhe alkoi, nauhoitetaan...");

      const opusStream = receiver.subscribe(human.id, { end: { behavior: EndBehaviorType.AfterSilence, duration: 800 } });
      const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: 960 });
      const chunks: Buffer[] = [];
      const maxTimer = setTimeout(() => opusStream.destroy(), 15_000);
      await new Promise<void>((resolve, reject) => {
        opusStream.pipe(decoder);
        decoder.on("data", (c: Buffer) => chunks.push(c));
        decoder.on("end", resolve);
        decoder.on("close", resolve);
        decoder.on("error", reject);
        opusStream.on("error", reject);
      });
      clearTimeout(maxTimer);

      const pcm = Buffer.concat(chunks);
      const seconds = pcm.length / (SAMPLE_RATE * CHANNELS * 2);
      const rec = join(OUT_DIR, `recording-${String(index).padStart(2, "0")}-${Date.now()}.wav`);
      writeFileSync(rec, Buffer.concat([wavHeader(pcm.length), pcm]));
      log(`✅ Nauhoitettu ${seconds.toFixed(1)} s puhetta (${(Date.now() - speechStart) / 1000} s puheen alusta, sis. 0,8 s hiljaisuuden). Tiedosto: ${rec}`);
      if (seconds < 0.3) throw new Error("Nauhoitus jäi tyhjäksi: ääntä ei saatu vastaanotettua.");
      return rec;
    };

    // --record N: nauhoitetaan N pätkää ilman takaisintoistoa (puheentunnistuksen testiaineistoksi).
    const recordArg = process.argv.indexOf("--record");
    const clips = recordArg >= 0 ? Math.max(1, Number(process.argv[recordArg + 1]) || 5) : 1;

    if (clips === 1) {
      log("✅ Merkkiääni soitettu. Sano jotain nyt (esim. 'Myyn sinulle tämän kasetin kympillä').");
      const rec = await recordUtterance(1);
      await play(player, rec);
      log("✅ Nauhoitus soitettu takaisin. Kuulitko oman äänesi?");
    } else {
      log(`✅ Merkkiääni soitettu. Nauhoitetaan ${clips} pätkää: sano yksi lause kerrallaan ja pidä välissä 1–2 s tauko.`);
      for (let i = 1; i <= clips; i++) {
        log(`--- Pätkä ${i}/${clips}: puhu nyt.`);
        await recordUtterance(i);
        await play(player, beep); // kuittaus: pätkä tallessa
      }
    }
  } finally {
    connection.destroy();
    await client.destroy();
  }
}

main()
  .then(() => {
    log("Kokeilu valmis.");
    process.exit(0);
  })
  .catch((err) => {
    log(`❌ Kokeilu epäonnistui: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
