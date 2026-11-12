import type { Persona } from "../content/personas.js";
import type { Product } from "../content/products.js";
import {
  acceptOffer,
  applyDecision,
  createGame,
  declineFinalOffer,
  giveUp,
  recordSellerLine,
  sanitizeSellerText,
  timeOut,
} from "./engine.js";
import type { BuyerDecision, GameEvent, GameState } from "./types.js";

/** Rajapinta ostajalle. Oikea toteutus käyttää Claudea, testeissä käytetään skriptattua ostajaa. */
export interface Buyer {
  respond(state: GameState, sellerText: string): Promise<BuyerDecision>;
}

export type BuyerFactory = (persona: Persona, product: Product) => Buyer;

export class SessionBusyError extends Error {
  constructor() {
    super("Ostaja miettii vielä edellistä vastausta.");
  }
}

export class SessionNotActiveError extends Error {
  constructor() {
    super("Kauppa ei ole enää käynnissä.");
  }
}

export interface TurnResult {
  decision: BuyerDecision;
  events: GameEvent[];
  state: GameState;
}

/** Yksi kauppakierros: pitää tilan, estää päällekkäiset vuorot ja välittää myyjän puheen ostajalle. */
export class GameSession {
  private _state: GameState;
  private busy = false;

  constructor(
    persona: Persona,
    product: Product,
    sellerId: string,
    private readonly buyer: Buyer,
  ) {
    this._state = createGame(persona, product, sellerId);
  }

  get state(): GameState {
    return this._state;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  async handleSellerMessage(rawText: string): Promise<TurnResult> {
    if (this._state.status !== "active") throw new SessionNotActiveError();
    if (this.busy) throw new SessionBusyError();

    const text = sanitizeSellerText(rawText);
    if (!text) throw new Error("Tyhjä viesti.");

    this.busy = true;
    try {
      const withSeller = recordSellerLine(this._state, text);
      // Jos ostaja epäonnistuu (verkkovirhe tms.), tila ei muutu eikä vuoro kulu.
      const decision = await this.buyer.respond(withSeller, text);
      const { state, events } = applyDecision(withSeller, decision);
      this._state = state;
      return { decision, events, state };
    } finally {
      this.busy = false;
    }
  }

  accept(): GameEvent[] {
    const r = acceptOffer(this._state);
    this._state = r.state;
    return r.events;
  }

  declineFinal(): GameEvent[] {
    const r = declineFinalOffer(this._state);
    this._state = r.state;
    return r.events;
  }

  giveUp(): GameEvent[] {
    const r = giveUp(this._state);
    this._state = r.state;
    return r.events;
  }

  timeOut(): GameEvent[] {
    const r = timeOut(this._state);
    this._state = r.state;
    return r.events;
  }
}
