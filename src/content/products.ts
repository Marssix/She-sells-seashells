/**
 * Myytävät tuotteet. Sisältö on tiedostossa content/products.yaml, ja se luetaan ja tarkistetaan
 * kerran, kun moduuli ladataan.
 */
import { loadProducts, type Product } from "./loader.js";

export type { Product };

export const products: Product[] = loadProducts();

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
