import { describe, expect, it } from "vitest";
import { BuyerDecisionSchema } from "../src/ai/buyer.js";
import { buildSystemPrompt, buildTurnMessage } from "../src/ai/prompts.js";
import { personas } from "../src/content/personas.js";
import { products } from "../src/content/products.js";
import { GameSession, SessionBusyError, SessionNotActiveError, type Buyer } from "../src/game/session.js";
import type { BuyerDecision, GameState } from "../src/game/types.js";

const persona = personas[0]!;
const product = products[0]!;

const base: BuyerDecision = {
  reply: "Jaa-a.",
  emotion: "neutral",
  interest_delta: 5,
  suspicion_delta: 0,
  weakness_triggered: false,
  action: "continue",
  price_eur: null,
};

/** Skriptattu ostaja: palauttaa annetut päätökset järjestyksessä ja tallentaa mitä se näki. */
class ScriptedBuyer implements Buyer {
  seen: { state: GameState; text: string }[] = [];
  constructor(private readonly script: (BuyerDecision | Error)[]) {}
  async respond(state: GameState, text: string) {
    this.seen.push({ state, text });
    const next = this.script.shift() ?? base;
    if (next instanceof Error) throw next;
    return next;
  }
}

describe("GameSession", () => {
  it("välittää siistityn myyjän puheen ostajalle ja päivittää tilan", async () => {
    const buyer = new ScriptedBuyer([{ ...base, interest_delta: 10 }]);
    const s = new GameSession(persona, product, "u1", buyer);
    const r = await s.handleSellerMessage("  Hei <b>Pirkko</b>!  ");
    expect(buyer.seen[0]!.text).toBe("Hei ‹b›Pirkko‹/b›!");
    expect(r.state.interest).toBe(persona.startInterest + 10);
    expect(s.state.transcript.map((l) => l.speaker)).toEqual(["buyer", "seller", "buyer"]);
  });

  it("ostajan virhe ei kuluta vuoroa eikä muuta tilaa", async () => {
    const s = new GameSession(persona, product, "u1", new ScriptedBuyer([new Error("verkko")]));
    const before = s.state;
    await expect(s.handleSellerMessage("Moi")).rejects.toThrow("verkko");
    expect(s.state).toBe(before);
    expect(s.isBusy).toBe(false);
  });

  it("estää päällekkäiset vuorot", async () => {
    let release!: () => void;
    const slow: Buyer = { respond: () => new Promise((res) => (release = () => res(base))) };
    const s = new GameSession(persona, product, "u1", slow);
    const first = s.handleSellerMessage("Yksi");
    await expect(s.handleSellerMessage("Kaksi")).rejects.toBeInstanceOf(SessionBusyError);
    release();
    await first;
  });

  it("koko kauppa: tarjous → hyväksyntä → peli päättyy", async () => {
    const buyer = new ScriptedBuyer([
      { ...base, interest_delta: 20, weakness_triggered: true },
      { ...base, action: "offer", price_eur: 15 },
    ]);
    const s = new GameSession(persona, product, "u1", buyer);
    await s.handleSellerMessage("Tämä olisi ihana lahja Eetulle ja Iidalle!");
    const r = await s.handleSellerMessage("Mitä tarjoatte?");
    expect(r.events).toContainEqual({ type: "offer", priceEur: 15 });
    const events = s.accept();
    expect(events).toContainEqual({ type: "ended", outcome: { type: "sold", priceEur: 15 } });
    await expect(s.handleSellerMessage("Kiitos!")).rejects.toBeInstanceOf(SessionNotActiveError);
  });
});

describe("promptit", () => {
  it("järjestelmäprompti on vakio kierroksen ajan (välimuisti) ja sisältää hahmon", () => {
    const a = buildSystemPrompt(persona, product);
    expect(a).toBe(buildSystemPrompt(persona, product));
    expect(a).toContain(persona.weakness);
    expect(a).toContain(product.description);
  });

  it("vuoroviesti sisältää tilan ja kääreen, ja viimeisellä vuorolla pyytää päätöstä", () => {
    const s = new GameSession(persona, product, "u1", new ScriptedBuyer([])).state;
    const msg = buildTurnMessage(s, "Ostakaa!");
    expect(msg).toContain("<myyjan_puhe>Ostakaa!</myyjan_puhe>");
    expect(msg).toContain(`Kiinnostus: ${s.interest}/100`);
    expect(msg).not.toContain("viimeinen vuorosi");
    expect(buildTurnMessage({ ...s, turnsLeft: 1 }, "x")).toContain("viimeinen vuorosi");
  });

  it("skeema hyväksyy kelvollisen päätöksen ja hylkää tuntemattoman toiminnon", () => {
    expect(BuyerDecisionSchema.safeParse(base).success).toBe(true);
    expect(BuyerDecisionSchema.safeParse({ ...base, action: "buy_everything" }).success).toBe(false);
  });
});

describe("sisältö", () => {
  it("persoonilla ja tuotteilla on uniikit id:t ja järkevät arvot", () => {
    expect(new Set(personas.map((p) => p.id)).size).toBe(personas.length);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of personas) {
      expect(p.patienceTurns).toBeGreaterThan(0);
      expect(p.greeting.length).toBeGreaterThan(0);
    }
    for (const p of products) expect(p.trueValueEur).toBeGreaterThanOrEqual(0);
  });
});
