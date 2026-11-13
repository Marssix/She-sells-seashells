import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { computeScore } from "../game/engine.js";
import type { GameState, Outcome } from "../game/types.js";

/** Yksi päättynyt kauppa tallennettuna. */
export interface RoundRecord {
  userId: string;
  guildId: string;
  personaId: string;
  productId: string;
  outcome: Outcome["type"];
  priceEur: number;
  trueValueEur: number;
  score: number;
  weaknessFound: boolean;
  turnsUsed: number;
  endedAt: string;
}

export interface PersonaRecord {
  personaId: string;
  played: number;
  sold: number;
}

export interface BestSale {
  productId: string;
  personaId: string;
  priceEur: number;
  trueValueEur: number;
  score: number;
}

export interface UserStats {
  played: number;
  sold: number;
  totalRevenueEur: number;
  totalScore: number;
  bestScore: number;
  weaknessesFound: number;
  outcomes: Partial<Record<Outcome["type"], number>>;
  perPersona: PersonaRecord[];
  bestSale: BestSale | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rounds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL,
  guild_id        TEXT    NOT NULL,
  persona_id      TEXT    NOT NULL,
  product_id      TEXT    NOT NULL,
  outcome         TEXT    NOT NULL,
  price_eur       REAL    NOT NULL,
  true_value_eur  REAL    NOT NULL,
  score           INTEGER NOT NULL,
  weakness_found  INTEGER NOT NULL,
  turns_used      INTEGER NOT NULL,
  ended_at        TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS rounds_user_guild ON rounds (guild_id, user_id);
`;

/** Muuntaa päättyneen pelin tallennettavaksi riviksi. */
export function toRoundRecord(state: GameState, guildId: string, endedAt = new Date()): RoundRecord {
  const score = computeScore(state);
  return {
    userId: state.sellerId,
    guildId,
    personaId: state.persona.id,
    productId: state.product.id,
    outcome: state.outcome?.type ?? "gave_up",
    priceEur: score.priceEur,
    trueValueEur: state.product.trueValueEur,
    score: score.total,
    weaknessFound: state.weaknessFound,
    turnsUsed: state.turn,
    endedAt: endedAt.toISOString(),
  };
}

/** Pelitilastot SQLite-tietokannassa (Noden sisäänrakennettu node:sqlite, ei lisäriippuvuuksia). */
export class StatsRepository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  recordRound(r: RoundRecord): void {
    this.db
      .prepare(
        `INSERT INTO rounds (user_id, guild_id, persona_id, product_id, outcome, price_eur, true_value_eur, score, weakness_found, turns_used, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.userId, r.guildId, r.personaId, r.productId, r.outcome, r.priceEur, r.trueValueEur, r.score, r.weaknessFound ? 1 : 0, r.turnsUsed, r.endedAt);
  }

  getUserStats(userId: string, guildId: string): UserStats {
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS played,
                SUM(outcome = 'sold') AS sold,
                COALESCE(SUM(price_eur), 0) AS revenue,
                COALESCE(SUM(score), 0) AS total_score,
                COALESCE(MAX(score), 0) AS best_score,
                COALESCE(SUM(weakness_found), 0) AS weaknesses
         FROM rounds WHERE guild_id = ? AND user_id = ?`,
      )
      .get(guildId, userId) as Record<string, number | null>;

    const outcomeRows = this.db
      .prepare(`SELECT outcome, COUNT(*) AS n FROM rounds WHERE guild_id = ? AND user_id = ? GROUP BY outcome`)
      .all(guildId, userId) as { outcome: Outcome["type"]; n: number }[];

    const personaRows = this.db
      .prepare(
        `SELECT persona_id AS personaId, COUNT(*) AS played, SUM(outcome = 'sold') AS sold
         FROM rounds WHERE guild_id = ? AND user_id = ? GROUP BY persona_id ORDER BY played DESC, persona_id`,
      )
      .all(guildId, userId) as unknown as PersonaRecord[];

    const best = this.db
      .prepare(
        `SELECT product_id AS productId, persona_id AS personaId, price_eur AS priceEur, true_value_eur AS trueValueEur, score
         FROM rounds WHERE guild_id = ? AND user_id = ? AND outcome = 'sold'
         ORDER BY score DESC, price_eur DESC, id ASC LIMIT 1`,
      )
      .get(guildId, userId) as BestSale | undefined;

    return {
      played: Number(totals.played ?? 0),
      sold: Number(totals.sold ?? 0),
      totalRevenueEur: Number(totals.revenue ?? 0),
      totalScore: Number(totals.total_score ?? 0),
      bestScore: Number(totals.best_score ?? 0),
      weaknessesFound: Number(totals.weaknesses ?? 0),
      outcomes: Object.fromEntries(outcomeRows.map((r) => [r.outcome, Number(r.n)])),
      perPersona: personaRows.map((r) => ({ personaId: r.personaId, played: Number(r.played), sold: Number(r.sold ?? 0) })),
      bestSale: best ? { ...best } : null,
    };
  }

  /** Poistaa käyttäjän kaikki tiedot tältä palvelimelta. Palauttaa poistettujen rivien määrän. */
  deleteUser(userId: string, guildId: string): number {
    const result = this.db.prepare(`DELETE FROM rounds WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    return Number(result.changes);
  }

  close(): void {
    this.db.close();
  }
}
