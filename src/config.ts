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

  ANTHROPIC_API_KEY: optional,

  STT_PROVIDER: z.enum(["deepgram", "azure"]).default("deepgram"),
  DEEPGRAM_API_KEY: optional,
  TTS_PROVIDER: z.enum(["elevenlabs", "azure"]).default("elevenlabs"),
  ELEVENLABS_API_KEY: optional,
  AZURE_SPEECH_KEY: optional,
  AZURE_SPEECH_REGION: z.string().default("northeurope"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Virheellinen konfiguraatio:\n${problems}\nKatso .env.example`);
  }
  return parsed.data;
}
