import { describe, expect, it } from "vitest";
import { commandData } from "../src/commands/index.js";
import { loadAiConfig, loadConfig } from "../src/config.js";

describe("komennot", () => {
  it("nimet ovat uniikkeja ja Discordin sääntöjen mukaisia", () => {
    const names = commandData.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_-]{1,32}$/);
  });

  it("serialisoituvat ilman virheitä", () => {
    for (const c of commandData) expect(() => c.toJSON()).not.toThrow();
  });
});

describe("konfiguraatio", () => {
  it("hylkää puuttuvan tokenin selkeällä viestillä", () => {
    expect(() => loadConfig({})).toThrow(/DISCORD_TOKEN/);
  });

  it("hyväksyy minimiasetukset ja käyttää oletuksia", () => {
    const cfg = loadConfig({ DISCORD_TOKEN: "x", DISCORD_CLIENT_ID: "1", DISCORD_GUILD_ID: "" });
    expect(cfg.DISCORD_GUILD_ID).toBeUndefined();
    expect(cfg.STT_PROVIDER).toBe("deepgram");
  });

  it("tekoälyasetuksilla on oletukset eikä niihin tarvita Discord-tunnuksia", () => {
    expect(loadAiConfig({})).toEqual({ ANTHROPIC_MODEL: "claude-opus-5-5", ANTHROPIC_EFFORT: "low" });
    expect(loadAiConfig({ ANTHROPIC_MODEL: "claude-haiku-5-5", ANTHROPIC_EFFORT: "" }).ANTHROPIC_MODEL).toBe("claude-haiku-5-5");
  });
});
