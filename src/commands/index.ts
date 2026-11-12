import { ping } from "./ping.js";
import type { Command } from "./types.js";

/** Kaikki botin slash-komennot. Uusi komento lisätään tähän listaan. */
export const commands: Command[] = [ping];

export const commandMap = new Map(commands.map((c) => [c.data.name, c]));
