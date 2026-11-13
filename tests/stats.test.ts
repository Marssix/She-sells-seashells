import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rankTitle, statsEmbed } from "../src/bot/ui.js";
import { personas } from "../src/content/personas.js";
import { products } from "../src/content/products.js";
import { StatsRepository, toRoundRecord, type RoundRecord } from "../src/db/stats.js";
import { createGame, giveUp } from "../src/game/engine.js";
import type { GameState } from "../src/game/types.js";

const round = (r: Partial<RoundRecord> = {}): RoundRecord => ({
  userId: "u1",
  guildId: "g1",
  personaId: "pirkko",
  productId: "kasetti",
  outcome: "sold",
  priceEur: 10,
  trueValueEur: 1,
  score: 100,
  weaknessFound: false,
  turnsUsed: 4,
  endedAt: "2026-11-13T10:00:00.000Z",
  ...r,
});

let repo: StatsRepository;
beforeEach(() => (repo = new StatsRepository(":memory:")));
afterEach(() => repo.close());

describe("StatsRepository", () => {
  it("palauttaa tyhjät tilastot uudelle pelaajalle", () => {
    const s = repo.getUserStats("u1", "g1");
    expect(s).toMatchObject({ played: 0, sold: 0, totalRevenueEur: 0, totalScore: 0, bestSale: null, perPersona: [] });
  });

  it("laskee yhteenvedot, parhaan kaupan ja ostajakohtaiset tulokset", () => {
    repo.recordRound(round({ priceEur: 10, score: 100, weaknessFound: true }));
    repo.recordRound(round({ personaId: "jarmo", productId: "faksi", priceEur: 300, trueValueEur: 5, score: 250 }));
    repo.recordRound(round({ outcome: "hung_up", priceEur: 0, score: 0 }));
    repo.recordRound(round({ outcome: "gave_up", personaId: "jarmo", priceEur: 0, score: 0 }));

    const s = repo.getUserStats("u1", "g1");
    expect(s).toMatchObject({ played: 4, sold: 2, totalRevenueEur: 310, totalScore: 350, bestScore: 250, weaknessesFound: 1 });
    expect(s.outcomes).toEqual({ sold: 2, hung_up: 1, gave_up: 1 });
    expect(s.bestSale).toEqual({ productId: "faksi", personaId: "jarmo", priceEur: 300, trueValueEur: 5, score: 250 });
    expect(s.perPersona).toEqual([
      { personaId: "jarmo", played: 2, sold: 1 },
      { personaId: "pirkko", played: 2, sold: 1 },
    ]);
  });

  it("erottaa pelaajat ja palvelimet toisistaan", () => {
    repo.recordRound(round());
    repo.recordRound(round({ userId: "u2" }));
    repo.recordRound(round({ guildId: "g2" }));
    expect(repo.getUserStats("u1", "g1").played).toBe(1);
    expect(repo.getUserStats("u2", "g1").played).toBe(1);
    expect(repo.getUserStats("u1", "g2").played).toBe(1);
  });

  it("unohda poistaa vain pyytäjän tiedot tältä palvelimelta", () => {
    repo.recordRound(round());
    repo.recordRound(round());
    repo.recordRound(round({ userId: "u2" }));
    repo.recordRound(round({ guildId: "g2" }));
    expect(repo.deleteUser("u1", "g1")).toBe(2);
    expect(repo.getUserStats("u1", "g1").played).toBe(0);
    expect(repo.getUserStats("u2", "g1").played).toBe(1);
    expect(repo.getUserStats("u1", "g2").played).toBe(1);
  });
});

describe("toRoundRecord", () => {
  it("muuntaa päättyneen pelin riviksi pisteineen", () => {
    const base = createGame(personas[0]!, { ...products[0]!, trueValueEur: 1, absurdity: 1 }, "u9");
    const sold: GameState = { ...base, turn: 3, turnsLeft: 0, status: "ended", outcome: { type: "sold", priceEur: 9 } };
    const r = toRoundRecord(sold, "g1", new Date("2026-11-13T12:00:00Z"));
    expect(r).toMatchObject({ userId: "u9", guildId: "g1", outcome: "sold", priceEur: 9, score: 100, turnsUsed: 3, endedAt: "2026-11-13T12:00:00.000Z" });

    const quit = toRoundRecord(giveUp(base).state, "g1");
    expect(quit).toMatchObject({ outcome: "gave_up", priceEur: 0, score: 0 });
  });
});

describe("tilastonäkymä", () => {
  it("tittelit nousevat pisteiden mukaan ja kertovat seuraavan", () => {
    expect(rankTitle(0).title).toContain("Kirpparimyyjä");
    expect(rankTitle(0).next?.minScore).toBe(250);
    expect(rankTitle(1200).title).toContain("Puhelinmyyjä");
    expect(rankTitle(99999).next).toBeNull();
  });

  it("embed rakentuu tyhjille ja täysille tilastoille", () => {
    expect(statsEmbed(repo.getUserStats("u1", "g1"), "Testaaja").toJSON().description).toContain("/kauppa aloita");
    repo.recordRound(round());
    const json = statsEmbed(repo.getUserStats("u1", "g1"), "Testaaja").toJSON();
    expect(json.fields?.map((f) => f.name)).toContain("🥇 Paras kauppa");
    for (const f of json.fields ?? []) expect(f.value.length).toBeGreaterThan(0);
  });
});
