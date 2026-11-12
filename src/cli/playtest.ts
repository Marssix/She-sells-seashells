/**
 * Terminaalipelitesti: pelaa kauppaa ilman Discordia.
 *   npm run play               satunnainen ostaja
 *   npm run play -- pirkko     valittu ostaja
 * Komennot pelin aikana: /hyvaksy, /hylkaa, /luovuta, /debug
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { createClaudeBuyerFactory, BuyerUnavailableError } from "../ai/buyer.js";
import { loadAiConfig } from "../config.js";
import { getPersona, personas } from "../content/personas.js";
import { products } from "../content/products.js";
import { computeScore, maxPrice } from "../game/engine.js";
import { GameSession } from "../game/session.js";
import type { GameEvent, GameState } from "../game/types.js";

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

const personaId = process.argv[2];
const persona = (personaId && getPersona(personaId)) || pick(personas);
const product = pick(products);
const aiConfig = loadAiConfig();
const session = new GameSession(persona, product, "terminal", createClaudeBuyerFactory(aiConfig)(persona, product));

const meters = (s: GameState) =>
  `💚 ${s.interest}  🔴 ${s.suspicion}  ⏳ ${s.turnsLeft}  💰 ${s.currentOffer ?? "-"}${s.weaknessFound ? "  ✨" : ""}`;

function printEvents(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === "weakness_found") console.log("   ✨ Heikkous löytyi!");
    if (e.type === "offer") console.log(`   💰 Tarjous ${e.priceEur} € (/hyvaksy)`);
    if (e.type === "offer_capped") console.log(`   💸 Pyydetty ${e.requestedEur} € → rajattu ${e.priceEur} €`);
    if (e.type === "final_offer") console.log(`   ⌛ Viimeinen tarjous ${e.priceEur} € (/hyvaksy tai /hylkaa)`);
    if (e.type === "action_blocked") console.log(`   🚫 Moottori esti: ${e.action} (${e.reason})`);
  }
}

console.log(`\n${persona.emoji} ${persona.name}, ${persona.age} v. – ${persona.intro}`);
console.log(`   Vihje: ${persona.weaknessHint}`);
console.log(`🎁 Myyt: ${product.name} – ${product.description} (arvo ${product.trueValueEur} €)`);
console.log(`🤖 ${aiConfig.ANTHROPIC_MODEL}, effort ${aiConfig.ANTHROPIC_EFFORT}\n`);
console.log(`${persona.name}: ${persona.greeting}`);
console.log(`   ${meters(session.state)}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

while (session.state.status !== "ended") {
  const input = (await rl.question("\nSinä: ")).trim();
  if (!input) continue;

  if (input === "/hyvaksy") printEvents(session.accept());
  else if (input === "/hylkaa") printEvents(session.declineFinal());
  else if (input === "/luovuta") printEvents(session.giveUp());
  else if (input === "/debug") console.log(`   maxPrice=${maxPrice(session.state)} €`, session.state.transcript.length, "riviä");
  else if (session.state.status === "final_offer") console.log("   Käytä /hyvaksy tai /hylkaa.");
  else {
    const started = Date.now();
    try {
      const { decision, events, state } = await session.handleSellerMessage(input);
      console.log(`\n${persona.name} (${decision.emotion}): ${decision.reply}`);
      console.log(`   ${meters(state)}   [${decision.action}${decision.price_eur !== null ? ` ${decision.price_eur} €` : ""}, ${Date.now() - started} ms]`);
      printEvents(events);
    } catch (err) {
      if (err instanceof BuyerUnavailableError) console.log(`   ⚠️  ${err.message}`);
      else throw err;
    }
  }
}

const score = computeScore(session.state);
console.log(`\n=== ${session.state.outcome?.type.toUpperCase()} ===`);
console.log(score.priceEur > 0 ? `Myyty ${score.priceEur} € (${score.ratio.toFixed(1)}×) → ${score.total} pistettä` : "0 pistettä");
if (!session.state.weaknessFound) console.log(`Heikkous: ${persona.weakness}`);
rl.close();
