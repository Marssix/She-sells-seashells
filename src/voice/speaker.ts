import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { AzureVoice, PersonaVoice } from "../content/personas.js";
import { forPiper } from "./pronunciation.js";

/**
 * Puhesynteesi. Palauttaa Ogg/Opus-äänivirran (48 kHz), jonka Discord voi toistaa ilman uudelleenkoodausta.
 * Rajapinnan takana voi olla Azure, paikallinen malli tai testeissä valeääni.
 */
export interface Speaker {
  synthesize(text: string, voice: PersonaVoice): Promise<Readable>;
}

export class SpeakerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Poistaa tekstistä asiat, joita ei kuulu lukea ääneen: emojit, Markdown-merkit ja ylimääräiset välit. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_~`#>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Rakentaa Azuren SSML-pyynnön. Teksti escapataan, joten ostajan repliikki ei voi rikkoa XML:ää. */
export function buildSsml(text: string, voice: AzureVoice): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fi-FI">` +
    `<voice name="${escapeXml(voice.name)}">` +
    `<prosody pitch="${escapeXml(voice.pitch)}" rate="${escapeXml(voice.rate)}">${escapeXml(cleanForSpeech(text))}</prosody>` +
    `</voice></speak>`
  );
}

/**
 * Azure Speech -puhesynteesi REST-rajapinnan kautta (ei SDK-riippuvuutta).
 * Azureen lähtee vain ostajan repliikin teksti, ei pelaajien ääntä.
 */
export class AzureSpeaker implements Speaker {
  private readonly endpoint: string;

  constructor(
    private readonly key: string,
    region: string,
    private readonly timeoutMs = 10_000,
  ) {
    this.endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  async synthesize(text: string, voice: PersonaVoice): Promise<Readable> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.key,
          "Content-Type": "application/ssml+xml",
          // Ogg/Opus 48 kHz: sama muoto kuin Discordin äänessä, joten toisto ei tarvitse FFmpegiä.
          "X-Microsoft-OutputFormat": "ogg-48khz-16bit-mono-opus",
          "User-Agent": "she-sells-seashells-bot",
        },
        body: buildSsml(text, voice.azure),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new SpeakerError(`Azure TTS ei vastannut: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok || !res.body) {
      const hint = res.status === 401 ? " (tarkista AZURE_SPEECH_KEY ja AZURE_SPEECH_REGION)" : "";
      throw new SpeakerError(`Azure TTS -virhe ${res.status}${hint}`, res.status);
    }
    return Readable.fromWeb(res.body as unknown as NodeReadableStream);
  }
}

/**
 * Paikallinen Piper-puhesynteesi (speech/server.py, oletuksena http://127.0.0.1:5005).
 * Teksti ei lähde koneelta. Palvelu palauttaa valmiiksi Ogg/Opus-ääntä.
 */
export class PiperSpeaker implements Speaker {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  /** Tarkistaa, että puhepalvelu vastaa. Palauttaa äänen nimen tai null. */
  async health(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { voice?: string };
      return body.voice ?? "tuntematon";
    } catch {
      return null;
    }
  }

  async synthesize(text: string, voice: PersonaVoice): Promise<Readable> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          text: forPiper(cleanForSpeech(text)),
          length_scale: voice.piper.lengthScale,
          pitch: voice.piper.pitch,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new SpeakerError(
        `Paikallinen puhepalvelu ei vastannut (${this.baseUrl}). Onko se käynnissä? ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok || !res.body) throw new SpeakerError(`Puhepalvelun virhe ${res.status}`, res.status);
    return Readable.fromWeb(res.body as unknown as NodeReadableStream);
  }
}
