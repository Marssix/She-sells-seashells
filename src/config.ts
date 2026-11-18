import "dotenv/config";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN puuttuu (.env)"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID puuttuu (.env)"),
  DISCORD_GUILD_ID: optional,

  DATABASE_PATH: optional.transform((v) => v ?? "data/kauppa.sqlite"),

  /** Pelejä per käyttäjä per vuorokausi (Suomen aikaa). 0 = ei rajaa. Suojaa tekoälyn käyttökuluilta. */
  DAILY_GAME_LIMIT: optional.transform((v, ctx) => {
    if (v === undefined) return 20;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "DAILY_GAME_LIMIT pitää olla kokonaisluku ≥ 0" });
      return z.NEVER;
    }
    return n;
  }),
  /** Pilkuilla erotetut Discord-käyttäjätunnukset, joita päiväraja ei koske (esim. ylläpitäjä). */
  LIMIT_EXEMPT_USER_IDS: optional.transform((v) => new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean))),

  ANTHROPIC_API_KEY: optional,

  /** whisper = paikallinen (speech/server.py), off = botti ei kuuntele. deepgram/azure eivät ole vielä toteutettuja. */
  STT_PROVIDER: z.enum(["whisper", "off", "deepgram", "azure"]).default("whisper"),
  DEEPGRAM_API_KEY: optional,
  /** piper = paikallinen (speech/server.py), azure = Azure Speech. elevenlabs ei ole vielä toteutettu. */
  TTS_PROVIDER: z.enum(["piper", "azure", "elevenlabs"]).default("piper"),
  /** Paikallisen puhepalvelun osoite. */
  SPEECH_URL: z.string().url().default("http://127.0.0.1:5005"),
  ELEVENLABS_API_KEY: optional,
  AZURE_SPEECH_KEY: optional,
  AZURE_SPEECH_REGION: z.string().default("northeurope"),
});

export type Config = z.infer<typeof EnvSchema>;

const AiEnvSchema = z.object({
  ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
});

export type AiConfig = z.infer<typeof AiEnvSchema>;

/** Tekoälyasetukset erikseen, jotta terminaalipelitesti toimii ilman Discord-tunnuksia. */
export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const clean = Object.fromEntries(
    Object.entries({ ANTHROPIC_MODEL: env.ANTHROPIC_MODEL, ANTHROPIC_EFFORT: env.ANTHROPIC_EFFORT }).filter(
      ([, v]) => v !== undefined && v.trim() !== "",
    ),
  );
  return AiEnvSchema.parse(clean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Virheellinen konfiguraatio:\n${problems}\nKatso .env.example`);
  }
  return parsed.data;
}
