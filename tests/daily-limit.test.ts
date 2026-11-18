import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dailyLimitReachedMessage } from "../src/bot/games.js";
import { loadConfig } from "../src/config.js";
import { helsinkiDay, StatsRepository } from "../src/db/stats.js";

let repo: StatsRepository;
beforeEach(() => (repo = new StatsRepository(":memory:")));
afterEach(() => repo.close());

describe("päivittäinen pelilaskuri", () => {
  it("laskee aloitetut pelit käyttäjäkohtaisesti", () => {
    expect(repo.gamesStarted("u1", "2026-11-19")).toBe(0);
    expect(repo.addGameStart("u1", "2026-11-19")).toBe(1);
    expect(repo.addGameStart("u1", "2026-11-19")).toBe(2);
    expect(repo.addGameStart("u2", "2026-11-19")).toBe(1);
    expect(repo.gamesStarted("u1", "2026-11-19")).toBe(2);
  });

  it("uusi päivä alkaa nollasta, ja edellisten päivien laskurit poistetaan", () => {
    repo.addGameStart("u1", "2026-11-18");
    repo.addGameStart("u2", "2026-11-18");
    expect(repo.addGameStart("u1", "2026-11-19")).toBe(1);
    expect(repo.gamesStarted("u1", "2026-11-18")).toBe(0);
    expect(repo.gamesStarted("u2", "2026-11-18")).toBe(0);
  });

  it("epäonnistunut aloitus voidaan perua, eikä laskuri mene negatiiviseksi", () => {
    repo.addGameStart("u1", "2026-11-19");
    repo.removeGameStart("u1", "2026-11-19");
    repo.removeGameStart("u1", "2026-11-19");
    expect(repo.gamesStarted("u1", "2026-11-19")).toBe(0);
  });
});

describe("helsinkiDay", () => {
  it("vaihtaa päivää keskiyöllä Suomen aikaa, ei UTC:ssä", () => {
    // 2026-11-18 22:30 UTC = 2026-11-19 00:30 Suomessa (talviaika UTC+2)
    expect(helsinkiDay(new Date("2026-11-18T22:30:00Z"))).toBe("2026-11-19");
    expect(helsinkiDay(new Date("2026-11-18T21:30:00Z"))).toBe("2026-11-18");
  });
});

describe("päivärajan asetukset", () => {
  const base = { DISCORD_TOKEN: "x", DISCORD_CLIENT_ID: "1" };

  it("oletus on 20 peliä, eikä ketään ole vapautettu", () => {
    const cfg = loadConfig(base);
    expect(cfg.DAILY_GAME_LIMIT).toBe(20);
    expect(cfg.LIMIT_EXEMPT_USER_IDS.size).toBe(0);
  });

  it("0 kytkee rajan pois ja vapautetut luetaan pilkuilla erotettuna", () => {
    const cfg = loadConfig({ ...base, DAILY_GAME_LIMIT: "0", LIMIT_EXEMPT_USER_IDS: " 111, 222 ,," });
    expect(cfg.DAILY_GAME_LIMIT).toBe(0);
    expect([...cfg.LIMIT_EXEMPT_USER_IDS]).toEqual(["111", "222"]);
  });

  it("hylkää virheellisen rajan", () => {
    expect(() => loadConfig({ ...base, DAILY_GAME_LIMIT: "-1" })).toThrow(/DAILY_GAME_LIMIT/);
    expect(() => loadConfig({ ...base, DAILY_GAME_LIMIT: "abc" })).toThrow(/DAILY_GAME_LIMIT/);
  });

  it("ilmoitus kertoo rajan ja milloin se nollautuu", () => {
    expect(dailyLimitReachedMessage(20)).toContain("20");
    expect(dailyLimitReachedMessage(20)).toContain("keskiyöllä");
  });
});
