import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadPersonas, loadProducts } from "../src/content/loader.js";
import { personas } from "../src/content/personas.js";
import { products } from "../src/content/products.js";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "kauppa-content-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const product = (over: Record<string, unknown> = {}) => ({
  id: "kivi",
  name: "Lemmikkikivi",
  description: "Kivi, jossa silmät.",
  trueValueEur: 0.2,
  absurdity: 2,
  ...over,
});

const writeProducts = (items: unknown[]) => writeFileSync(join(dir, "products.yaml"), JSON.stringify({ products: items }));

describe("projektin sisältötiedostot", () => {
  it("latautuvat ja läpäisevät tarkistuksen", () => {
    expect(personas.length).toBeGreaterThan(0);
    expect(products.length).toBeGreaterThan(0);
    expect(personas.map((p) => p.id)).toContain("pirkko");
  });
});

describe("loadProducts", () => {
  it("lukee kelvollisen tiedoston (YAML on JSONin ylijoukko)", () => {
    writeProducts([product()]);
    expect(loadProducts(dir)).toEqual([product()]);
  });

  it("kertoo virheellisen kentän polun ja syyn", () => {
    writeProducts([product(), product({ id: "Iso Kivi", absurdity: 5, trueValueEur: -1 })]);
    const err = (() => {
      try {
        loadProducts(dir);
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(ContentError);
    expect(err!.message).toContain("products.1.id");
    expect(err!.message).toContain("products.1.absurdity");
    expect(err!.message).toContain("products.1.trueValueEur");
  });

  it("hylkää saman id:n kahteen kertaan", () => {
    writeProducts([product(), product({ name: "Toinen kivi" })]);
    expect(() => loadProducts(dir)).toThrow(/id "kivi" on jo käytössä/);
  });

  it("antaa selkeän virheen puuttuvasta tiedostosta", () => {
    expect(() => loadProducts(dir)).toThrow(/ei voitu lukea/);
  });
});

describe("loadPersonas", () => {
  it("hylkää tuntemattoman Azure-äänen ja liian monta ostajaa", () => {
    const p = { ...personas[0]!, voice: { ...personas[0]!.voice, azure: { ...personas[0]!.voice.azure, name: "en-US-Jenny" } } };
    writeFileSync(join(dir, "personas.yaml"), JSON.stringify({ personas: [p] }));
    expect(() => loadPersonas(dir)).toThrow(/voice\.azure\.name/);

    const many = Array.from({ length: 26 }, (_, i) => ({ ...personas[0]!, id: `p${i}` }));
    writeFileSync(join(dir, "personas.yaml"), JSON.stringify({ personas: many }));
    expect(() => loadPersonas(dir)).toThrow(/personas/);
  });
});
