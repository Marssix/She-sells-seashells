/**
 * Pelimoottori: puhdasta logiikkaa ilman I/O:ta.
 * Tekoäly vain *ehdottaa* (BuyerDecision); moottori päättää mitä oikeasti tapahtuu.
 */
import type { Persona } from "../content/personas.js";
import type { Product } from "../content/products.js";
import type { BuyerDecision, GameEvent, GameState, Outcome } from "./types.js";

export const RULES = {
  /** Mittarin suurin muutos yhdellä vuorolla. */
  maxDelta: 20,
  /** Kiinnostusbonus, kun heikkous löytyy ensimmäisen kerran. */
  weaknessInterestBonus: 15,
  /** Ostaja voi tehdä tarjouksen tai hyväksyä hinnan vasta tästä kiinnostuksesta alkaen. */
  minInterestToBuy: 50,
  /** Ostaja ei osta, jos epäluulo on tätä suurempi. */
  maxSuspicionToBuy: 80,
  /** Ostaja saa lähteä vain, jos epäluulo on vähintään tämä... */
  minSuspicionToLeave: 70,
  /** ...tai kiinnostus enintään tämä. */
  maxInterestToLeave: 10,
  /** Epäluulo 100 = ostaja sulkee puhelun. */
  suspicionLimit: 100,
  /** Myyjän viestin maksimipituus. */
  maxSellerChars: 500,
} as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const toInt = (v: number) => (Number.isFinite(v) ? Math.round(v) : 0);

export function createGame(persona: Persona, product: Product, sellerId: string): GameState {
  return {
    persona,
    product,
    sellerId,
    interest: persona.startInterest,
    suspicion: persona.startSuspicion,
    turnsLeft: persona.patienceTurns,
    turn: 0,
    weaknessFound: false,
    currentOffer: null,
    status: "active",
    outcome: null,
    transcript: [{ speaker: "buyer", text: persona.greeting }],
  };
}

/** Pyöristää hinnan järkevästi: yli 10 € tasaeuroihin, muuten 10 sentin tarkkuuteen. */
export function roundPrice(eur: number): number {
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  return eur >= 10 ? Math.round(eur) : Math.round(eur * 10) / 10;
}

/**
 * Suurin hinta, jonka ostaja on *tällä hetkellä* valmis maksamaan.
 * Kasvaa kiinnostuksen myötä ja pienenee epäluulon myötä. Katto on hahmon budjetti.
 */
export function maxPrice(state: Pick<GameState, "persona" | "interest" | "suspicion">): number {
  const interestFactor = clamp((state.interest - 30) / 70, 0, 1);
  const trustFactor = 1 - clamp(state.suspicion, 0, 100) / 200;
  return roundPrice(state.persona.budgetEur * interestFactor * trustFactor);
}

/** Siistii myyjän viestin: poistaa ohjausmerkit, estää tagien rikkomisen ja rajaa pituuden. */
export function sanitizeSellerText(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex -- tarkoituksella: poistetaan ohjausmerkit
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .trim()
    .slice(0, RULES.maxSellerChars);
}

function end(state: GameState, outcome: Outcome, events: GameEvent[]): GameState {
  events.push({ type: "ended", outcome });
  return { ...state, status: "ended", outcome, currentOffer: outcome.type === "sold" ? null : state.currentOffer };
}

/** Kirjaa myyjän repliikin. */
export function recordSellerLine(state: GameState, text: string): GameState {
  return { ...state, transcript: [...state.transcript, { speaker: "seller", text }] };
}

