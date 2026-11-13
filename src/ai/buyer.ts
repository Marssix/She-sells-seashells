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

/** Mallit, jotka tukevat palvelinpuolen varamallia (`fallbacks: "default"`). */
const SERVER_FALLBACK_MODELS = ["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"];

export function supportsServerFallback(model: string): boolean {
  return SERVER_FALLBACK_MODELS.includes(model);
}

/**
 * Ostaja ei pystynyt vastaamaan. `message` näytetään pelaajalle,
 * `detail` sisältää teknisen syyn lokia varten.
 */
export class BuyerUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly detail: string = message,
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
        // Vain osa malleista tukee tätä (ei esim. Haiku), muilla kieltäytyminen käsitellään alla.
        ...(supportsServerFallback(this.config.ANTHROPIC_MODEL)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
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

/** Muuntaa API-virheen pelaajalle ymmärrettäväksi viestiksi. Tarkimmasta yleisimpään. */
export function toBuyerError(err: unknown): BuyerUnavailableError {
  const detail = err instanceof Anthropic.APIError ? `API ${err.status ?? "?"}: ${err.message}` : err instanceof Error ? err.message : String(err);

  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new BuyerUnavailableError("Ostajan tekoälyyn ei saada yhteyttä: API-avain puuttuu tai on virheellinen. Ilmoita botin ylläpitäjälle.", false, detail);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new BuyerUnavailableError("Ostaja on hetken ruuhkautunut. Odota hetki ja yritä uudelleen.", true, detail);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new BuyerUnavailableError("Ostajalle lähteneessä pyynnössä oli virhe. Ilmoita botin ylläpitäjälle.", false, detail);
  }
  // Palvelinpuolen häiriöt (5xx), aikakatkaisut ja verkkovirheet: tilapäisiä.
  if (err instanceof Anthropic.APIConnectionError || (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)) {
    return new BuyerUnavailableError("Ostaja ei saanut yhteyttä: tekoälypalvelussa on hetkellinen häiriö. Yritä hetken päästä uudelleen.", true, detail);
  }
  if (err instanceof Anthropic.APIError) {
    return new BuyerUnavailableError("Ostaja ei pystynyt vastaamaan. Yritä uudelleen.", true, detail);
  }
  // Esim. puuttuvat tunnukset: SDK heittää tavallisen Errorin ennen pyyntöä.
  return new BuyerUnavailableError("Ostaja ei pystynyt vastaamaan. Jos tämä toistuu, ilmoita botin ylläpitäjälle.", true, detail);
}

/**
 * Uudelleenyritykset: SDK yrittää automaattisesti uudelleen 408/409/429/5xx-virheillä ja verkkovirheillä
 * kasvavalla viiveellä. Oletus 2 ei riittänyt lyhyisiin häiriöihin, joten käytetään 4:ää.
 * Aikakatkaisu per yritys pitää pelaajan odotuksen kohtuullisena.
 */
export const CLIENT_OPTIONS = { maxRetries: 4, timeout: 30_000 } as const;

export function createClaudeBuyerFactory(config: AiConfig, client: Anthropic = new Anthropic(CLIENT_OPTIONS)) {
  return (persona: Persona, product: Product): Buyer => new ClaudeBuyer(client, config, persona, product);
}
