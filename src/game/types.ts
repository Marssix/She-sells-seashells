import type { Persona } from "../content/personas.js";
import type { Product } from "../content/products.js";

export const EMOTIONS = [
  "neutral",
  "interested",
  "excited",
  "suspicious",
  "annoyed",
  "amused",
  "touched",
  "confused",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const BUYER_ACTIONS = ["continue", "offer", "accept", "leave"] as const;
export type BuyerAction = (typeof BUYER_ACTIONS)[number];

/** Tekoälyostajan ehdotus. Pelimoottori validoi ja rajaa kaiken ennen kuin se vaikuttaa tilaan. */
export interface BuyerDecision {
  reply: string;
  emotion: Emotion;
  interest_delta: number;
  suspicion_delta: number;
  weakness_triggered: boolean;
  action: BuyerAction;
  /** offer: ostajan tarjous. accept: myyjän pyytämä hinta, jonka ostaja hyväksyy. */
  price_eur: number | null;
}

export type Outcome =
  | { type: "sold"; priceEur: number }
  | { type: "hung_up" }
  | { type: "walked_away" }
  | { type: "timeout" }
  | { type: "gave_up" };

export type GameStatus = "active" | "final_offer" | "ended";

export interface TranscriptLine {
  speaker: "seller" | "buyer";
  text: string;
}

export interface GameState {
  persona: Persona;
  product: Product;
  sellerId: string;
  interest: number;
  suspicion: number;
  turnsLeft: number;
  turn: number;
  weaknessFound: boolean;
  currentOffer: number | null;
  status: GameStatus;
  outcome: Outcome | null;
  transcript: TranscriptLine[];
}

export type GameEvent =
  | { type: "weakness_found" }
  | { type: "offer"; priceEur: number }
  | { type: "offer_capped"; requestedEur: number; priceEur: number }
  | { type: "action_blocked"; action: BuyerAction; reason: string }
  | { type: "final_offer"; priceEur: number }
  | { type: "ended"; outcome: Outcome };
