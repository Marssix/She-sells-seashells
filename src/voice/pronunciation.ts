/**
 * Ääntämiskorjaukset paikalliselle Piper-äänelle. Piper lukee kaiken suomalaisittain,
 * joten ostajien englanninkieliset slangisanat kirjoitetaan auki suomalaisella kirjoitusasulla.
 * Löydetty testeissä: "bro" kuului "joo", "deal" kuului "leal", "cringe" kuului "rinne".
 */
const WORDS: [RegExp, string][] = [
  [/\bbro\b/gi, "brou"],
  [/\bdeal\b/gi, "diil"],
  [/\bcringe\b/gi, "krinssi"],
  [/\bok\b/gi, "okei"],
  [/\bokay\b/gi, "okei"],
  [/\bgame changer\b/gi, "geim tseindzer"],
  [/\bto the moon\b/gi, "tu the muun"],
  [/\bscalable\b/gi, "skeilabol"],
  [/\bdisruptio/gi, "disruptio"],
  [/\bFOMO\b/g, "foumou"],
  [/\bTikTok(\w*)/g, "tiktok$1"],
  [/\bpodcast(\w*)/gi, "podkast$1"],
  [/\bvibe\b/gi, "vaib"],
  [/\bROI\b/g, "är ou ai"],
  [/\bNFT\b/g, "än äf tee"],
  [/\bwifi\b/gi, "waifai"],
];

/** Hinnat: "15 €" ja "15€" luetaan "15 euroa" (espeak lukee pelkän €-merkin muodossa "euro"). */
function prices(text: string): string {
  return text.replace(/(\d+(?:[.,]\d+)?)\s*€/g, "$1 euroa").replace(/€/g, "euroa");
}

export function forPiper(text: string): string {
  let out = prices(text);
  for (const [re, replacement] of WORDS) out = out.replace(re, replacement);
  return out;
}
