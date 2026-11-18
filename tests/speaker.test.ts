import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personas, type AzureVoice, type PersonaVoice } from "../src/content/personas.js";
import { forPiper } from "../src/voice/pronunciation.js";
import { AzureSpeaker, buildSsml, cleanForSpeech, PiperSpeaker, SpeakerError } from "../src/voice/speaker.js";

const azure: AzureVoice = { name: "fi-FI-HarriNeural", pitch: "+5%", rate: "-10%" };
const voice: PersonaVoice = { azure, piper: { lengthScale: 0.9, pitch: 1.1 } };

describe("cleanForSpeech", () => {
  it("poistaa emojit, Markdown-merkit ja ylimääräiset välit", () => {
    expect(cleanForSpeech("**Bro**, tää on 🚀 game   changer! 😂")).toBe("Bro, tää on game changer!");
  });

  it("säilyttää hinnat ja suomen kirjaimet", () => {
    expect(cleanForSpeech("Äläpä nyt, 12,50 € on liikaa.")).toBe("Äläpä nyt, 12,50 € on liikaa.");
  });
});

describe("forPiper (ääntämiskorjaukset)", () => {
  it("korjaa testeissä kuullut slangivirheet", () => {
    expect(forPiper("Bro, otan sen heti, deal!")).toBe("brou, otan sen heti, diil!");
    expect(forPiper("onks tää siisti vai cringe?")).toBe("onks tää siisti vai krinssi?");
  });

  it("lukee hinnat partitiivissa", () => {
    expect(forPiper("annan tästä 15 €")).toBe("annan tästä 15 euroa");
    expect(forPiper("12,50€ riittää")).toBe("12,50 euroa riittää");
  });

  it("ei muuta suomenkielisiä sanoja, joissa on sama kirjainyhdistelmä", () => {
    expect(forPiper("Broileri ja okei ovat ok sanoja")).toBe("Broileri ja okei ovat okei sanoja");
    expect(forPiper("dealeri")).toBe("dealeri");
  });
});

describe("buildSsml", () => {
  it("käyttää ostajan ääntä ja prosodiaa", () => {
    const ssml = buildSsml("Hei!", azure);
    expect(ssml).toContain('xml:lang="fi-FI"');
    expect(ssml).toContain('<voice name="fi-FI-HarriNeural">');
    expect(ssml).toContain('<prosody pitch="+5%" rate="-10%">Hei!</prosody>');
  });

  it("escapaa tekstin, ettei repliikki voi rikkoa XML:ää", () => {
    const ssml = buildSsml('</prosody><voice name="x">A & B "c"', azure);
    // Repliikin sisältä ei saa syntyä uusia XML-elementtejä: < escapataan ja > poistetaan jo puhesiivouksessa.
    expect(ssml.match(/<voice /g)).toHaveLength(1);
    expect(ssml.match(/<\/prosody>/g)).toHaveLength(1);
    expect(ssml).toContain("&lt;/prosody&lt;voice name=&quot;x&quot;A &amp; B &quot;c&quot;");
  });
});

describe("persoonien äänet", () => {
  it("Azure: suomenkieliset äänet ja kelvolliset säädöt", () => {
    const finnish = ["fi-FI-SelmaNeural", "fi-FI-NooraNeural", "fi-FI-HarriNeural"];
    for (const p of personas) {
      expect(finnish).toContain(p.voice.azure.name);
      expect(p.voice.azure.pitch).toMatch(/^[+-]\d{1,2}%$/);
      expect(p.voice.azure.rate).toMatch(/^[+-]\d{1,2}%$/);
    }
  });

  it("Piper: säädöt puhepalvelun sallimissa rajoissa", () => {
    for (const p of personas) {
      expect(p.voice.piper.lengthScale).toBeGreaterThanOrEqual(0.5);
      expect(p.voice.piper.lengthScale).toBeLessThanOrEqual(2);
      expect(p.voice.piper.pitch).toBeGreaterThanOrEqual(0.6);
      expect(p.voice.piper.pitch).toBeLessThanOrEqual(1.6);
    }
  });

  it("jokainen ostaja kuulostaa erilaiselta kummallakin palvelulla", () => {
    const az = personas.map((p) => JSON.stringify(p.voice.azure));
    const pi = personas.map((p) => JSON.stringify(p.voice.piper));
    expect(new Set(az).size).toBe(personas.length);
    expect(new Set(pi).size).toBe(personas.length);
  });
});

describe("AzureSpeaker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lähettää SSML:n oikeaan osoitteeseen ja palauttaa äänivirran", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([79, 103, 103, 83]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const audio = await new AzureSpeaker("avain", "northeurope").synthesize("Hei", voice);
    expect(audio).toBeInstanceOf(Readable);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://northeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("avain");
    expect(init.headers["X-Microsoft-OutputFormat"]).toBe("ogg-48khz-16bit-mono-opus");
    expect(init.body).toContain("Hei");
  });

  it("antaa selkeän virheen väärästä avaimesta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    const err = await new AzureSpeaker("väärä", "northeurope").synthesize("Hei", voice).catch((e) => e);
    expect(err).toBeInstanceOf(SpeakerError);
    expect(err.status).toBe(401);
    expect(err.message).toContain("AZURE_SPEECH_KEY");
  });

  it("muuttaa verkkovirheen SpeakerErroriksi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(new AzureSpeaker("k", "northeurope").synthesize("Hei", voice)).rejects.toBeInstanceOf(SpeakerError);
  });
});

describe("PiperSpeaker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lähettää korjatun tekstin ja ostajan Piper-säädöt paikalliselle palvelulle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([79, 103, 103, 83]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const audio = await new PiperSpeaker("http://127.0.0.1:5005").synthesize("**Bro**, 15 € 🚀", voice);
    expect(audio).toBeInstanceOf(Readable);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:5005/tts");
    expect(JSON.parse(init.body)).toEqual({ text: "brou, 15 euroa", length_scale: 0.9, pitch: 1.1 });
  });

  it("kertoo selvästi, jos puhepalvelu ei ole käynnissä", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const err = await new PiperSpeaker("http://127.0.0.1:5005").synthesize("Hei", voice).catch((e) => e);
    expect(err).toBeInstanceOf(SpeakerError);
    expect(err.message).toContain("Onko se käynnissä");
  });

  it("health palauttaa äänen nimen tai null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, voice: "fi_FI-harri-medium" })));
    expect(await new PiperSpeaker("http://x").health()).toBe("fi_FI-harri-medium");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await new PiperSpeaker("http://x").health()).toBeNull();
  });
});
