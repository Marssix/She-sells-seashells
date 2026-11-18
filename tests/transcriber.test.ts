import { afterEach, describe, expect, it, vi } from "vitest";
import { personas } from "../src/content/personas.js";
import { products } from "../src/content/products.js";
import { cleanTranscript, downsampleTo16kMono, LocalTranscriber, sttPrompt, TranscriberError } from "../src/voice/transcriber.js";

/** 48 kHz stereo s16le -puskuri annetuista (vasen, oikea) -pareista. */
const stereo = (pairs: [number, number][]) => {
  const buf = Buffer.alloc(pairs.length * 4);
  pairs.forEach(([l, r], i) => {
    buf.writeInt16LE(l, i * 4);
    buf.writeInt16LE(r, i * 4 + 2);
  });
  return buf;
};

describe("downsampleTo16kMono", () => {
  it("kolmannes näytteistä, kanavat keskiarvotettuna", () => {
    const out = downsampleTo16kMono(stereo([[300, 100], [300, 100], [300, 100], [-600, -600], [0, 0], [0, 0]]));
    expect(out.length).toBe(4); // 2 näytettä × 2 tavua
    expect(out.readInt16LE(0)).toBe(200); // (300+100)/2
    expect(out.readInt16LE(2)).toBe(-200); // (-600-600+0+0+0+0)/6
  });

  it("sekunti 48 kHz stereoa on sekunti 16 kHz monoa", () => {
    expect(downsampleTo16kMono(Buffer.alloc(48_000 * 4)).length).toBe(16_000 * 2);
  });

  it("ei kaadu vajaaseen loppuun eikä ylivuoda", () => {
    expect(downsampleTo16kMono(Buffer.alloc(7)).length).toBe(0);
    const loud = downsampleTo16kMono(stereo([[32767, 32767], [32767, 32767], [32767, 32767]]));
    expect(loud.readInt16LE(0)).toBe(32767);
  });
});

describe("cleanTranscript", () => {
  it("siistii välit", () => {
    expect(cleanTranscript("  Myyn  tämän   kympillä. ")).toBe("Myyn tämän kympillä.");
  });

  it("hylkää Whisperin tunnetut hallusinaatiot ja tyhjät", () => {
    for (const noise of ["Kiitos.", "Kiitos katsomisesta!", "Tekstitys: Joku", "Thank you.", "...", "", "a"]) {
      expect(cleanTranscript(noise)).toBe("");
    }
  });

  it("ei hylkää oikeaa puhetta, jossa on sama sana", () => {
    expect(cleanTranscript("Kiitos, mutta paljonko tarjoat?")).toBe("Kiitos, mutta paljonko tarjoat?");
  });
});

describe("sttPrompt", () => {
  it("sisältää vain tämän pelin ostajan ja tuotteen", () => {
    const prompt = sttPrompt(personas[0]!, products[0]!);
    expect(prompt).toContain(personas[0]!.name);
    expect(prompt).toContain(products[0]!.name);
    expect(prompt).not.toContain(personas[1]!.name);
  });
});

describe("LocalTranscriber", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lähettää raa'an PCM:n ja URL-koodatun vihjeen, palauttaa tekstin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: "Myyn tämän 12 eurolla." }));
    vi.stubGlobal("fetch", fetchMock);

    const text = await new LocalTranscriber("http://127.0.0.1:5005").transcribe(Buffer.alloc(3200), "Ostaja Pirkko. Tuote: C-kasetti.");
    expect(text).toBe("Myyn tämän 12 eurolla.");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:5005/stt");
    expect(init.body).toHaveLength(3200);
    expect(decodeURIComponent(init.headers["X-Prompt"])).toBe("Ostaja Pirkko. Tuote: C-kasetti.");
  });

  it("virhe, kun Whisper ei ole vielä valmis (503)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "stt loading" }, { status: 503 })));
    const err = await new LocalTranscriber("http://x").transcribe(Buffer.alloc(2), "p").catch((e) => e);
    expect(err).toBeInstanceOf(TranscriberError);
    expect(err.status).toBe(503);
  });

  it("status kertoo Whisperin tilan tai null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, stt: "ready" })));
    expect(await new LocalTranscriber("http://x").status()).toBe("ready");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await new LocalTranscriber("http://x").status()).toBeNull();
  });
});
