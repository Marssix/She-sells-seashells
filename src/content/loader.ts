/**
 * Pelin sisältö (ostajat ja tuotteet) luetaan YAML-tiedostoista kansiosta content/.
 * Jokainen kenttä tarkistetaan käynnistyksessä, jotta kirjoitusvirhe ei kaada peliä kesken.
 * Kansion voi vaihtaa ympäristömuuttujalla CONTENT_DIR.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9-]+$/, "vain pienet kirjaimet a-z, numerot ja -");
const text = z.string().trim().min(1, "ei saa olla tyhjä");
const percent = z.string().regex(/^[+-]\d{1,2}%$/, 'muoto "+5%" tai "-10%"');
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const meter = z.number().int().min(0).max(100);

export const AzureVoiceSchema = z.object({
  name: z.enum(["fi-FI-SelmaNeural", "fi-FI-NooraNeural", "fi-FI-HarriNeural"]),
  pitch: percent,
  rate: percent,
});

export const PiperVoiceSchema = z.object({
  /** Puheen pituuskerroin: > 1 = hitaampi, < 1 = nopeampi. */
  lengthScale: z.number().min(0.5).max(2),
  /** Sävelkorkeuskerroin: > 1 = korkeampi, < 1 = matalampi. */
  pitch: z.number().min(0.6).max(1.6),
});

export const PersonaSchema = z.object({
  id: slug,
  name: text,
  age: z.number().int().min(1).max(120),
  emoji: text,
  intro: text,
  background: text,
  speechStyle: text,
  weakness: text,
  weaknessHint: text,
  weaknessTopic: text,
  budgetEur: z.number().positive(),
  difficulty: level,
  startInterest: meter,
  startSuspicion: meter,
  patienceTurns: z.number().int().min(1).max(30),
  greeting: text,
  voiceHint: text,
  voice: z.object({ azure: AzureVoiceSchema, piper: PiperVoiceSchema }),
});

export const ProductSchema = z.object({
  id: slug,
  name: text,
  description: text,
  trueValueEur: z.number().min(0),
  absurdity: level,
});

const uniqueIds = (items: { id: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `id "${item.id}" on jo käytössä` });
    seen.add(item.id);
  });
};

// Discord sallii komennon valintalistassa enintään 25 vaihtoehtoa.
const PersonasFile = z.object({ personas: z.array(PersonaSchema).min(1).max(25).superRefine(uniqueIds) });
const ProductsFile = z.object({ products: z.array(ProductSchema).min(1).superRefine(uniqueIds) });

export type Persona = z.infer<typeof PersonaSchema>;
export type Product = z.infer<typeof ProductSchema>;

export class ContentError extends Error {}

/** Oletuskansio: projektin juuren content/ (toimii sekä src/- että dist/-kansiosta ajettaessa). */
export function contentDir(): string {
  if (process.env.CONTENT_DIR) return resolve(process.env.CONTENT_DIR);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");
}

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  let data: unknown;
  try {
    data = parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new ContentError(`Sisältötiedostoa ${file} ei voitu lukea: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".") || "(juuri)"}: ${i.message}`).join("\n");
    throw new ContentError(`Virheellinen sisältötiedosto ${file}:\n${problems}`);
  }
  return result.data;
}

export function loadPersonas(dir = contentDir()): Persona[] {
  return readYaml(join(dir, "personas.yaml"), PersonasFile).personas;
}

export function loadProducts(dir = contentDir()): Product[] {
  return readYaml(join(dir, "products.yaml"), ProductsFile).products;
}
