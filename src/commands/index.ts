import type { GameManager } from "../bot/games.js";
import { createKauppaCommand, kauppaData } from "./kauppa.js";
import { ping } from "./ping.js";
import type { Command } from "./types.js";

/** Komentojen määrittelyt rekisteröintiä varten (ei vaadi pelin riippuvuuksia). */
export const commandData = [ping.data, kauppaData];

/** Ajonaikaiset komennot. Uusi komento lisätään tähän ja commandData-listaan. */
export function buildCommands(games: GameManager): Map<string, Command> {
  const commands: Command[] = [ping, createKauppaCommand(games)];
  return new Map(commands.map((c) => [c.data.name, c]));
}
