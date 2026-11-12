import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AiConfig } from "../config.js";
import type { Persona } from "../content/personas.js";
import type { Product } from "../content/products.js";
import type { Buyer } from "../game/session.js";
import { BUYER_ACTIONS, EMOTIONS, type BuyerDecision, type GameState } from "../game/types.js";
import { buildSystemPrompt, buildTurnMessage } from "./prompts.js";

/** Rakenteinen vastaus. Numeerisia rajoja ei laiteta skeemaan, vaan pelimoottori rajaa arvot. */
export const BuyerDecisionSchema = z.object({
  reply: z.string(),
  emotion: z.enum(EMOTIONS),
  interest_delta: z.number(),
  suspicion_delta: z.number(),
  weakness_triggered: z.boolean(),
  action: z.enum(BUYER_ACTIONS),
  price_eur: z.number().nullable(),
});

/** Näytetään, jos malli kieltäytyy tai vastaus ei jäsenny. Ei kuluta peliä rikki. */
const CONFUSED: BuyerDecision = {
  reply: "Öö… anteeksi, mitä? En ihan pysynyt kärryillä.",
  emotion: "confused",
  interest_delta: 0,
  suspicion_delta: 5,
  weakness_triggered: false,
  action: "continue",
  price_eur: null,
};

export class BuyerUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class ClaudeBuyer implements Buyer {
  private readonly system: string;
  /** Keskusteluhistoria. Vain onnistuneet vuorot lisätään, joten epäonnistunut kutsu ei sotke historiaa. */
  private readonly history: Anthropic.Beta.BetaMessageParam[] = [];

  constructor(
    private readonly client: Anthropic,
    private readonly config: AiConfig,
    persona: Persona,
    product: Product,
  ) {
    this.system = buildSystemPrompt(persona, product);
  }

  async respond(state: GameState, sellerText: string): Promise<BuyerDecision> {
    const userMessage: Anthropic.Beta.BetaMessageParam = { role: "user", content: buildTurnMessage(state, sellerText) };
    const messages = [...this.history, userMessage];

    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.config.ANTHROPIC_MODEL,
        max_tokens: 8000,
        // Jos turvallisuusluokitin hylkää pyynnön, API ajaa sen automaattisesti varamallilla.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Matala effort = nopeat vastaukset; keskustelu ei vaadi syvää päättelyä.
        output_config: { effort: this.config.ANTHROPIC_EFFORT, format: betaZodOutputFormat(BuyerDecisionSchema) },
        system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
        messages,
      });
    } catch (err) {
      throw toBuyerError(err);
    }

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      console.warn(`Ostajan vastaus hylättiin (stop_reason=${response.stop_reason}).`);
      return CONFUSED;
    }

    const decision = response.parsed_output;
    // Historiaan tallennetaan ostajan vastaus tekstinä (JSON), jotta malli näkee aiemmat päätöksensä.
    this.history.push(userMessage, { role: "assistant", content: JSON.stringify(decision) });
    return decision;
  }
}

function toBuyerError(err: unknown): BuyerUnavailableError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new BuyerUnavailableError("Anthropic API-avain puuttuu tai on virheellinen.", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new BuyerUnavailableError("Liikaa pyyntöjä, odota hetki.", true);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new BuyerUnavailableError(`Virheellinen pyyntö: ${err.message}`, false);
  }
  if (err instanceof Anthropic.APIError) {
    return new BuyerUnavailableError(`API-virhe ${err.status ?? ""}: ${err.message}`, true);
  }
  return new BuyerUnavailableError(err instanceof Error ? err.message : String(err), true);
}

export function createClaudeBuyerFactory(config: AiConfig, client: Anthropic = new Anthropic()) {
  return (persona: Persona, product: Product): Buyer => new ClaudeBuyer(client, config, persona, product);
}
