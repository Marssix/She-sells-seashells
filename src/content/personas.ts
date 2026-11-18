/**
 * Ostajat (persoonat). Sisältö on tiedostossa content/personas.yaml, ja se luetaan ja tarkistetaan
 * kerran, kun moduuli ladataan. Kenttien kuvaukset ovat YAML-tiedoston alussa ja tiedostossa loader.ts.
 */
import { z } from "zod";
import { AzureVoiceSchema, loadPersonas, PiperVoiceSchema, type Persona } from "./loader.js";

export type { Persona };
export type AzureVoice = z.infer<typeof AzureVoiceSchema>;
export type PiperVoice = z.infer<typeof PiperVoiceSchema>;
export type PersonaVoice = Persona["voice"];

export const personas: Persona[] = loadPersonas();

export function getPersona(id: string): Persona | undefined {
  return personas.find((p) => p.id === id);
}
