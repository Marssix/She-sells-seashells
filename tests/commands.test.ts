import { describe, expect, it } from "vitest";
import { commands } from "../src/commands/index.js";
import { loadConfig } from "../src/config.js";

describe("komennot", () => {
  it("nimet ovat uniikkeja ja Discordin sääntöjen mukaisia", () => {
    const names = commands.map((c) => c.data.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_-]{1,32}$/);
  });

  it("serialisoituvat ilman virheitä", () => {
    for (const c of commands) expect(() => c.data.toJSON()).not.toThrow();
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
});