/** Soveltaa ostajan päätöksen tilaan sääntöjen mukaisesti. */
export function applyDecision(prev: GameState, decision: BuyerDecision): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (prev.status !== "active") return { state: prev, events };

  const state: GameState = {
    ...prev,
    turn: prev.turn + 1,
    turnsLeft: prev.turnsLeft - 1,
    transcript: [...prev.transcript, { speaker: "buyer", text: decision.reply }],
  };

  // 1. Mittarit (rajattuina)
  let interest = state.interest + clamp(toInt(decision.interest_delta), -RULES.maxDelta, RULES.maxDelta);
  const suspicion = state.suspicion + clamp(toInt(decision.suspicion_delta), -RULES.maxDelta, RULES.maxDelta);

  if (decision.weakness_triggered && !state.weaknessFound) {
    state.weaknessFound = true;
    interest += RULES.weaknessInterestBonus;
    events.push({ type: "weakness_found" });
  }
  state.interest = clamp(interest, 0, 100);
  state.suspicion = clamp(suspicion, 0, 100);

  // 2. Epäluulo täynnä -> puhelu päättyy
  if (state.suspicion >= RULES.suspicionLimit) {
    return { state: end(state, { type: "hung_up" }, events), events };
  }

  // 3. Toiminnot
  const canBuy = state.interest >= RULES.minInterestToBuy && state.suspicion <= RULES.maxSuspicionToBuy;
  const cap = maxPrice(state);

  switch (decision.action) {
    case "accept":
    case "offer": {
      const requested = roundPrice(decision.price_eur ?? 0);
      if (!canBuy) {
        events.push({ type: "action_blocked", action: decision.action, reason: "kiinnostus liian matala tai epäluulo liian korkea" });
        break;
      }
      if (requested <= 0 || cap <= 0) {
        events.push({ type: "action_blocked", action: decision.action, reason: "ei kelvollista hintaa" });
        break;
      }
      const price = Math.min(requested, cap);
      if (price < requested) events.push({ type: "offer_capped", requestedEur: requested, priceEur: price });

      if (decision.action === "accept" && price === requested) {
        return { state: end(state, { type: "sold", priceEur: price }, events), events };
      }
      state.currentOffer = price;
      events.push({ type: "offer", priceEur: price });
      break;
    }
    case "leave": {
      if (state.suspicion >= RULES.minSuspicionToLeave || state.interest <= RULES.maxInterestToLeave) {
        return { state: end(state, { type: "walked_away" }, events), events };
      }
      events.push({ type: "action_blocked", action: "leave", reason: "ostaja on vielä liian kiinnostunut lähteäkseen" });
      break;
    }
    case "continue":
      break;
  }

  // 4. Kärsivällisyys loppui
  if (state.turnsLeft <= 0) {
    if (state.currentOffer !== null) {
      state.status = "final_offer";
      events.push({ type: "final_offer", priceEur: state.currentOffer });
    } else {
      return { state: end(state, { type: "timeout" }, events), events };
    }
  }

  return { state, events };
}

/** Myyjä hyväksyy ostajan voimassa olevan tarjouksen. */
export function acceptOffer(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.status === "ended" || state.currentOffer === null) return { state, events };
  return { state: end(state, { type: "sold", priceEur: state.currentOffer }, events), events };
}

/** Myyjä hylkää viimeisen tarjouksen kärsivällisyyden loputtua. */
export function declineFinalOffer(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.status !== "final_offer") return { state, events };
  return { state: end(state, { type: "timeout" }, events), events };
}

export function giveUp(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.status === "ended") return { state, events };
  return { state: end(state, { type: "gave_up" }, events), events };
}

/** Ostaja kyllästyi odottamaan (ei viestejä). */
export function timeOut(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.status === "ended") return { state, events };
  return { state: end(state, { type: "timeout" }, events), events };
}

export interface ScoreBreakdown {
  priceEur: number;
  ratio: number;
  base: number;
  absurdityMultiplier: number;
  weaknessMultiplier: number;
  speedBonus: number;
  total: number;
}

const ABSURDITY_MULTIPLIER = { 1: 1, 2: 1.25, 3: 1.5 } as const;

/**
 * Pisteet = 100 × log10(1 + hinta / todellinen arvo) × absurdiuskerroin × heikkousbonus + nopeusbonus.
 * Logaritmi pitää pisteet järkevinä myös, kun 0 €:n tuote myydään 500 €:lla.
 */
export function computeScore(state: GameState): ScoreBreakdown {
  const sold = state.outcome?.type === "sold" ? state.outcome.priceEur : 0;
  const ratio = sold / Math.max(state.product.trueValueEur, 0.1);
  const base = Math.round(100 * Math.log10(1 + ratio));
  const absurdityMultiplier = ABSURDITY_MULTIPLIER[state.product.absurdity];
  const weaknessMultiplier = state.weaknessFound ? 1.5 : 1;
  const speedBonus = sold > 0 ? Math.max(0, state.turnsLeft) * 5 : 0;
  const total = sold > 0 ? Math.round(base * absurdityMultiplier * weaknessMultiplier + speedBonus) : 0;
  return { priceEur: sold, ratio, base, absurdityMultiplier, weaknessMultiplier, speedBonus, total };
}
