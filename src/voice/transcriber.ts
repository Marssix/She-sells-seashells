import type { Persona } from "../content/personas.js";
import type { Product } from "../content/products.js";

/** Puheentunnistus: PCM s16le, 16 kHz, mono -> teksti. */
export interface Transcriber {
  transcribe(pcm16k: Buffer, prompt: string): Promise<string>;
}

export class TranscriberError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Muuntaa Discordin äänen (48 kHz, stereo, s16le) Whisperin muotoon (16 kHz, mono, s16le).
 * Kanavat keskiarvotetaan ja kolme peräkkäistä näytettä yhdeksi (yksinkertainen alipäästö + harvennus).
 */
export function downsampleTo16kMono(pcm48kStereo: Buffer): Buffer {
  const frames = Math.floor(pcm48kStereo.length / 4); // 2 kanavaa × 2 tavua
  const outSamples = Math.floor(frames / 3);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      const offset = (i * 3 + k) * 4;
      sum += pcm48kStereo.readInt16LE(offset) + pcm48kStereo.readInt16LE(offset + 2);
    }
    out.writeInt16LE(Math.round(sum / 6), i * 2);
  }
  return out;
}

/**
 * Whisperin tunnetut "hallusinaatiot" hiljaisuudesta tai kohinasta (videoiden tekstitysdatasta peräisin).
 * Tällaiset tunnistukset ohitetaan, jotta yskäisy ei päädy myyntipuheeksi.
 */
const NOISE = [
  /^kiitos( katsomisesta| kuuntelemisesta)?[.!]*$/i,
  /^tekstitys\b/i,
  /^suomennos\b/i,
  /^(thank you|thanks)( for watching)?[.!]*$/i,
  /^[\s.,!?…-]*$/,
];

/** Siistii tunnistuksen. Palauttaa tyhjän merkkijonon, jos tulos on todennäköisesti kohinaa. */
export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2 || NOISE.some((re) => re.test(t))) return "";
  return t;
}

/**
 * Sanastovihje Whisperille: vain tämän pelin ostaja ja tuote. Koko tuotelistan vihje
 * sai testeissä Whisperin "kuulemaan" vääriä sanoja (purkki -> Pirkki).
 */
export function sttPrompt(persona: Persona, product: Product): string {
  return `Kaupankäyntipeli. Ostaja ${persona.name}. Tuote: ${product.name}. Hinnat euroina.`;
}

/** Paikallinen Whisper puhepalvelussa (speech/server.py, POST /stt). Ääni ei lähde koneelta. */
export class LocalTranscriber implements Transcriber {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {}

  /** "ready" | "loading" | "unavailable" | null (palvelu ei vastaa). */
  async status(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { stt?: string };
      return body.stt ?? "unavailable";
    } catch {
      return null;
    }
  }

  async transcribe(pcm16k: Buffer, prompt: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/stt`, {
        method: "POST",
        headers: { "Content-Type": "audio/L16; rate=16000", "X-Prompt": encodeURIComponent(prompt) },
        body: new Uint8Array(pcm16k),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new TranscriberError(`Puheentunnistus ei vastannut: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new TranscriberError(`Puheentunnistuksen virhe ${res.status}`, res.status);
    const body = (await res.json()) as { text?: string };
    return body.text ?? "";
  }
}
